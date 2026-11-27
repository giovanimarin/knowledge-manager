import { ingest } from "../ingestion/api.js";
import { EditorStore } from "../editor/store.js";
import { Lifecycle } from "../editor/lifecycle.js";
import { All, Body, Controller, Inject, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { sql } from "@km/foundation";
import {
  accessRequest,
  assess,
  localMember,
  requireEnrollment,
  requirePermission,
} from "./policy.js";
import {
  id,
  IdentityError,
  input,
  problem,
  string,
  token,
  digest,
  parseToken,
} from "./security.js";
import { audit, changeEpoch, Sessions } from "./sessions.js";
import { Wiki } from "../wiki/wiki.js";
import { Management } from "./management.js";

@Controller("v1")
export class IdentityController {
  private readonly management: Management;
  constructor(@Inject(Sessions) private readonly sessions: Sessions) {
    this.management = new Management(sessions);
  }

  @All("*path")
  async handle(
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
    @Body() raw: unknown,
  ) {
    const correlationId = randomUUID();
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      const result = await this.dispatch(req, pathname, raw);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Correlation-ID": correlationId,
      });
      res.end(JSON.stringify(result));
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      const status =
        error instanceof IdentityError
          ? error.status
          : code === "23505" || code === "40P01"
            ? 409
            : code === "23503"
              ? 404
              : code === "23514"
                ? 400
                : 503;
      res.writeHead(status, {
        "Content-Type": "application/problem+json",
        "Cache-Control": "no-store",
        "X-Correlation-ID": correlationId,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      });
      res.end(
        JSON.stringify({
          type: "about:blank",
          title: status === 503 ? "Service Unavailable" : problem[status],
          status,
          correlationId,
        }),
      );
    }
  }

  private async dispatch(req: IncomingMessage, pathname: string, raw: unknown) {
    const key = `${req.method} ${pathname}`;
    const body =
      ["POST", "PUT", "PATCH"].includes(req.method ?? "") ||
      (req.method === "DELETE" &&
        raw !== undefined &&
        pathname.startsWith("/v1/editor/"))
        ? input(raw)
        : {};
    const address = req.socket.remoteAddress ?? "unknown";
    const auth = req.headers.authorization;
    const publicProof = {
      "POST /v1/sessions/refresh": ["r", body.refreshToken],
      "POST /v1/mfa/challenge": ["m", body.challenge],
      "POST /v1/invitations/accept": ["i", body.proof],
      "POST /v1/recovery/complete": ["p", body.proof],
    }[key];
    if (publicProof) {
      const [kind, proof] = publicProof;
      const parsed = parseToken(proof, [kind as string]);
      await this.sessions.limit(parsed.tenant, `proof-ip:${address}`, 60);
    }
    switch (key) {
      case "POST /v1/sessions":
        return this.sessions.login(body, address);
      case "POST /v1/sessions/refresh":
        return this.sessions.refresh(body.refreshToken);
      case "POST /v1/mfa/challenge":
        return this.sessions.challenge(body);
      case "POST /v1/invitations/accept":
        return this.management.accept(body);
      case "POST /v1/recovery/complete":
        return this.sessions.recover(body);
      case "POST /v1/oauth/token":
        return this.management.oauth(body, address);
    }
    // Rate-limit before locking the session so failed factor attempts consume quota.
    if (["POST /v1/mfa/confirm", "POST /v1/mfa/step-up"].includes(key)) {
      const principal = await this.sessions.withActor(
        auth,
        async (_tx, tenant, actor) => ({ tenant, id: localMember(actor).id }),
      );
      await this.sessions.limit(
        principal.tenant,
        `mfa-member:${principal.id}`,
        5,
      );
    }
    if (pathname.startsWith("/v1/ingestion/"))
      return this.sessions.withActor(auth, (tx, tenant, actor) =>
        ingest(new EditorStore(tx, tenant, actor), req.method ?? "", pathname),
      );
    if (pathname.startsWith("/v1/editor/"))
      return this.sessions.withActor(auth, (tx, tenant, actor) =>
        new Lifecycle(new EditorStore(tx, tenant, actor)).dispatch(
          req.method ?? "",
          pathname,
          body,
        ),
      );
    if (pathname.startsWith("/v1/wiki/")) {
      const holder: { wiki?: Wiki } = {};
      let committed = false;
      try {
        const result = await this.sessions.withActor(
          auth,
          async (tx, tenant, actor) => {
            const query = new URL(req.url ?? "/", "http://localhost")
              .searchParams;
            holder.wiki = new Wiki(tx, tenant, actor);
            return holder.wiki.dispatch(
              req.method ?? "",
              pathname,
              body,
              query,
            );
          },
        );
        committed = true;
        return result;
      } finally {
        await holder.wiki?.finishObjects(committed);
      }
    }
    return this.sessions.withActor(auth, async (tx, tenant, actor) => {
      if (key === "GET /v1/me") {
        if (actor.kind === "service")
          return {
            tenant,
            id: actor.service.id,
            name: actor.service.name,
            kind: actor.kind,
          };
        const m = actor.member;
        return {
          tenant,
          id: m.id,
          name: m.name,
          email: m.email,
          kind: actor.kind,
          language: m.language,
          mfaRequired: m.admin || m.require_mfa,
          mfaEnrolled: !!m.totp_secret,
        };
      }
      if (key === "POST /v1/mfa/enroll")
        return this.sessions.enroll(tx, tenant, localMember(actor));
      if (key === "POST /v1/mfa/confirm")
        return this.sessions.confirm(tx, tenant, localMember(actor), body.code);
      if (key === "POST /v1/mfa/step-up")
        return this.sessions.step(tx, tenant, localMember(actor), body.code);
      if (
        key === "DELETE /v1/sessions" ||
        key.startsWith("DELETE /v1/sessions/")
      ) {
        const m = localMember(actor);
        const session =
          key === "DELETE /v1/sessions"
            ? null
            : id(pathname.slice("/v1/sessions/".length));
        const result =
          await sql`update km.session_families set revoked_at=now() where tenant_id=${tenant}
          and member_id=${m.id} and (${session}::uuid is null or id=${session}) and revoked_at is null returning id`.execute(
            tx,
          );
        if (session && !result.rows.length) throw new IdentityError(404);
        await audit(
          tx,
          tenant,
          m.id,
          "identity.sessions-revoked",
          "success",
          session,
        );
        return { ok: true };
      }
      requireEnrollment(actor);

      switch (key) {
        case "GET /v1/sessions": {
          const m = localMember(actor);
          return (
            await sql`select id,created_at,last_seen,expires_at from km.session_families
            where tenant_id=${tenant} and member_id=${m.id} and revoked_at is null and expires_at>now()
            order by created_at desc limit 50`.execute(tx)
          ).rows;
        }
        case "PATCH /v1/me": {
          const m = localMember(actor);
          const name = body.name === undefined ? m.name : string(body.name);
          const language =
            body.language === undefined ? m.language : body.language;
          if (language !== "en" && language !== "pt-BR")
            throw new IdentityError(400);
          await sql`update km.memberships set name=${name},language=${language} where tenant_id=${tenant} and id=${m.id}`.execute(
            tx,
          );
          return { id: m.id, name, language };
        }
        case "GET /v1/organization/security": {
          await requirePermission(tx, tenant, actor, "identity.policy.manage");
          return (
            await sql`select session_limit, require_mfa, policy_epoch from km.organizations where tenant_id=${tenant}`.execute(
              tx,
            )
          ).rows[0];
        }
        case "PATCH /v1/organization/security": {
          const m = await requirePermission(
            tx,
            tenant,
            actor,
            "identity.policy.manage",
            true,
          );
          const { sessionLimit, requireMfa } = body;
          if (
            typeof sessionLimit !== "number" ||
            !Number.isInteger(sessionLimit) ||
            sessionLimit < 1 ||
            sessionLimit > 50 ||
            typeof requireMfa !== "boolean"
          )
            throw new IdentityError(400);
          await sql`update km.organizations set session_limit=${sessionLimit},require_mfa=${requireMfa}
            where tenant_id=${tenant}`.execute(tx);
          await changeEpoch(tx, tenant);
          await audit(
            tx,
            tenant,
            m.id,
            "identity.organization-security-updated",
          );
          return { sessionLimit, requireMfa };
        }
        case "GET /v1/privacy-requests": {
          const m = localMember(actor);
          return (
            await sql`select id,kind,state,created_at from km.privacy_requests
            where tenant_id=${tenant} and member_id=${m.id} order by created_at desc limit 100`.execute(
              tx,
            )
          ).rows;
        }
        case "POST /v1/privacy-requests": {
          const m = localMember(actor);
          const kind = body.kind;
          if (kind !== "export" && kind !== "delete")
            throw new IdentityError(400);
          if (!m.stepped_up) throw new IdentityError(403);
          const requestId = randomUUID();
          await sql`insert into km.privacy_requests (tenant_id,id,member_id,kind)
            values (${tenant},${requestId},${m.id},${kind})`.execute(tx);
          await audit(
            tx,
            tenant,
            m.id,
            "identity.privacy-requested",
            "success",
            requestId,
          );
          return { id: requestId, state: "requested" };
        }
        case "GET /v1/members":
          await requirePermission(tx, tenant, actor, "identity.members.manage");
          return (
            await sql`select id,name,email,state,admin,guest_until from km.memberships
            where tenant_id=${tenant} order by id limit 100`.execute(tx)
          ).rows;
        case "POST /v1/members":
          return this.management.invite(tx, tenant, actor, body);
        case "POST /v1/members/invitations":
          return this.management.bulkInvite(tx, tenant, actor, body);
        case "POST /v1/recovery":
          return this.management.issueRecovery(tx, tenant, actor, body);
        case "POST /v1/groups":
          return this.management.group(tx, tenant, actor, body);
        case "POST /v1/roles":
          return this.management.role(tx, tenant, actor, body);
        case "POST /v1/grants":
          return this.management.grant(tx, tenant, actor, body);
        case "GET /v1/groups":
        case "GET /v1/roles":
        case "GET /v1/grants": {
          await requirePermission(tx, tenant, actor, "identity.policy.manage");
          const table = key.endsWith("/groups")
            ? "identity_groups"
            : key.endsWith("/roles")
              ? "identity_roles"
              : "identity_grants";
          return (
            await sql`select * from km.${sql.id(table)} where tenant_id=${tenant} order by id limit 100`.execute(
              tx,
            )
          ).rows;
        }
        case "POST /v1/access/check": {
          const req = accessRequest(body);
          let allowed = await assess(tx, tenant, actor, req);
          if (body.delegatedAccessToken !== undefined) {
            if (actor.kind !== "service") throw new IdentityError(400);
            // Evaluate the delegate in this transaction and tenant. No token from a different tenant is accepted.
            const delegate =
              typeof body.delegatedAccessToken === "string"
                ? body.delegatedAccessToken
                : "";
            const token = parseToken(delegate, ["a"]);
            if (token.tenant !== tenant) throw new IdentityError(401);
            const principal = (
              await sql<
                ReturnType<typeof localMember>
              >`select m.*,(o.require_mfa or km.member_requires_mfa(m.tenant_id,m.id)) require_mfa,s.id session_id,coalesce(s.step_until>now(),false) stepped_up
              from km.session_families s join km.memberships m on (s.tenant_id,s.member_id)=(m.tenant_id,m.id)
              join km.organizations o on o.tenant_id=m.tenant_id where m.tenant_id=${tenant} and s.access_digest=${token.digest}
              and s.revoked_at is null and s.access_until>now() and s.expires_at>now() and s.last_seen>now()-interval '30 minutes'
              and m.state='active' and o.state='active' and (m.guest_until is null or m.guest_until>now()) for share of m,s`.execute(
                tx,
              )
            ).rows[0];
            if (!principal) throw new IdentityError(401);
            allowed =
              allowed &&
              (await assess(
                tx,
                tenant,
                { kind: "member", member: principal },
                req,
              ));
          }
          const actorId =
            actor.kind === "member" ? actor.member.id : actor.service.id;
          await audit(
            tx,
            tenant,
            actorId,
            "identity.access-checked",
            allowed ? "success" : "denied",
            req.resource,
          );
          return { allowed };
        }
        case "POST /v1/service-clients":
          return this.management.service(tx, tenant, actor, body);
        case "GET /v1/service-clients":
          await requirePermission(tx, tenant, actor, "identity.service.manage");
          return (
            await sql`select id,name,expires_at,revoked_at from km.service_clients
            where tenant_id=${tenant} order by id limit 100`.execute(tx)
          ).rows;
        case "GET /v1/audit-events": {
          const m = localMember(actor);
          const all = await assess(tx, tenant, actor, {
            action: "identity.audit.read",
            channel: "web",
            purpose: "default",
            external: false,
            resource: null,
          });
          await audit(tx, tenant, m.id, "identity.audit-read");
          return (
            await sql`select id,actor_id,action,outcome,resource_id,correlation_id,occurred_at
            from km.identity_audit where tenant_id=${tenant} and (${all} or actor_id=${m.id})
            order by occurred_at desc,id limit 100`.execute(tx)
          ).rows;
        }
      }
      const groupPath = pathname.match(
        /^\/v1\/groups\/([a-f0-9-]+)\/members$/i,
      );
      if (req.method === "PATCH" && groupPath)
        return this.management.replaceGroupMemberships(
          tx,
          tenant,
          actor,
          id(groupPath[1]),
          body,
        );
      const target = pathname.match(
        /^\/v1\/(members|service-clients|grants)\/([a-f0-9-]+)(\/rotate)?$/i,
      );
      if (!target) throw new IdentityError(404);
      const targetId = id(target[2]);
      if (req.method === "PATCH" && target[1] === "members" && !target[3])
        return this.management.changeMember(tx, tenant, actor, targetId, body);
      if (req.method === "DELETE" && target[1] === "grants" && !target[3]) {
        const m = await requirePermission(
          tx,
          tenant,
          actor,
          "identity.policy.manage",
          true,
        );
        const removed =
          await sql`delete from km.identity_grants where tenant_id=${tenant} and id=${targetId} returning id`.execute(
            tx,
          );
        if (!removed.rows.length) throw new IdentityError(404);
        await changeEpoch(tx, tenant);
        await audit(
          tx,
          tenant,
          m.id,
          "identity.grant-revoked",
          "success",
          targetId,
        );
        return { ok: true };
      }
      if (target[1] === "service-clients") {
        const m = await requirePermission(
          tx,
          tenant,
          actor,
          "identity.service.manage",
          true,
        );
        if (req.method === "POST" && target[3]) {
          const secret = token(tenant, "k");
          const changed =
            await sql`update km.service_clients set secret_digest=${digest(secret)} where tenant_id=${tenant} and id=${targetId}
            and revoked_at is null and expires_at>now() returning id`.execute(
              tx,
            );
          if (!changed.rows.length) throw new IdentityError(404);
          await sql`delete from km.service_tokens where tenant_id=${tenant} and client_id=${targetId}`.execute(
            tx,
          );
          await audit(
            tx,
            tenant,
            m.id,
            "identity.secret-rotated",
            "success",
            targetId,
          );
          return { id: targetId, key: secret };
        }
        if (req.method === "DELETE" && !target[3]) {
          const changed =
            await sql`update km.service_clients set revoked_at=now() where tenant_id=${tenant} and id=${targetId} and revoked_at is null returning id`.execute(
              tx,
            );
          if (!changed.rows.length) throw new IdentityError(404);
          await changeEpoch(tx, tenant);
          await audit(
            tx,
            tenant,
            m.id,
            "identity.service-revoked",
            "success",
            targetId,
          );
          return { ok: true };
        }
      }
      throw new IdentityError(404);
    });
  }
}
