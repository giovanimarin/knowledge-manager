import { sql, type TenantTransaction } from "@km/foundation";
import { IdentityError, id, string } from "./security.js";
import type { Actor } from "./sessions.js";

const actions = [
  "identity.members.manage",
  "identity.policy.manage",
  "identity.service.manage",
  "identity.audit.read",
  "identity.access.inspect",
  "content.read",
  "content.comment",
  "content.edit",
  "content.approve",
  "content.publish",
  "content.acl.manage",
  "knowledge.query",
  "knowledge.govern",
  "billing.read",
] as const;
export type Action = (typeof actions)[number];
export const action = (value: unknown) => {
  if (typeof value !== "string" || !actions.includes(value as Action))
    throw new IdentityError(400);
  return value as Action;
};

export function localMember(actor: Actor) {
  if (actor.kind !== "member") throw new IdentityError(403);
  return actor.member;
}

type PolicyActor =
  | Extract<Actor, { kind: "service" }>
  | {
      kind: "member";
      member: Pick<
        Extract<Actor, { kind: "member" }>["member"],
        "id" | "admin" | "require_mfa" | "totp_secret" | "stepped_up"
      >;
    };

export function requireEnrollment(actor: PolicyActor) {
  if (
    actor.kind === "member" &&
    (actor.member.admin || actor.member.require_mfa) &&
    !actor.member.totp_secret
  )
    throw new IdentityError(403);
}

export async function assess(
  tx: TenantTransaction,
  tenant: string,
  actor: PolicyActor,
  request: {
    action: Action;
    resource: string | null;
    channel: string;
    purpose: string;
    external: boolean;
  },
) {
  requireEnrollment(actor);
  const member = actor.kind === "member" ? actor.member.id : null;
  const client = actor.kind === "service" ? actor.service.id : null;
  const steppedUp = actor.kind === "member" && actor.member.stepped_up;
  const rows = (
    await sql<{ effect: string }>`
    with recursive groups(id) as (
      select group_id from km.identity_group_members where tenant_id=${tenant} and member_id=${member}
      union select e.parent_id from km.identity_group_edges e join groups g on g.id=e.child_id
      where e.tenant_id=${tenant}
    ), lineage(id, parent_id, classification) as (
      select id,parent_id,classification from km.identity_resources where tenant_id=${tenant} and id=${request.resource}
      union select r.id,r.parent_id,r.classification from km.identity_resources r join lineage l on l.parent_id=r.id
      where r.tenant_id=${tenant}
    ) select g.effect from km.identity_grants g join km.identity_roles r on (g.tenant_id,g.role_id)=(r.tenant_id,r.id)
    where g.tenant_id=${tenant} and (g.member_id=${member} or g.client_id=${client} or g.group_id in (select id from groups))
      and ${request.action}=any(r.actions)
      and (g.resource_id is null or g.resource_id in (select id from lineage))
      and (${request.resource}::uuid is null or exists(select from lineage))
      and g.valid_from<=now() and (g.valid_until is null or g.valid_until>now())
      and (g.channel is null or g.channel=${request.channel}) and (g.purpose is null or g.purpose=${request.purpose})
      and (g.effect='deny' or not g.require_step_up or ${steppedUp})
      and (not ${request.external} or not exists(select from lineage where classification in ('confidential','restricted')))
  `.execute(tx)
  ).rows;
  const admin =
    actor.kind === "member" &&
    actor.member.admin &&
    request.action.startsWith("identity.") &&
    request.resource === null;
  return (
    (admin || rows.some((row) => row.effect === "allow")) &&
    !rows.some((row) => row.effect === "deny")
  );
}

export const accessRequest = (body: Record<string, unknown>) => ({
  action: action(body.action),
  resource: body.resourceId === undefined ? null : id(body.resourceId),
  channel: body.channel === undefined ? "web" : string(body.channel, 60),
  purpose: body.purpose === undefined ? "default" : string(body.purpose, 120),
  external: body.external === true,
});

export async function requirePermission(
  tx: TenantTransaction,
  tenant: string,
  actor: Actor,
  permission: Action,
  step = false,
) {
  const current = localMember(actor);
  if (
    (step && !current.stepped_up) ||
    !(await assess(tx, tenant, actor, {
      action: permission,
      resource: null,
      channel: "web",
      purpose: "default",
      external: false,
    }))
  )
    throw new IdentityError(403);
  return current;
}
