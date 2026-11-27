import { randomUUID } from "node:crypto";
import { sql, type TenantTransaction } from "@km/foundation";
import { action, assess, requirePermission, type Action } from "./policy.js";
import { audit, changeEpoch, type Actor } from "./sessions.js";
import {
  digest,
  email,
  hashPassword,
  id,
  IdentityError,
  parseToken,
  password,
  string,
  token,
} from "./security.js";
import type { Sessions } from "./sessions.js";

const active = (state: unknown) => {
  if (state !== "active" && state !== "suspended" && state !== "closed")
    throw new IdentityError(400);
  return state;
};
const date = (value: unknown) => {
  const parsed = new Date(string(value, 40));
  if (!Number.isFinite(parsed.valueOf()) || parsed <= new Date())
    throw new IdentityError(400);
  return parsed;
};
const optionalId = (value: unknown) => (value === undefined ? null : id(value));
const optionalString = (value: unknown) =>
  value === undefined ? null : string(value);

export class Management {
  constructor(private readonly sessions: Sessions) {}

  async invite(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    data: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.members.manage",
      true,
    );
    const address = email(data.email);
    const display = string(data.name);
    const guestUntil =
      data.guestUntil === undefined ? null : date(data.guestUntil);
    const proof = token(tenant, "i");
    await sql`insert into km.proofs (tenant_id,digest,kind,payload,expires_at)
      values (${tenant},${digest(proof)},'invite',${JSON.stringify({ email: address, name: display, guestUntil })}::jsonb,now()+interval '1 day')`.execute(
      tx,
    );
    await audit(tx, tenant, current.id, "identity.invited");
    return { proof, expiresIn: 86400 };
  }

  async accept(data: Record<string, unknown>) {
    const t = parseToken(data.proof, ["i"]);
    await this.sessions.limit(t.tenant, `invite:${t.digest}`, 5);
    const encoded = await hashPassword(password(data.password));
    return this.sessions.dependencies.inTenant(t.tenant, async (tx) => {
      const proof = (
        await sql<{
          payload: { email: string; name: string; guestUntil: string | null };
        }>`
        delete from km.proofs where tenant_id=${t.tenant}
        and digest=${t.digest} and kind='invite' and expires_at>now()
        and exists(select from km.organizations where tenant_id=${t.tenant} and state='active')
        returning payload`.execute(tx)
      ).rows[0];
      if (!proof) throw new IdentityError(401);
      const memberId = randomUUID();
      const { email, name, guestUntil } = proof.payload;
      const inserted =
        await sql`insert into km.memberships (tenant_id,id,email,name,password_hash,guest_until)
        values (${t.tenant},${memberId},${email},${name},${encoded},${guestUntil})
        on conflict (tenant_id,email) do nothing returning id`.execute(tx);
      if (inserted.rows.length === 0) throw new IdentityError(409);
      await audit(tx, t.tenant, memberId, "identity.invitation-accepted");
      return { id: memberId };
    });
  }

  async changeMember(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    memberId: string,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.members.manage",
      true,
    );
    const state = active(body.state);
    if (memberId === current.id) throw new IdentityError(409);
    const result = await sql`update km.memberships set state=${state}
      where tenant_id=${tenant} and id=${memberId} and state<>'closed' returning id`.execute(
      tx,
    );
    if (!result.rows.length) throw new IdentityError(404);
    if (state !== "active") {
      await sql`update km.session_families set revoked_at=now() where tenant_id=${tenant} and member_id=${memberId} and revoked_at is null`.execute(
        tx,
      );
      await sql`delete from km.proofs where tenant_id=${tenant} and member_id=${memberId}`.execute(
        tx,
      );
      await sql`delete from km.identity_group_members where tenant_id=${tenant} and member_id=${memberId}`.execute(
        tx,
      );
      await sql`delete from km.identity_grants where tenant_id=${tenant} and member_id=${memberId}`.execute(
        tx,
      );
    }
    await changeEpoch(tx, tenant);
    await audit(
      tx,
      tenant,
      current.id,
      `identity.member-${state}`,
      "success",
      memberId,
    );
    return { id: memberId, state };
  }

  async issueRecovery(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.members.manage",
      true,
    );
    const memberId = id(body.memberId);
    const proof = token(tenant, "p");
    const result =
      await sql`insert into km.proofs (tenant_id,digest,kind,member_id,expires_at)
      select tenant_id,${digest(proof)},'recovery',id,now()+interval '15 minutes' from km.memberships
      where tenant_id=${tenant} and id=${memberId} and state='active' and not admin returning member_id`.execute(
        tx,
      );
    if (!result.rows.length) throw new IdentityError(404);
    await audit(
      tx,
      tenant,
      current.id,
      "identity.recovery-issued",
      "success",
      memberId,
    );
    return { proof, expiresIn: 900 };
  }

  async group(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.policy.manage",
      true,
    );
    const groupId = randomUUID();
    const name = string(body.name);
    const parent = optionalId(body.parentId);
    const members = body.members === undefined ? [] : body.members;
    if (!Array.isArray(members) || members.length > 100)
      throw new IdentityError(400);
    await sql`insert into km.identity_groups values (${tenant},${groupId},${name})`.execute(
      tx,
    );
    if (parent)
      await sql`insert into km.identity_group_edges values (${tenant},${parent},${groupId})`.execute(
        tx,
      );
    for (const memberId of new Set(members.map(id))) {
      await sql`insert into km.identity_group_members values (${tenant},${groupId},${memberId})`.execute(
        tx,
      );
    }
    await changeEpoch(tx, tenant);
    await audit(
      tx,
      tenant,
      current.id,
      "identity.group-created",
      "success",
      groupId,
    );
    return { id: groupId, name };
  }

  async role(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.policy.manage",
      true,
    );
    const id = randomUUID();
    const name = string(body.name);
    if (
      !Array.isArray(body.actions) ||
      body.actions.length < 1 ||
      body.actions.length > 32
    )
      throw new IdentityError(400);
    const operations = [...new Set(body.actions.map(action))];
    await sql`insert into km.identity_roles values (${tenant},${id},${name},${operations}::text[])`.execute(
      tx,
    );
    await audit(tx, tenant, current.id, "identity.role-created", "success", id);
    return { id, name, actions: operations };
  }

  async grant(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.policy.manage",
      true,
    );
    const grantId = randomUUID();
    const role = id(body.roleId);
    const member = optionalId(body.memberId),
      group = optionalId(body.groupId),
      client = optionalId(body.clientId);
    const resource = optionalId(body.resourceId);
    if (
      [member, group, client].filter(Boolean).length !== 1 ||
      (body.effect !== "allow" && body.effect !== "deny")
    )
      throw new IdentityError(400);
    const operations = (
      await sql<{
        actions: Action[];
      }>`select actions from km.identity_roles where tenant_id=${tenant} and id=${role}`.execute(
        tx,
      )
    ).rows[0]?.actions;
    if (!operations) throw new IdentityError(404);
    if (body.effect === "allow") {
      // Tenant administration is independent from permission to delegate content.
      for (const operation of operations) {
        if (
          !(await assess(tx, tenant, actor, {
            action: operation,
            resource,
            channel: "web",
            purpose: "default",
            external: false,
          }))
        )
          throw new IdentityError(403);
      }
    }
    await sql`insert into km.identity_grants (tenant_id,id,role_id,member_id,group_id,client_id,resource_id,effect,valid_until,purpose,channel,require_step_up)
      values (${tenant},${grantId},${role},${member},${group},${client},${resource},${body.effect},
        ${body.validUntil === undefined ? null : date(body.validUntil)},${optionalString(body.purpose)},${optionalString(body.channel)},${body.requireStepUp === true})`.execute(
      tx,
    );
    await changeEpoch(tx, tenant);
    await audit(
      tx,
      tenant,
      current.id,
      "identity.grant-created",
      "success",
      grantId,
    );
    return { id: grantId };
  }

  async service(
    tx: TenantTransaction,
    tenant: string,
    actor: Actor,
    body: Record<string, unknown>,
  ) {
    const current = await requirePermission(
      tx,
      tenant,
      actor,
      "identity.service.manage",
      true,
    );
    const serviceId = randomUUID();
    const key = token(tenant, "k");
    const name = string(body.name);
    const expires = date(body.expiresAt);
    await sql`insert into km.service_clients (tenant_id,id,name,secret_digest,expires_at)
      values (${tenant},${serviceId},${name},${digest(key)},${expires})`.execute(
      tx,
    );
    await audit(
      tx,
      tenant,
      current.id,
      "identity.service-created",
      "success",
      serviceId,
    );
    return { id: serviceId, name, key, expiresAt: expires.toISOString() };
  }

  async oauth(data: Record<string, unknown>, address: string) {
    if (data.grant_type !== "client_credentials") throw new IdentityError(400);
    const t = parseToken(data.client_secret, ["k"]);
    const client = id(data.client_id);
    await this.sessions.limit(t.tenant, `oauth-ip:${address}`, 30);
    await this.sessions.limit(t.tenant, `oauth:${client}`, 10);
    return this.sessions.dependencies.inTenant(t.tenant, async (tx) => {
      const active =
        (
          await sql`select c.id from km.service_clients c join km.organizations o using(tenant_id)
         where c.tenant_id=${t.tenant} and c.id=${client} and c.revoked_at is null and c.expires_at>now()
           and c.secret_digest=${t.digest} and o.state='active' for share of c,o`.execute(
            tx,
          )
        ).rows.length === 1;
      if (!active) throw new IdentityError(401);
      const access = token(t.tenant, "s");
      await sql`insert into km.service_tokens values (${t.tenant},${client},${digest(access)},now()+interval '10 minutes')`.execute(
        tx,
      );
      await audit(tx, t.tenant, client, "identity.service-token");
      return { access_token: access, expires_in: 600, token_type: "Bearer" };
    });
  }
}
