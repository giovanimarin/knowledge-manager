import { randomUUID, randomBytes } from "node:crypto";
import { Dependencies, sql, type TenantTransaction } from "@km/foundation";
import {
  digest,
  email,
  hashPassword,
  id,
  IdentityError,
  newSecret,
  parseToken,
  password,
  seal,
  string,
  token,
  totp,
  unseal,
  verifyPassword,
} from "./security.js";

type Member = {
  id: string;
  email: string;
  name: string;
  admin: boolean;
  language: string;
  password_hash: string;
  totp_secret: string | null;
  pending_totp: string | null;
  totp_step: string;
  require_mfa: boolean;
};
type Identity = Member & { session_id: string; stepped_up: boolean };
type Service = { id: string; name: string };
export type Actor =
  { kind: "member"; member: Identity } | { kind: "service"; service: Service };

export const denied = () => new IdentityError(401);

async function member(
  tx: TenantTransaction,
  tenant: string,
  field: "email" | "id",
  value: string,
) {
  const predicate =
    field === "email" ? sql`m.email = ${value}` : sql`m.id = ${value}`;
  return (
    await sql<Member>`
    select m.*, o.require_mfa from km.memberships m
    join km.organizations o using (tenant_id)
    where m.tenant_id = ${tenant} and ${predicate}
      and m.state='active' and o.state='active'
      and (m.guest_until is null or m.guest_until > now())
    for update of m
  `.execute(tx)
  ).rows[0];
}

export async function audit(
  tx: TenantTransaction,
  tenant: string,
  actor: string | null,
  action: string,
  outcome: "success" | "denied" = "success",
  resource: string | null = null,
) {
  await sql`insert into km.identity_audit (tenant_id,actor_id,action,outcome,resource_id)
    select tenant_id,${actor},${action},${outcome},${resource} from km.organizations where tenant_id=${tenant}`.execute(
    tx,
  );
}

export async function changeEpoch(tx: TenantTransaction, tenant: string) {
  await sql`update km.organizations set policy_epoch=policy_epoch+1 where tenant_id=${tenant}`.execute(
    tx,
  );
}

async function issue(
  tx: TenantTransaction,
  tenant: string,
  current: Member,
  steppedUp = false,
) {
  const accessToken = token(tenant, "a");
  const refreshToken = token(tenant, "r");
  const sessionId = randomUUID();
  await sql`update km.session_families set revoked_at=now() where (tenant_id,id) in (
    select tenant_id,id from km.session_families
    where tenant_id=${tenant} and member_id=${current.id} and revoked_at is null and expires_at>now()
    order by created_at desc,id offset (select session_limit-1 from km.organizations where tenant_id=${tenant})
  )`.execute(tx);
  await sql`insert into km.session_families
    (tenant_id,id,member_id,access_digest,refresh_digest,access_until,expires_at,step_until)
    values (${tenant},${sessionId},${current.id},${digest(accessToken)},${digest(refreshToken)},
      now()+interval '10 minutes',now()+interval '24 hours',
      case when ${steppedUp} then now()+interval '10 minutes' end)`.execute(tx);
  await audit(
    tx,
    tenant,
    current.id,
    "identity.session-started",
    "success",
    sessionId,
  );
  return { accessToken, refreshToken, sessionId, expiresIn: 600 };
}

async function consumeCode(
  tx: TenantTransaction,
  tenant: string,
  current: Member,
  code: string,
  sealedSecret = current.totp_secret,
) {
  if (/^\d{6}$/.test(code) && sealedSecret) {
    const validator = totp(await unseal(sealedSecret), current.email);
    const now = Date.now();
    const shift = validator.validate({
      token: code,
      timestamp: now,
      window: 1,
    });
    if (shift === null) return false;
    const counter = Math.floor(now / 30000) + shift;
    if (counter <= Number(current.totp_step)) return false;
    await sql`update km.memberships set totp_step=${counter} where tenant_id=${tenant} and id=${current.id}`.execute(
      tx,
    );
    return true;
  }
  if (!current.totp_secret || sealedSecret !== current.totp_secret)
    return false;
  return (
    (
      await sql`delete from km.proofs where tenant_id=${tenant} and member_id=${current.id}
    and kind='recovery-code' and digest=${digest(code)} and expires_at>now() returning 1`.execute(
        tx,
      )
    ).rows.length === 1
  );
}

export class Sessions {
  private dummyHash?: Promise<string>;

  constructor(readonly dependencies: Dependencies) {}

  async limit(tenant: string, bucket: string, count = 10) {
    const result = await this.dependencies.inTenant(tenant, async (tx) => {
      return (
        await sql<{
          count: number;
        }>`insert into km.identity_limits (tenant_id,bucket,count,expires_at)
        select tenant_id,${digest(bucket)},1,now()+interval '1 minute' from km.organizations where tenant_id=${tenant}
        on conflict (tenant_id,bucket) do update set
          count=case when km.identity_limits.expires_at<=now() then 1 else least(km.identity_limits.count+1,10000) end,
          expires_at=case when km.identity_limits.expires_at<=now() then excluded.expires_at else km.identity_limits.expires_at end
        returning count`.execute(tx)
      ).rows[0];
    });
    if (result && result.count > count) throw new IdentityError(429);
  }

