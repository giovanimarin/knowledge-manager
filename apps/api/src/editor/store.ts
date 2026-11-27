import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import { sql, type TenantTransaction } from "@km/foundation";
import { assess, type Action } from "../identity/policy.js";
import { IdentityError, id, string } from "../identity/security.js";
import { audit, type Actor } from "../identity/sessions.js";
import { initDocument, project, validateBlocks, type Block } from "./blocks.js";

export type Page = {
  id: string;
  space_id: string;
  revision: number;
  title: string;
  content: string;
  blocks: Block[];
};
type State = { generation: string; snapshot: Buffer; revision: number };
const missing = () => new IdentityError(404);

export class EditorStore {
  constructor(
    readonly tx: TenantTransaction,
    readonly tenant: string,
    readonly actor: Actor,
  ) {}
  get member() {
    return this.actor.kind === "member" ? this.actor.member.id : null;
  }
  async lock() {
    await sql`select pg_advisory_xact_lock(71189004,hashtext(${this.tenant}))`.execute(
      this.tx,
    );
  }
  async can(action: Action, resource: string) {
    return assess(this.tx, this.tenant, this.actor, {
      action,
      resource,
      channel: "web",
      purpose: "default",
      external: false,
    });
  }
  async require(action: Action, resource: string) {
    if (!(await this.can(action, resource))) throw missing();
  }
  async canReview(member: string, key: string) {
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
      where m.id=${member} and m.state='active' and (m.guest_until is null or m.guest_until>now())
    `.execute(this.tx)
    ).rows[0];
    if (
      !target ||
      ((target.admin || target.require_mfa) && !target.totp_secret)
    )
      return false;
    const actor = {
      kind: "member" as const,
      member: { ...target, stepped_up: false },
    };
    for (const action of ["content.read", "content.approve"] as const) {
      if (
        !(await assess(this.tx, this.tenant, actor, {
          action,
          resource: key,
          channel: "web",
          purpose: "default",
          external: false,
        }))
      )
        return false;
    }
    return true;
  }
  async page(key: string) {
    await this.require("content.read", key);
    const page = (
      await sql<Page>`select id,space_id,revision,title,content,blocks
      from km.wiki_pages where tenant_id=${this.tenant} and id=${key} and deleted_batch is null`.execute(
        this.tx,
      )
    ).rows[0];
    if (!page) throw missing();
    return page;
  }
  async saveVersion(page: Page) {
    await sql`insert into km.editor_versions (tenant_id,page_id,revision,actor_id,title,content,blocks)
      values(${this.tenant},${page.id},${page.revision},${this.member},${page.title},${page.content},${JSON.stringify(page.blocks)}::jsonb)
      on conflict do nothing`.execute(this.tx);
  }
  async state(page: Page): Promise<State> {
    const present = (
      await sql<State>`select generation,snapshot,revision from km.editor_states
      where tenant_id=${this.tenant} and page_id=${page.id}`.execute(this.tx)
    ).rows[0];
    if (present?.revision === page.revision) return present;
    const fallback = page.blocks.length
      ? validateBlocks(page.blocks)
      : page.content
        ? [{ id: randomUUID(), kind: "text" as const, text: page.content }]
        : [];
    const doc = initDocument(fallback);
    const next = {
      revision: page.revision,
      generation: randomUUID(),
      snapshot: Buffer.from(Y.encodeStateAsUpdate(doc)),
    };
    doc.destroy();
    await sql`insert into km.editor_states values(${this.tenant},${page.id},${next.revision},${next.generation},${next.snapshot})
      on conflict(tenant_id,page_id) do update set revision=excluded.revision,generation=excluded.generation,snapshot=excluded.snapshot`.execute(
      this.tx,
    );
    return next;
  }
  async sync(key: string) {
    if (!this.member) throw missing();
    await this.lock();
    const page = await this.page(key);
    const state = await this.state(page);
    const epoch = (
      await sql<{
        policy_epoch: string;
      }>`select policy_epoch from km.organizations where tenant_id=${this.tenant}`.execute(
        this.tx,
      )
    ).rows[0]!.policy_epoch;
    return {
      tenant: this.tenant,
      member: this.member,
      write: await this.can("content.edit", key),
      sequence: state.revision,
      generation: state.generation,
      epoch,
      snapshot: state.snapshot.toString("base64"),
    };
  }
  async update(key: string, body: Record<string, unknown>) {
    if (!this.member) throw missing();
    const operation = id(body.operationId);
    const gen = id(body.generation);
    const payload = string(body.update, 192 * 1024);
    const bytes = Buffer.from(payload, "base64");
    if (bytes.toString("base64") !== payload || !bytes.length)
      throw new IdentityError(400);
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    await this.lock();
    const page = await this.page(key);
    await this.require("content.edit", key);
    const state = await this.state(page);
    const prior = (
      await sql<{
        revision: number;
        digest: string;
        generation: string;
      }>`select revision,digest,generation from km.editor_receipts
      where tenant_id=${this.tenant} and page_id=${key} and operation_id=${operation}`.execute(
        this.tx,
      )
    ).rows[0];
    if (prior) {
      if (prior.generation !== gen || prior.digest !== fingerprint)
        throw new IdentityError(409);
      return { operationId: operation, sequence: prior.revision };
    }
    if (gen !== state.generation) throw new IdentityError(409);
    const doc = new Y.Doc();
    let blocks: Block[], snapshot: Buffer;
    try {
      Y.applyUpdate(doc, state.snapshot);
      Y.applyUpdate(doc, bytes);
      blocks = project(doc);
      snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));
      if (snapshot.length > 512 * 1024) throw new IdentityError(400);
    } catch {
      throw new IdentityError(400);
    } finally {
      doc.destroy();
    }
    await this.saveVersion(page);
    const updated = {
      ...page,
      blocks,
      content: blocks.map((block) => block.text).join("\n"),
      revision: page.revision + 1,
    };
    await sql`update km.wiki_pages set revision=${updated.revision},blocks=${JSON.stringify(blocks)}::jsonb,
      content=${updated.content},updated_at=now() where id=${key}`.execute(
      this.tx,
    );
    await sql`update km.editor_states set revision=${updated.revision},snapshot=${snapshot}
      where tenant_id=${this.tenant} and page_id=${key}`.execute(this.tx);
    await this.saveVersion(updated);
    await sql`insert into km.editor_receipts values(${this.tenant},${key},${operation},${gen},${updated.revision},${fingerprint})`.execute(
      this.tx,
    );
    await audit(
      this.tx,
      this.tenant,
      this.member,
      "editor.update",
      "success",
      key,
    );
    return { operationId: operation, sequence: updated.revision };
  }
}
