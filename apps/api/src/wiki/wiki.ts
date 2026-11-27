import { putObject, readObject, removeObject } from "./objects.js";
import { attachmentInput, scanAttachment } from "./attachments.js";
import { createHash, randomUUID } from "node:crypto";
import { sql, type TenantTransaction } from "@km/foundation";
import { assess, localMember, type Action } from "../identity/policy.js";
import { id, input, string, IdentityError } from "../identity/security.js";
import { audit, changeEpoch, type Actor } from "../identity/sessions.js";

type Body = Record<string, unknown>;
type Block = { id: string; text: string };
function parseBlocks(value: unknown): Block[] {
  if (!Array.isArray(value) || value.length > 300) throw invalid();
  const blocks = value.map((item: unknown) => {
    const entry = input(item);
    return { id: id(entry.id), text: document(entry.text) };
  });
  if (
    new Set(blocks.map((block) => block.id)).size !== blocks.length ||
    blocks.map((block) => block.text).join("\n").length > 50000
  )
    throw invalid();
  return blocks;
}

type Page = {
  id: string;
  space_id: string;
  position: number;
  parent_id: string | null;
  title: string;
  content: string;
  blocks: Block[];
  tags: string[];
  category: string | null;
  metadata: Body;
  revision: number;
  owner_id: string | null;
  deleted_batch: string | null;
  author_id: string | null;
  classification: string;
  updated_at: Date;
};

const missing = () => new IdentityError(404);
const invalid = () => new IdentityError(400);
const optionalId = (value: unknown) => (value == null ? null : id(value));
const document = (value: unknown) =>
  value === "" || value === undefined ? "" : string(value, 50000);
const classification = (value: unknown) => {
  const result = value === undefined ? "internal" : string(value);
  if (!["public", "internal", "confidential", "restricted"].includes(result))
    throw invalid();
  return result;
};
function tags(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) throw invalid();
  return [...new Set(value.map((tag: unknown) => string(tag, 64)))];
}

export class Wiki {
  private readonly removals = new Set<string>();
  private readonly writes = new Set<string>();

  async finishObjects(committed: boolean) {
    const keys = committed ? this.removals : this.writes;
    for (const key of keys) {
      try {
        await removeObject(this.tenant, key);
      } catch {
        console.error(JSON.stringify({ event: "wiki.object_cleanup_failed" }));
      }
    }
  }

  constructor(
    private readonly tx: TenantTransaction,
    private readonly tenant: string,
    private readonly actor: Actor,
  ) {}