  async login(data: Record<string, unknown>, address: string) {
    const tenant = id(data.orgHint);
    const addressEmail = email(data.email);
    const value = string(data.password, 128);
    await this.limit(tenant, `login-ip:${address}`, 30);
    await this.limit(tenant, `login-email:${addressEmail}`);
    this.dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
    const dummy = await this.dummyHash;
    const result = await this.dependencies.inTenant(tenant, async (tx) => {
      const current = await member(tx, tenant, "email", addressEmail);
      const valid = await verifyPassword(
        value,
        current?.password_hash ?? dummy,
      );
      if (!current || !valid) {
        await audit(
          tx,
          tenant,
          current?.id ?? null,
          "identity.session-denied",
          "denied",
        );
        return null;
      }
      if (!current.totp_secret) return issue(tx, tenant, current);
      const challenge = token(tenant, "m");
      await sql`insert into km.proofs (tenant_id,digest,kind,member_id,expires_at)
        values (${tenant},${digest(challenge)},'login-mfa',${current.id},now()+interval '5 minutes')`.execute(
        tx,
      );
      return { challenge, expiresIn: 300 };
    });
    if (!result) throw denied();
    return result;
  }

  async challenge(data: Record<string, unknown>) {
    const t = parseToken(data.challenge, ["m"]);
    const code = string(data.code, 128);
    await this.limit(t.tenant, `mfa:${t.digest}`, 5);
    return this.dependencies.inTenant(t.tenant, async (tx) => {
      const proof = (
        await sql<{
          member_id: string;
        }>`delete from km.proofs where tenant_id=${t.tenant}
        and digest=${t.digest} and kind='login-mfa' and expires_at>now() returning member_id`.execute(
          tx,
        )
      ).rows[0];
      const current =
        proof && (await member(tx, t.tenant, "id", proof.member_id));
      if (!current || !(await consumeCode(tx, t.tenant, current, code)))
        throw denied();
      return issue(tx, t.tenant, current, true);
    });
  }

  async withActor<T>(
    authorization: unknown,
    operation: (
      tx: TenantTransaction,
      tenant: string,
      actor: Actor,
    ) => Promise<T>,
  ) {
    const match =
      typeof authorization === "string" &&
      /^Bearer ([^ ]+)$/i.exec(authorization);
    if (!match) throw denied();
    const t = parseToken(match[1], ["a", "s", "k"]);
    if (t.kind !== "a") {
      await this.limit(t.tenant, `service:${t.digest}`, 120);
      return this.dependencies.inTenant(t.tenant, async (tx) => {
        const condition =
          t.kind === "k"
            ? sql`c.secret_digest=${t.digest}`
            : sql`exists (
          select from km.service_tokens t where t.tenant_id=c.tenant_id and t.client_id=c.id
          and t.digest=${t.digest} and t.expires_at>now())`;
        const service = (
          await sql<Service>`select c.id,c.name from km.service_clients c join km.organizations o using (tenant_id)
          where c.tenant_id=${t.tenant} and ${condition} and c.expires_at>now() and c.revoked_at is null
          and o.state='active' for share of c,o`.execute(tx)
        ).rows[0];
        if (!service) throw denied();
        return operation(tx, t.tenant, { kind: "service", service });
      });
    }
    return this.dependencies.inTenant(t.tenant, async (tx) => {
      const principal = (
        await sql<Identity>`select m.*,o.require_mfa,s.id as session_id,
          coalesce(s.step_until>now(),false) as stepped_up
        from km.session_families s join km.memberships m on (m.tenant_id,m.id)=(s.tenant_id,s.member_id)
        join km.organizations o on o.tenant_id=s.tenant_id
        where s.tenant_id=${t.tenant} and s.access_digest=${t.digest} and s.revoked_at is null
          and s.expires_at>now() and s.access_until>now() and s.last_seen>now()-interval '30 minutes'
          and o.state='active' and m.state='active' and (m.guest_until is null or m.guest_until>now())
        for update of m,s`.execute(tx)
      ).rows[0];
      if (!principal) throw denied();
      await sql`update km.session_families set last_seen=now() where tenant_id=${t.tenant} and id=${principal.session_id}`.execute(
        tx,
      );
      return operation(tx, t.tenant, { kind: "member", member: principal });
    });
  }

