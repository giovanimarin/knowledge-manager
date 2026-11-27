import { randomUUID } from "node:crypto";
import { sql } from "@km/foundation";
import { IdentityError, id } from "../identity/security.js";
import { audit } from "../identity/sessions.js";
import { EditorStore, type Page } from "./store.js";

const missing = () => new IdentityError(404);
const invalid = () => new IdentityError(400);
const conflict = () => new IdentityError(409);
const revision = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw invalid();
  return value;
};
type Version = {
  revision: number;
  actor_id: string | null;
  saved_at: Date;
  title: string;
  content: string;
  blocks: Page["blocks"];
};

export class Lifecycle {
  constructor(private readonly store: EditorStore) {}
  private get tx() {
    return this.store.tx;
  }
  private get tenant() {
    return this.store.tenant;
  }
  private async version(page: Page, rev: number) {
    const row = (
      await sql<Version>`select revision,actor_id,saved_at,title,content,blocks from km.editor_versions
      where page_id=${page.id} and revision=${rev}`.execute(this.tx)
    ).rows[0];
    if (row) return row;
    if (rev === page.revision) return page;
    throw missing();
  }
  private async event(
    page: string,
    kind: string,
    publication: string | null = null,
    version: number | null = null,
    target: string | null = null,
  ) {
    await sql`insert into km.editor_outbox(tenant_id,page_id,publication_id,revision,kind,target_id)
      values(${this.tenant},${page},${publication},${version},${kind},${target})`.execute(
      this.tx,
    );
    await audit(
      this.tx,
      this.tenant,
      this.store.member,
      "editor." + kind,
      "success",
      page,
    );
  }
  private policy(space: string) {
    return sql<{
      approval_required: boolean;
      retention_days: number;
    }>`select approval_required,retention_days from km.editor_space_policy
      where space_id=${space}`
      .execute(this.tx)
      .then(
        (rows) =>
          rows.rows[0] ?? { approval_required: false, retention_days: 365 },
      );
  }
  async dispatch(method: string, path: string, body: Record<string, unknown>) {
    if (method !== "GET") await this.store.lock();
    if (path === "/v1/editor/notifications" && method === "GET") {
      if (!this.store.member) throw missing();
      const rows = (
        await sql<{
          page_id: string;
          kind: string;
          revision: number;
          occurred_at: Date;
        }>`
        select o.page_id,o.kind,o.revision,o.occurred_at from km.editor_outbox o
        join km.wiki_pages p on(p.tenant_id,p.id)=(o.tenant_id,o.page_id)
        where target_id=${this.store.member} and p.deleted_batch is null order by occurred_at desc limit 200`.execute(
          this.tx,
        )
      ).rows;
      const authorized = [];
      for (const row of rows)
        if (await this.store.can("content.read", row.page_id))
          authorized.push(row);
      return authorized;
    }
    const policy = /^\/v1\/editor\/spaces\/([^/]+)\/policy$/.exec(path);
    if (policy) {
      const key = id(policy[1]);
      await this.store.require("content.acl.manage", key);
      const space =
        await sql`select id from km.wiki_spaces where id=${key} and deleted_batch is null`.execute(
          this.tx,
        );
      if (!space.rows.length) throw missing();
      if (method === "GET") return this.policy(key);
      if (method === "PATCH") {
        const days = body.retentionDays;
        if (
          typeof body.approvalRequired !== "boolean" ||
          typeof days !== "number" ||
          !Number.isInteger(days) ||
          days < 1 ||
          days > 3650
        )
          throw invalid();
        await sql`insert into km.editor_space_policy values(${this.tenant},${key},${body.approvalRequired},${days})
          on conflict(tenant_id,space_id) do update set approval_required=excluded.approval_required,retention_days=excluded.retention_days`.execute(
          this.tx,
        );
        return this.policy(key);
      }
      throw missing();
    }
    const parsed =
      /^\/v1\/editor\/pages\/([^/]+)\/(versions|reviews|publication)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(
        path,
      );
    if (!parsed) throw missing();
    const page = await this.store.page(id(parsed[1]));
    const [, , type, leaf, operation] = parsed;
    if (type === "versions") {
      if (method === "GET" && !leaf) {
        const rows = (
          await sql`select revision,actor_id,saved_at,title from km.editor_versions where page_id=${page.id}
          order by revision desc limit 200`.execute(this.tx)
        ).rows;
        return rows.length
          ? rows
          : [{ revision: page.revision, title: page.title }];
      }
      const rev = revision(Number(leaf));
      if (method === "GET" && operation === "diff") {
        const before = await this.version(page, rev);
        const old = new Map(before.blocks.map((block) => [block.id, block]));
        const next = new Map(page.blocks.map((block) => [block.id, block]));
        return {
          before: rev,
          after: page.revision,
          title: { before: before.title, after: page.title },
          changes: [...new Set([...old.keys(), ...next.keys()])].flatMap(
            (key) => {
              const before = old.get(key) ?? null,
                after = next.get(key) ?? null;
              return JSON.stringify(before) === JSON.stringify(after)
                ? []
                : [{ id: key, before, after }];
            },
          ),
        };
      }
      const selected = await this.version(page, rev);
      if (method === "GET" && !operation) return selected;
      if (method === "POST" && operation === "restore") {
        await this.store.require("content.edit", page.id);
        if (revision(body.expectedRevision) !== page.revision) throw conflict();
        await this.store.saveVersion(page);
        const updated = {
          ...page,
          title: selected.title,
          content: selected.content,
          blocks: selected.blocks,
          revision: page.revision + 1,
        };
        await sql`update km.wiki_pages set title=${updated.title},content=${updated.content},blocks=${JSON.stringify(updated.blocks)}::jsonb,
          revision=${updated.revision},updated_at=now() where id=${page.id}`.execute(
          this.tx,
        );
        await this.store.saveVersion(updated);
        await audit(
          this.tx,
          this.tenant,
          this.store.member,
          "editor.version.restored",
          "success",
          page.id,
        );
        return { revision: updated.revision };
      }
    }
    if (type === "reviews") {
      if (method === "GET" && !leaf)
        return (
          await sql`select id,revision,reviewer_id,requested_by,status,requested_at,decided_at
        from km.editor_reviews where page_id=${page.id} order by requested_at desc limit 100`.execute(
            this.tx,
          )
        ).rows;
      const member = this.store.member;
      if (!member) throw missing();
      if (method === "POST" && !leaf) {
        await this.store.require("content.edit", page.id);
        if (revision(body.expectedRevision) !== page.revision) throw conflict();
        const reviewer = id(body.reviewerId);
        if (reviewer === member) throw invalid();
        if (!(await this.store.canReview(reviewer, page.id))) throw missing();
        await this.store.saveVersion(page);
        const review = randomUUID();
        await sql`insert into km.editor_reviews(tenant_id,page_id,id,revision,requested_by,reviewer_id)
          values(${this.tenant},${page.id},${review},${page.revision},${member},${reviewer})`.execute(
          this.tx,
        );
        await this.event(
          page.id,
          "review.requested",
          null,
          page.revision,
          reviewer,
        );
        return { id: review, revision: page.revision, status: "pending" };
      }
      if (method === "POST" && leaf && operation === "decision") {
        await this.store.require("content.approve", page.id);
        const status =
          body.approved === true
            ? "approved"
            : body.approved === false
              ? "rejected"
              : null;
        if (!status) throw invalid();
        const result = (
          await sql<{
            revision: number;
            requested_by: string;
          }>`update km.editor_reviews set status=${status},decided_by=${member},decided_at=now()
           where page_id=${page.id} and id=${id(leaf)} and reviewer_id=${member} and status='pending'
           returning revision,requested_by`.execute(this.tx)
        ).rows[0];
        if (!result) throw missing();
        await this.event(
          page.id,
          "review.decided",
          null,
          result.revision,
          result.requested_by,
        );
        return { status, revision: result.revision };
      }
    }
    if (type === "publication" && !leaf) {
      if (method === "GET") {
        const row = (
          await sql`select p.id,p.revision,p.published_at,p.expires_at,p.review_at,v.title,v.content,v.blocks
          from km.editor_publications p join km.editor_versions v using(tenant_id,page_id,revision)
          where p.page_id=${page.id} and p.withdrawn_at is null and (p.expires_at is null or p.expires_at>now())`.execute(
            this.tx,
          )
        ).rows[0];
        if (!row) throw missing();
        return row;
      }
      await this.store.require("content.publish", page.id);
      if (revision(body.expectedRevision) !== page.revision) throw conflict();
      if (method === "DELETE") {
        await this.withdraw(page.id);
        return { archived: true };
      }
      if (method === "POST") {
        const requested = revision(body.revision ?? page.revision);
        const approved =
          (
            await sql`select id from km.editor_reviews where page_id=${page.id} and revision=${requested} and status='approved'`.execute(
              this.tx,
            )
          ).rows.length > 0;
        if ((await this.policy(page.space_id)).approval_required && !approved)
          throw new IdentityError(403);
        if (requested !== page.revision && !approved) throw conflict();
        await this.store.saveVersion(page);
        await this.version(page, requested);
        const date = (value: unknown) => {
          if (value === undefined || value === null) return null;
          if (
            typeof value !== "string" ||
            !Number.isFinite(Date.parse(value)) ||
            Date.parse(value) <= Date.now()
          )
            throw invalid();
          return new Date(value);
        };
        const expires = date(body.expiresAt),
          review = date(body.reviewAt);
        if (expires && review && review > expires) throw invalid();
        if (!this.store.member) throw missing();
        await this.withdraw(page.id);
        const key = randomUUID();
        await sql`insert into km.editor_publications(tenant_id,page_id,id,revision,published_by,expires_at,review_at)
          values(${this.tenant},${page.id},${key},${requested},${this.store.member},${expires},${review})`.execute(
          this.tx,
        );
        await this.event(page.id, "published", key, requested);
        return { id: key, revision: requested };
      }
    }
    throw missing();
  }
  async withdraw(page: string) {
    const result = (
      await sql<{
        id: string;
        revision: number;
      }>`update km.editor_publications set withdrawn_at=now()
      where page_id=${page} and withdrawn_at is null returning id,revision`.execute(
        this.tx,
      )
    ).rows[0];
    if (result) await this.event(page, "withdrawn", result.id, result.revision);
  }
}