  private can(action: Action, resource: string | null) {
    return assess(this.tx, this.tenant, this.actor, {
      action,
      resource,
      channel: "web",
      purpose: "default",
      external: false,
    });
  }
  private async require(action: Action, resource: string | null) {
    if (!(await this.can(action, resource))) throw missing();
  }
  private get member() {
    return this.actor.kind === "member" ? this.actor.member.id : null;
  }
  private event(event: string, resource: string) {
    return audit(
      this.tx,
      this.tenant,
      this.member,
      "wiki." + event,
      "success",
      resource,
    );
  }
  private async resource(key: string, parent: string | null, level: string) {
    await sql`insert into km.identity_resources (tenant_id,id,parent_id,classification)
      values (${this.tenant},${key},${parent},${level})`.execute(this.tx);
  }
  private async page(
    key: string,
    action: Action = "content.read",
    deleted = false,
  ) {
    await this.require(action, key);
    const row = (
      await sql<Page>`select p.*,r.classification from km.wiki_pages p
      join km.identity_resources r using (tenant_id,id)
      where id=${key} and (deleted_batch is null or ${deleted})`.execute(
        this.tx,
      )
    ).rows[0];
    if (!row) throw missing();
    return row;
  }
  private async space(key: string, action: Action) {
    await this.require(action, key);
    const row = (
      await sql<{
        id: string;
      }>`select id from km.wiki_spaces where id=${key} and deleted_batch is null`.execute(
        this.tx,
      )
    ).rows[0];
    if (!row) throw missing();
  }
  private async destination(space: string, parent: string | null) {
    await this.space(space, "content.edit");
    if (parent && (await this.page(parent, "content.edit")).space_id !== space)
      throw invalid();
  }
  private async subtree(root: string) {
    return (
      await sql<{ id: string; parent_id: string | null; depth: number }>`
      with recursive tree(id,parent_id,depth) as (
        select id,parent_id,0 from km.wiki_pages where id=${root} and deleted_batch is null
        union all select p.id,p.parent_id,t.depth+1 from km.wiki_pages p join tree t on t.id=p.parent_id
        where p.deleted_batch is null
      ) select * from tree order by depth limit 101
    `.execute(this.tx)
    ).rows;
  }
  private async insertionPosition(
    space: string,
    parent: string | null,
    position: unknown,
    moving: string | null = null,
  ) {
    const siblings = (
      await sql<{
        id: string;
        position: number;
      }>`select id,position from km.wiki_pages where space_id=${space} and
      parent_id is not distinct from ${parent}::uuid and deleted_batch is null and id is distinct from ${moving}::uuid
      order by position,id`.execute(this.tx)
    ).rows;
    if (position === undefined) return (siblings.at(-1)?.position ?? -1) + 1;
    for (const sibling of siblings)
      await this.require("content.acl.manage", sibling.id);
    const index = position;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > siblings.length
    )
      throw invalid();
    const ids = siblings.map((sibling) => sibling.id);
    await sql`update km.wiki_pages p set position=(s.ordinal-1+case when s.ordinal>${index}::integer then 1 else 0 end)::integer
      from unnest(${ids}::uuid[]) with ordinality as s(id,ordinal) where p.id=s.id`.execute(
      this.tx,
    );
    return index;
  }

  private async validateMetadata(space: string, metadata: Body) {
    const schema =
      (
        await sql<{
          metadata_schema: Body;
        }>`select metadata_schema from km.wiki_spaces where id=${space}`.execute(
          this.tx,
        )
      ).rows[0]?.metadata_schema ?? {};
    if (!Object.keys(schema).length) return;
    for (const [field, value] of Object.entries(metadata)) {
      if (
        !(field in schema) ||
        !Object.hasOwn(schema, field) ||
        value === null ||
        typeof value !== schema[field]
      )
        throw invalid();
    }
  }

  private metadataSchema(value: unknown) {
    const fields = input(value);
    if (Object.keys(fields).length > 40) throw invalid();
    for (const [name, kind] of Object.entries(fields)) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) ||
        !["string", "boolean", "number"].includes(String(kind))
      )
        throw invalid();
    }
    return fields;
  }

  private async createPage(body: Body) {
    const space = id(body.spaceId);
    const parent = optionalId(body.parentId);
    await this.destination(space, parent);
    const key = randomUUID();
    const level = classification(body.classification);
    let content = document(body.content);
    let metadata = body.metadata === undefined ? {} : input(body.metadata);
    if (body.templateId !== undefined) {
      const template = (await this.templates(id(body.templateId))).find(
        (t) =>
          body.templateRevision === undefined ||
          t.revision === body.templateRevision,
      );
      if (!template || (template.space_id && template.space_id !== space))
        throw missing();
      content = body.content === undefined ? template.content : content;
      metadata = { ...template.fields, ...metadata };
    }
    const blocks = body.blocks === undefined ? [] : parseBlocks(body.blocks);
    if (body.blocks !== undefined)
      content = blocks.map((block) => block.text).join("\n");
    await this.validateMetadata(space, metadata);
    const position = await this.insertionPosition(space, parent, body.position);
    await this.resource(key, parent ?? space, level);
    await sql`insert into km.wiki_pages(tenant_id,id,space_id,parent_id,position,title,content,blocks,tags,category,metadata,owner_id,author_id)
      values (${this.tenant},${key},${space},${parent},${position},${string(body.title)},${content},${JSON.stringify(blocks)}::jsonb,
      ${tags(body.tags)}::text[],${body.category == null ? null : string(body.category)},${JSON.stringify(metadata)}::jsonb,${optionalId(body.ownerId)},${this.member})`.execute(
      this.tx,
    );
    await this.event("page.create", key);
    return { id: key, revision: 1 };
  }
  private async list(query: URLSearchParams) {
    const term = query.get("q");
    if (term && term.length > 120) throw invalid();
    const space = optionalId(query.get("spaceId"));
    const author = optionalId(query.get("authorId"));
    const tag = query.get("tag");
    const since = query.get("since");
    const until = query.get("until");
    for (const date of [since, until])
      if (date && !Number.isFinite(Date.parse(date))) throw invalid();
    const candidates = (
      await sql<{ id: string }>`
      select id from km.wiki_pages where deleted_batch is null and (${space}::uuid is null or space_id=${space})
    `.execute(this.tx)
    ).rows;
    const allowed = [];
    for (const { id } of candidates)
      if (await this.can("content.read", id)) allowed.push(id);
    if (!allowed.length) return [];
    const rows = (
      await sql<Page>`select p.*,r.classification from km.wiki_pages p join km.identity_resources r using (tenant_id,id)
      where p.deleted_batch is null and p.id=any(${allowed}::uuid[])
      and (${author}::uuid is null or p.author_id=${author})
      and (${tag}::text is null or ${tag}=any(p.tags))
      and (${since}::timestamptz is null or updated_at>=${since}::timestamptz)
      and (${until}::timestamptz is null or updated_at<=${until}::timestamptz)
      and (${term}::text is null or strpos(lower(title || ' ' || content),lower(${term}::text))>0)
      order by case when ${query.get("sort")}::text='relevance' then strpos(lower(title),lower(coalesce(${term}::text,'')))>0 end desc nulls last,
      updated_at desc,id desc limit 100`.execute(this.tx)
    ).rows;
    const visible = [];
    for (const row of rows) {
      const {
        content,
        blocks: _blocks,
        ...summary
      } = await this.visiblePage(row);
      void _blocks;
      const position = term
        ? content.toLowerCase().indexOf(term.toLowerCase())
        : -1;
      visible.push({
        ...summary,
        snippet:
          position < 0
            ? null
            : content.slice(Math.max(0, position - 30), position + 120),
      });
    }
    return visible;
  }
  private async moveOrDuplicate(root: Page, body: Body, duplicate: boolean) {
    const space = id(body.spaceId);
    const parent = optionalId(body.parentId);
    await this.destination(space, parent);
    const tree = await this.subtree(root.id);
    if (
      tree.length > 100 ||
      (!duplicate && tree.some((node) => node.id === parent))
    )
      throw new IdentityError(409);
    for (const node of tree) {
      await this.require("content.read", node.id);
      // Reparenting changes inherited grants, so require ACL authority on every affected node.
      await this.require("content.acl.manage", node.id);
    }
    await this.require("content.acl.manage", parent ?? space);
    const position = await this.insertionPosition(
      space,
      parent,
      body.position,
      duplicate ? null : root.id,
    );
    if (!duplicate) {
      await sql`update km.wiki_pages set space_id=${space} where id=any(${tree.map((node) => node.id)}::uuid[])`.execute(
        this.tx,
      );
      await sql`update km.wiki_pages set parent_id=${parent},position=${position},revision=revision+1,updated_at=now() where id=${root.id}`.execute(
        this.tx,
      );
      await sql`update km.identity_resources set parent_id=${parent ?? space} where id=${root.id}`.execute(
        this.tx,
      );
      await changeEpoch(this.tx, this.tenant);
      return { id: root.id };
    }
    const copies = new Map(tree.map((node) => [node.id, randomUUID()]));
    for (const node of tree) {
      const key = copies.get(node.id)!;
      const destination =
        node.id === root.id ? parent : copies.get(node.parent_id!)!;
      const source = await this.page(node.id);
      await this.resource(key, destination ?? space, source.classification);
      await sql`insert into km.wiki_pages(tenant_id,id,space_id,parent_id,position,title,content,blocks,tags,category,metadata,owner_id,author_id)
        select tenant_id,${key},${space},${destination},case when id=${root.id} then ${position}::integer else position end,title,content,blocks,tags,category,metadata,owner_id,${this.member}
        from km.wiki_pages where id=${node.id}`.execute(this.tx);
    }
    return { id: copies.get(root.id) };
  }
  private async visiblePage(page: Page) {
    return {
      ...page,
      parent_id:
        page.parent_id && (await this.can("content.read", page.parent_id))
          ? page.parent_id
          : null,
      space_id: (await this.can("content.read", page.space_id))
        ? page.space_id
        : null,
    };
  }

  private async spaceLifecycle(key: string, restore: boolean) {
    await this.require("content.acl.manage", key);
    const row = (
      await sql<{ deleted_batch: string | null }>`
      select deleted_batch from km.wiki_spaces where id=${key}
      and (${restore} = (deleted_batch is not null))
      and (not ${restore} or deleted_at>now()-coalesce((select retention_days from km.wiki_settings),30)*interval '1 day')
    `.execute(this.tx)
    ).rows[0];
    if (!row) throw missing();
    const children = (
      await sql<{
        id: string;
      }>`select id from km.wiki_pages where space_id=${key}
      and (case when ${restore} then deleted_batch=${key} else deleted_batch is null end)`.execute(
        this.tx,
      )
    ).rows;
    for (const child of children)
      await this.require("content.acl.manage", child.id);
    await sql`update km.wiki_pages set deleted_batch=case when ${restore} then null else ${key}::uuid end,
      deleted_at=case when ${restore} then null else now() end where id=any(${children.map((c) => c.id)}::uuid[])`.execute(
      this.tx,
    );
    await sql`update km.wiki_spaces set deleted_batch=case when ${restore} then null else id end,
      deleted_at=case when ${restore} then null else now() end where id=${key}`.execute(
      this.tx,
    );
    await changeEpoch(this.tx, this.tenant);
    await this.event(restore ? "space.restore" : "space.trash", key);
    return { id: key };
  }

  private async templates(key?: string) {
    const rows = (
      await sql<{
        id: string;
        space_id: string | null;
        revision: number;
        title: string;
        content: string;
        fields: Body;
      }>`
      select id,space_id,revision,title,content,fields from km.wiki_templates
      where (${key ?? null}::uuid is null or id=${key ?? null}) order by revision desc,id
    `.execute(this.tx)
    ).rows;
    const visible = [];
    for (const row of rows)
      if (await this.can("content.read", row.space_id)) visible.push(row);
    return visible;
  }

  async dispatch(
    method: string,
    path: string,
    body: Body,
    query: URLSearchParams,
  ): Promise<unknown> {
    if (method !== "GET") {
      await sql`select pg_advisory_xact_lock(71189004,hashtext(${this.tenant}))`.execute(
        this.tx,
      );
    }
    if (path === "/v1/wiki/trash" && method === "GET") {
      const rows = (
        await sql<{ id: string; kind: string; deleted_at: Date }>`
        select id,'page' kind,deleted_at from km.wiki_pages where deleted_batch=id
        union all select id,'space',deleted_at from km.wiki_spaces where deleted_batch=id
        order by deleted_at desc`.execute(this.tx)
      ).rows;
      const visible = [];
      for (const row of rows)
        if (await this.can("content.acl.manage", row.id)) visible.push(row);
      return visible;
    }
    if (path === "/v1/wiki/settings" && method === "PATCH") {
      await this.require("content.acl.manage", null);
      const days = body.retentionDays;
      if (
        typeof days !== "number" ||
        !Number.isInteger(days) ||
        days < 1 ||
        days > 3650
      )
        throw invalid();
      await sql`insert into km.wiki_settings values(${this.tenant},${days})
        on conflict(tenant_id) do update set retention_days=excluded.retention_days`.execute(
        this.tx,
      );
      await this.event("settings.update", this.tenant);
      return { retentionDays: days };
    }
    const schemaRoute = /^\/v1\/wiki\/metadata-schemas\/([^/]+)$/.exec(path);
    if (schemaRoute) {
      const space = id(schemaRoute[1]);
      if (method === "GET") {
        await this.space(space, "content.read");
        return (
          await sql`select metadata_schema as fields from km.wiki_spaces where id=${space}`.execute(
            this.tx,
          )
        ).rows[0];
      }
      if (method === "PATCH") {
        await this.space(space, "content.acl.manage");
        const fields = this.metadataSchema(body.fields);
        await sql`update km.wiki_spaces set metadata_schema=${JSON.stringify(fields)}::jsonb where id=${space}`.execute(
          this.tx,
        );
        await this.event("metadata.update", space);
        return { fields };
      }
    }
    const trashOperation = /^\/v1\/wiki\/trash\/([^/]+)\/(restore|purge)$/.exec(
      path,
    );
    if (trashOperation && method === "POST") {
      const key = id(trashOperation[1]);
      const space = body.kind === "space";
      if (body.kind !== "space" && body.kind !== "page") throw invalid();
      if (trashOperation[2] === "purge") {
        if (body.confirm !== key || !localMember(this.actor).stepped_up)
          throw new IdentityError(403);
        return this.purge(key, space);
      }
      return space ? this.spaceLifecycle(key, true) : this.restore(key);
    }
    const transfer = /^\/v1\/wiki\/(import|export)-jobs(?:\/([^/]+))?$/.exec(
      path,
    );
    if (transfer)
      return this.transfer(
        transfer[1] === "import" ? "import" : "export",
        method,
        body,
        transfer[2],
      );
    if (path === "/v1/wiki/mentions" && method === "GET") {
      const member = localMember(this.actor).id;
      const rows = (
        await sql<{ id: string; page_id: string; created_at: Date }>`
        select c.id,c.page_id,c.created_at from km.wiki_comments c join km.wiki_pages p
        on p.tenant_id=c.tenant_id and p.id=c.page_id
        where ${member}::uuid=any(c.mentions) and p.deleted_batch is null order by c.created_at desc
      `.execute(this.tx)
      ).rows;
      const visible = [];
      for (const row of rows)
        if (await this.can("content.read", row.page_id)) visible.push(row);
      return visible.slice(0, 100);
    }
    if (path === "/v1/wiki/spaces") {
      if (method === "GET") {
        const result = [];
        const rows = (
          await sql<{
            id: string;
            title: string;
          }>`select id,title,metadata_schema from km.wiki_spaces where deleted_batch is null order by title,id`.execute(
            this.tx,
          )
        ).rows;
        for (const row of rows)
          if (await this.can("content.read", row.id)) result.push(row);
        return result;
      }
      if (method === "POST") {
        await this.require("content.edit", null);
        const key = randomUUID();
        await this.resource(key, null, classification(body.classification));
        await sql`insert into km.wiki_spaces(tenant_id,id,title,metadata_schema) values
          (${this.tenant},${key},${string(body.title)},${JSON.stringify(body.metadataSchema === undefined ? {} : this.metadataSchema(body.metadataSchema))}::jsonb)`.execute(
          this.tx,
        );
        await this.event("space.create", key);
        return { id: key };
      }
    }
    const spaceOperation = /^\/v1\/wiki\/spaces\/([^/]+)(\/restore)?$/.exec(
      path,
    );
    if (spaceOperation) {
      if (method === "DELETE" && !spaceOperation[2])
        return this.spaceLifecycle(id(spaceOperation[1]), false);
      if (method === "POST" && spaceOperation[2])
        return this.spaceLifecycle(id(spaceOperation[1]), true);
    }
    if (path === "/v1/wiki/pages" && method === "GET") return this.list(query);
    if (path === "/v1/wiki/pages" && method === "POST")
      return this.createPage(body);
    const template = /^\/v1\/wiki\/templates(?:\/([^/]+))?$/.exec(path);
    if (template) {
      const key = template[1] ? id(template[1]) : undefined;
      if (method === "GET") return this.templates(key);
      if (method === "POST") {
        const prior = key ? (await this.templates(key))[0] : undefined;
        if (key && !prior) throw missing();
        const space = prior ? prior.space_id : optionalId(body.spaceId);
        if (space) await this.space(space, "content.edit");
        else await this.require("content.edit", null);
        const revision = (prior?.revision ?? 0) + 1;
        const templateId = key ?? randomUUID();
        await sql`insert into km.wiki_templates values
          (${this.tenant},${templateId},${revision},${space},${string(body.title)},${document(body.content)},
          ${JSON.stringify(body.fields === undefined ? {} : input(body.fields))}::jsonb)`.execute(
          this.tx,
        );
        return { id: templateId, revision };
      }
    }
    const match =
      /^\/v1\/wiki\/pages\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path);
    if (!match) throw missing();
    const key = id(match[1]);
    const [section, leaf] = [match[2], match[3]];
    if (section === "restore" && method === "POST") return this.restore(key);
    const page = await this.page(key);
    if (!section && method === "GET") {
      await this.event("page.read", key);
      return this.visiblePage(page);
    }
    if (!section && method === "PATCH") {
      await this.require("content.edit", key);
      if (body.revision !== page.revision) throw new IdentityError(409);
      if (body.classification !== undefined) {
        await this.require("content.acl.manage", key);
        await sql`update km.identity_resources set classification=${classification(body.classification)} where id=${key}`.execute(
          this.tx,
        );
        await changeEpoch(this.tx, this.tenant);
      }
      if (body.metadata !== undefined)
        await this.validateMetadata(page.space_id, input(body.metadata));
      const blocks =
        body.blocks !== undefined
          ? parseBlocks(body.blocks)
          : body.content === undefined
            ? page.blocks
            : [];
      const content =
        body.blocks !== undefined
          ? blocks.map((block) => block.text).join("\n")
          : body.content === undefined
            ? page.content
            : document(body.content);
      await sql`update km.wiki_pages set title=${body.title === undefined ? page.title : string(body.title)},
        content=${content},blocks=${JSON.stringify(blocks)}::jsonb,
        tags=${body.tags === undefined ? page.tags : tags(body.tags)}::text[],
        category=${body.category === undefined ? page.category : body.category === null ? null : string(body.category)},
        metadata=${JSON.stringify(body.metadata === undefined ? page.metadata : input(body.metadata))}::jsonb,
        owner_id=${body.ownerId === undefined ? page.owner_id : optionalId(body.ownerId)},
        revision=revision+1,updated_at=now() where id=${key}`.execute(this.tx);
      await this.event("page.update", key);
      return { id: key, revision: page.revision + 1 };
    }
    if (!section && method === "DELETE") return this.trash(key);
    if ((section === "move" || section === "duplicate") && method === "POST") {
      const result = await this.moveOrDuplicate(
        page,
        body,
        section === "duplicate",
      );
      await this.event("page." + section, key);
      return result;
    }
    if (section === "relations") return this.relations(key, method, body, leaf);
    if (section === "comments") return this.comments(page, method, body, leaf);
    if (section === "attachments")
      return this.attachments(key, method, body, leaf);
    throw missing();
  }

  private async transfer(
    kind: "import" | "export",
    method: string,
    body: Body,
    leaf?: string,
  ) {
    const principal =
      this.actor.kind === "member"
        ? this.actor.member.id
        : this.actor.service.id;
    if (method === "POST" && !leaf) {
      const format = string(body.format);
      if (format !== "markdown" && (kind !== "export" || format !== "html"))
        throw invalid();
      const keys: string[] = [];
      if (kind === "import") {
        const items = body.items;
        const spaceId = id(body.spaceId);
        if (!Array.isArray(items) || !items.length || items.length > 20)
          throw invalid();
        for (const [index, value] of items.entries()) {
          const item = input(value);
          const position = item.parentIndex;
          const parentId =
            position === undefined
              ? optionalId(body.parentId)
              : typeof position === "number" &&
                  Number.isInteger(position) &&
                  position >= 0 &&
                  position < index
                ? keys[position]
                : undefined;
          if (parentId === undefined) throw invalid();
          keys.push(
            (
              await this.createPage({
                title: item.title,
                content: item.content,
                spaceId,
                parentId,
              })
            ).id,
          );
        }
      } else {
        const ids = body.pageIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 20)
          throw invalid();
        for (const key of new Set(ids.map(id))) {
          await this.page(key);
          keys.push(key);
        }
      }
      const job = randomUUID();
      await sql`insert into km.wiki_transfer_jobs values
        (${this.tenant},${job},${principal},${this.actor.kind},${kind},${format},${keys}::uuid[])`.execute(
        this.tx,
      );
      await this.event(kind + ".create", job);
      return { id: job, status: "completed" };
    }
    if (method === "GET" && leaf) {
      const key = id(leaf);
      const item = (
        await sql<{
          format: string;
          target_ids: string[];
        }>`select format,target_ids from km.wiki_transfer_jobs where
        id=${key} and kind=${kind} and principal_id=${principal} and principal_kind=${this.actor.kind}`.execute(
          this.tx,
        )
      ).rows[0];
      if (!item) throw missing();
      const pages: Page[] = [];
      for (const page of item.target_ids) pages.push(await this.page(page));
      const manifest = {
        format: item.format,
        losses: ["attachments", "comments", "access-control", "relations"],
        contentBasis: "current-authorized-draft",
      };
      if (kind === "import")
        return {
          id: key,
          status: "completed",
          items: item.target_ids.map((id) => ({ id, state: "draft" })),
          manifest,
        };
      const escape = (text: string) =>
        text
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      await this.event("export.download", key);
      return {
        id: key,
        status: "completed",
        documents: pages.map((page) => ({
          id: page.id,
          revision: page.revision,
          title: page.title,
          data:
            item.format === "html"
              ? "<!doctype html><meta charset=utf-8><h1>" +
                escape(page.title) +
                "</h1><pre>" +
                escape(page.content) +
                "</pre>"
              : page.content,
        })),
        manifest,
      };
    }
    throw missing();
  }

  private async purge(key: string, space: boolean) {
    await this.require("content.acl.manage", key);
    if (space) {
      const found =
        await sql`select id from km.wiki_spaces where id=${key} and deleted_batch=id`.execute(
          this.tx,
        );
      if (!found.rows.length) throw missing();
    } else {
      const root = await this.page(key, "content.acl.manage", true);
      if (root.deleted_batch !== key) throw missing();
    }
    const affected = (
      await sql<{ id: string }>`
      with recursive tree(id) as (
       select id from km.wiki_pages where case when ${space} then space_id=${key} else id=${key} end
       union select p.id from km.wiki_pages p join tree on p.parent_id=tree.id
      ) select id from tree`.execute(this.tx)
    ).rows;
    for (const row of affected)
      await this.require("content.acl.manage", row.id);
    const pages = affected.map((row) => row.id);
    const tombstones = space ? [key, ...pages] : pages;
    await sql`insert into km.wiki_tombstones (tenant_id,id)
      select ${this.tenant},id from unnest(${tombstones}::uuid[]) as t(id) on conflict do nothing`.execute(
      this.tx,
    );
    await sql`delete from km.wiki_relations where source_id=any(${pages}::uuid[]) or target_id=any(${pages}::uuid[])`.execute(
      this.tx,
    );
    await sql`delete from km.wiki_comments where page_id=any(${pages}::uuid[])`.execute(
      this.tx,
    );
    const objects = await sql<{
      id: string;
      object_size: number | null;
    }>`delete from km.wiki_attachments
      where page_id=any(${pages}::uuid[]) returning id,object_size`.execute(
      this.tx,
    );
    for (const file of objects.rows)
      if (file.object_size !== null) this.removals.add(file.id);
    await sql`delete from km.wiki_pages where id=any(${pages}::uuid[])`.execute(
      this.tx,
    );
    if (space) {
      await sql`delete from km.wiki_templates where space_id=${key}`.execute(
        this.tx,
      );
      await sql`delete from km.wiki_spaces where id=${key}`.execute(this.tx);
    }
    await changeEpoch(this.tx, this.tenant);
    await this.event("trash.purge", key);
    return { id: key };
  }

  private async trash(key: string) {
    const tree = await this.subtree(key);
    if (tree.length > 100) throw new IdentityError(409);
    for (const item of tree) await this.require("content.acl.manage", item.id);
    await sql`update km.wiki_pages set deleted_batch=${key},deleted_at=now()
      where id=any(${tree.map((node) => node.id)}::uuid[])`.execute(this.tx);
    await changeEpoch(this.tx, this.tenant);
    await this.event("page.trash", key);
    return { id: key };
  }
  private async restore(key: string) {
    const root = await this.page(key, "content.acl.manage", true);
    if (root.deleted_batch !== key) throw missing();
    await this.space(root.space_id, "content.edit");
    if (root.parent_id) await this.page(root.parent_id, "content.edit");
    const batch = (
      await sql<{
        id: string;
      }>`select id from km.wiki_pages where deleted_batch=${key}
      and deleted_at>now()-coalesce((select retention_days from km.wiki_settings),30)*interval '1 day'`.execute(
        this.tx,
      )
    ).rows;
    if (!batch.length) throw missing();
    for (const item of batch) await this.require("content.acl.manage", item.id);
    await sql`update km.wiki_pages set deleted_batch=null,deleted_at=null where deleted_batch=${key}`.execute(
      this.tx,
    );
    await changeEpoch(this.tx, this.tenant);
    await this.event("page.restore", key);
    return { id: key };
  }
  private async relations(
    key: string,
    method: string,
    body: Body,
    leaf?: string,
  ) {
    if (method === "GET") {
      const rows = (
        await sql<{
          id: string;
          source_id: string;
          target_id: string;
          kind: string;
          broken: boolean;
        }>`
        select r.id,r.source_id,r.target_id,r.kind, other.deleted_batch is not null as broken
        from km.wiki_relations r join km.wiki_pages other on other.tenant_id=r.tenant_id
        and other.id=case when r.source_id=${key} then r.target_id else r.source_id end
        where r.source_id=${key} or r.target_id=${key}`.execute(this.tx)
      ).rows;
      const result = [];
      for (const row of rows)
        if (
          await this.can(
            "content.read",
            row.source_id === key ? row.target_id : row.source_id,
          )
        )
          result.push(row);
      return result;
    }
    await this.require("content.edit", key);
    if (method === "POST") {
      const target = await this.page(id(body.targetId));
      const kind = string(body.type);
      if (
        !["dependency", "complement", "replacement", "reference"].includes(
          kind,
        ) ||
        target.id === key
      )
        throw invalid();
      const relation = randomUUID();
      await sql`insert into km.wiki_relations values (${this.tenant},${relation},${key},${target.id},${kind})`.execute(
        this.tx,
      );
      await this.event("relation.create", key);
      return { id: relation };
    }
    if (method === "DELETE" && leaf) {
      const row =
        await sql`delete from km.wiki_relations where id=${id(leaf)} and source_id=${key} returning id`.execute(
          this.tx,
        );
      if (!row.rows.length) throw missing();
      return { id: leaf };
    }
    throw missing();
  }
  private async comments(
    page: Page,
    method: string,
    body: Body,
    leaf?: string,
  ) {
    const key = page.id;
    const blocks = page.blocks.map((block) => block.id);
    if (method === "GET")
      return (
        await sql`select id,root_id,actor_id,anchor,body,resolved,history,created_at,(anchor is not null and not (anchor=any(${blocks}::uuid[]))) as orphaned
      from km.wiki_comments where page_id=${key} order by created_at,id`.execute(
          this.tx,
        )
      ).rows;
    await this.require("content.comment", key);
    const member = localMember(this.actor).id;
    if (method === "POST") {
      const comment = randomUUID();
      const root = optionalId(body.rootId);
      if (
        root &&
        !(
          await sql`select id from km.wiki_comments where page_id=${key} and id=${root} and root_id is null`.execute(
            this.tx,
          )
        ).rows.length
      )
        throw missing();
      const anchor = optionalId(body.anchor);
      if (anchor && (root || !blocks.includes(anchor))) throw invalid();
      const mentions = body.mentions ?? [];
      if (!Array.isArray(mentions) || mentions.length > 10) throw invalid();
      const recipients = [];
      for (const recipient of new Set(mentions.map(id))) {
        const target = (
          await sql<{
            id: string;
            admin: boolean;
            require_mfa: boolean;
            totp_secret: string | null;
          }>`
          select m.id,m.admin,(o.require_mfa or km.member_requires_mfa(m.tenant_id,m.id)) require_mfa,
            case when m.totp_secret is null then null else 'enrolled' end totp_secret
          from km.memberships m join km.organizations o using(tenant_id)
          where m.id=${recipient} and m.state='active' and (m.guest_until is null or m.guest_until>now())
        `.execute(this.tx)
        ).rows[0];
        if (
          target &&
          (!(target.admin || target.require_mfa) ||
            target.totp_secret !== null) &&
          (await assess(
            this.tx,
            this.tenant,
            { kind: "member", member: { ...target, stepped_up: false } },
            {
              action: "content.read",
              resource: key,
              channel: "web",
              purpose: "default",
              external: false,
            },
          ))
        )
          recipients.push(recipient);
      }
      await sql`insert into km.wiki_comments(tenant_id,page_id,id,root_id,actor_id,anchor,body,mentions)
        values (${this.tenant},${key},${comment},${root},${member},${anchor},${string(body.text, 4000)},${recipients}::uuid[])`.execute(
        this.tx,
      );
      await this.event("comment.create", key);
      return { id: comment };
    }
    if (method === "PATCH" && leaf) {
      const resolved = body.resolved;
      if (typeof resolved !== "boolean") throw invalid();
      const changed =
        await sql`update km.wiki_comments set resolved=${resolved},
        history=history||jsonb_build_array(jsonb_build_object('resolved',${resolved}::boolean,'actor',${member}::text,'at',now()))
        where page_id=${key} and id=${id(leaf)} and actor_id=${member} and root_id is null returning id`.execute(
          this.tx,
        );
      if (!changed.rows.length) throw missing();
      return { id: leaf, resolved };
    }
    throw missing();
  }
  private async attachments(
    key: string,
    method: string,
    body: Body,
    leaf?: string,
  ) {
    if (method === "GET" && !leaf)
      return (
        await sql`select id,filename,content_type,sha256,scan_state,
      coalesce(object_size,octet_length(bytes)) as size from km.wiki_attachments where page_id=${key} order by filename,id`.execute(
          this.tx,
        )
      ).rows;
    if (leaf && (method === "GET" || method === "POST")) {
      if (method === "POST") await this.require("content.edit", key);
      const file = (
        await sql<{
          id: string;
          bytes: Buffer | null;
          filename: string;
          content_type: string;
          sha256: string;
          scan_state: string;
        }>`
        select id,bytes,filename,content_type,sha256,scan_state from km.wiki_attachments
        where page_id=${key} and id=${id(leaf)}
      `.execute(this.tx)
      ).rows[0];
      if (
        !file ||
        (method === "GET" && file.scan_state !== "clean") ||
        (method === "POST" && file.scan_state !== "pending")
      )
        throw missing();
      const bytes = file.bytes ?? (await readObject(this.tenant, file.id));
      if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
        throw new Error("Attachment integrity mismatch");
      if (method === "GET") {
        await this.event("attachment.download", key);
        return {
          filename: file.filename,
          contentType: file.content_type,
          data: bytes.toString("base64"),
        };
      }
      const scanState = await scanAttachment(bytes);
      await sql`update km.wiki_attachments set scan_state=${scanState} where page_id=${key} and id=${file.id}`.execute(
        this.tx,
      );
      await this.event("attachment.scan." + scanState, key);
      return { id: file.id, scanState };
    }
    await this.require("content.edit", key);
    if (method === "POST" && !leaf) {
      const { filename, type, bytes } = attachmentInput(body);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (body.sha256 !== undefined && body.sha256 !== hash) throw invalid();
      const loaded = (
        await sql<{
          total: number;
        }>`select coalesce(sum(coalesce(object_size,octet_length(bytes))),0)::int total
        from km.wiki_attachments`.execute(this.tx)
      ).rows[0]!.total;
      if (loaded + bytes.length > 50 * 1024 * 1024)
        throw new IdentityError(429);
      const upload = randomUUID();
      this.writes.add(upload);
      await putObject(this.tenant, upload, bytes);
      const scanState = await scanAttachment(bytes);
      await sql`insert into km.wiki_attachments(tenant_id,page_id,id,filename,content_type,object_size,sha256,scan_state)
        values (${this.tenant},${key},${upload},${filename},${type},${bytes.length},${hash},${scanState})`.execute(
        this.tx,
      );
      await this.event("attachment.scan." + scanState, key);
      return { id: upload, sha256: hash, scanState };
    }
    if (method === "DELETE" && leaf) {
      const deleted = await sql<{
        id: string;
        object_size: number | null;
      }>`delete from km.wiki_attachments
        where page_id=${key} and id=${id(leaf)} returning id,object_size`.execute(
        this.tx,
      );
      const file = deleted.rows[0];
      if (!file) throw missing();
      if (file.object_size !== null) this.removals.add(file.id);
      await this.event("attachment.delete", key);
      return { id: leaf };
    }
    throw missing();
  }
}