  async refresh(value: unknown) {
    const t = parseToken(value, ["r"]);
    await this.limit(t.tenant, `refresh:${t.digest}`, 12);
    const result = await this.dependencies.inTenant(t.tenant, async (tx) => {
      // Lookup first, then lock member before session to preserve the login/mutation lock ordering.
      const initial = (
        await sql<{
          id: string;
          member_id: string;
        }>`select id,member_id from km.session_families
        where tenant_id=${t.tenant} and (refresh_digest=${t.digest}
          or id=(select session_id from km.spent_refresh where tenant_id=${t.tenant} and digest=${t.digest}))`.execute(
          tx,
        )
      ).rows[0];
      if (!initial) return null;
      const current = await member(tx, t.tenant, "id", initial.member_id);
      if (!current) return null;
      const currentSession = (
        await sql<{
          id: string;
          refresh_digest: string;
        }>`select id,refresh_digest from km.session_families
        where tenant_id=${t.tenant} and id=${initial.id} and revoked_at is null and expires_at>now()
          and last_seen>now()-interval '30 minutes' for update`.execute(tx)
      ).rows[0];
      if (!currentSession) return null;
      if (currentSession.refresh_digest !== t.digest) {
        await sql`update km.session_families set revoked_at=now() where tenant_id=${t.tenant} and id=${initial.id}`.execute(
          tx,
        );
        await audit(
          tx,
          t.tenant,
          current.id,
          "identity.refresh-replay",
          "denied",
          initial.id,
        );
        return null;
      }
      const accessToken = token(t.tenant, "a");
      const refreshToken = token(t.tenant, "r");
      await sql`insert into km.spent_refresh values (${t.tenant},${initial.id},${t.digest})`.execute(
        tx,
      );
      await sql`update km.session_families set access_digest=${digest(accessToken)},refresh_digest=${digest(refreshToken)},
        access_until=now()+interval '10 minutes',last_seen=now() where tenant_id=${t.tenant} and id=${initial.id}`.execute(
        tx,
      );
      return {
        accessToken,
        refreshToken,
        sessionId: initial.id,
        expiresIn: 600,
      };
    });
    if (!result) throw denied();
    return result;
  }

  async enroll(tx: TenantTransaction, tenant: string, current: Identity) {
    if (current.totp_secret && !current.stepped_up)
      throw new IdentityError(403);
    const secret = newSecret();
    await sql`update km.memberships set pending_totp=${await seal(secret)} where tenant_id=${tenant} and id=${current.id}`.execute(
      tx,
    );
    return { uri: totp(secret, current.email).toString() };
  }

  async confirm(
    tx: TenantTransaction,
    tenant: string,
    current: Identity,
    raw: unknown,
  ) {
    const code = string(raw, 6);
    if (!current.pending_totp || (current.totp_secret && !current.stepped_up))
      throw new IdentityError(403);
    if (!(await consumeCode(tx, tenant, current, code, current.pending_totp)))
      throw denied();
    await sql`update km.memberships set totp_secret=pending_totp,pending_totp=null where tenant_id=${tenant} and id=${current.id}`.execute(
      tx,
    );
    await sql`delete from km.proofs where tenant_id=${tenant} and member_id=${current.id} and kind in ('recovery-code','login-mfa')`.execute(
      tx,
    );
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(16).toString("base64url"),
    );
    for (const code of recoveryCodes)
      await sql`insert into km.proofs (tenant_id,digest,kind,member_id,expires_at)
      values (${tenant},${digest(code)},'recovery-code',${current.id},now()+interval '365 days')`.execute(
        tx,
      );
    await sql`update km.session_families set revoked_at=now() where tenant_id=${tenant} and member_id=${current.id} and id<>${current.session_id} and revoked_at is null`.execute(
      tx,
    );
    await this.markStep(tx, tenant, current.session_id);
    await audit(tx, tenant, current.id, "identity.mfa-enrolled");
    return { recoveryCodes };
  }

  async markStep(tx: TenantTransaction, tenant: string, sessionId: string) {
    await sql`update km.session_families set step_until=now()+interval '10 minutes' where tenant_id=${tenant} and id=${sessionId}`.execute(
      tx,
    );
  }

  async step(
    tx: TenantTransaction,
    tenant: string,
    current: Identity,
    code: unknown,
  ) {
    if (!(await consumeCode(tx, tenant, current, string(code, 128))))
      throw denied();
    await this.markStep(tx, tenant, current.session_id);
    await audit(tx, tenant, current.id, "identity.step-up");
    return { expiresIn: 600 };
  }

  async recover(data: Record<string, unknown>) {
    const t = parseToken(data.proof, ["p"]);
    await this.limit(t.tenant, `recovery:${t.digest}`, 5);
    const encoded = await hashPassword(password(data.password));
    return this.dependencies.inTenant(t.tenant, async (tx) => {
      const proof = (
        await sql<{
          member_id: string;
        }>`delete from km.proofs where tenant_id=${t.tenant} and digest=${t.digest}
        and kind='recovery' and expires_at>now() returning member_id`.execute(
          tx,
        )
      ).rows[0];
      const current =
        proof && (await member(tx, t.tenant, "id", proof.member_id));
      if (!current) throw denied();
      await sql`update km.memberships set password_hash=${encoded},pending_totp=null where tenant_id=${t.tenant} and id=${current.id}`.execute(
        tx,
      );
      await sql`update km.session_families set revoked_at=now() where tenant_id=${t.tenant} and member_id=${current.id} and revoked_at is null`.execute(
        tx,
      );
      await audit(tx, t.tenant, current.id, "identity.recovery-completed");
      return { ok: true };
    });
  }
}
