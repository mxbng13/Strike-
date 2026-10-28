import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db/client";
import { AppError } from "@/lib/errors";
import { audit } from "@/audit/service";

/**
 * Governance levels:
 *  L1 — internal, reversible work inside the workspace: autonomous.
 *  L2 — commits the user or has external effects: requires an explicit approval.
 *  L3 — forbidden (illegal, deceptive, bypasses protections, binds the user without authority).
 * Workspace overrides can only make things STRICTER (L2 → deny), never looser.
 */
export const ACTION_LEVELS = {
  // L1
  research: "L1",
  analysis: "L1",
  generate_document: "L1",
  internal_calculation: "L1",
  prepare_code: "L1",
  sandbox_execution: "L1",
  plan_tasks: "L1",
  revise_strategy: "L1",
  // L2
  spend_money: "L2",
  paid_subscription: "L2",
  purchase_domain: "L2",
  create_external_account: "L2",
  send_external_communication: "L2",
  publish_website: "L2",
  publish_public_content: "L2",
  run_ad_campaign: "L2",
  modify_external_system: "L2",
  share_personal_data_third_party: "L2",
  register_company: "L2",
  // L3
  bypass_protection: "L3",
  harvest_credentials: "L3",
  fabricate_evidence: "L3",
  guarantee_financial_results: "L3",
  sign_contract_without_authority: "L3",
  illegal_operation: "L3",
  publish_sensitive_data: "L3",
  claim_unperformed_action: "L3",
} as const;

export type ActionType = keyof typeof ACTION_LEVELS;
export type Level = "L1" | "L2" | "L3";

export function levelOf(action: string): Level {
  // Unknown action types default to L2: never autonomous by omission.
  return (ACTION_LEVELS as Record<string, Level>)[action] ?? "L2";
}

export type ActionRequest = {
  workspaceId: string;
  projectId: string;
  actionType: string;
  title: string;
  objective: string;
  estimatedCostEur?: number;
  consequences: string;
  payload?: Record<string, unknown>;
  dedupeKey: string;
  requestedByTaskId?: string | null;
  actor: { type: "agent" | "user" | "system"; id: string };
};

export type ActionDecision =
  | { outcome: "allowed"; level: "L1" }
  | { outcome: "pending_approval"; level: "L2"; approvalId: string }
  | { outcome: "approved"; level: "L2"; approvalId: string };

/** Single entry point for any action an agent wants to take. */
export async function requestAction(req: ActionRequest, tx: DbOrTx = db()): Promise<ActionDecision> {
  let level = levelOf(req.actionType);
  if (level !== "L3") {
    const override = await tx.query.permissions.findFirst({
      where: and(
        eq(schema.permissions.workspaceId, req.workspaceId),
        eq(schema.permissions.actionType, req.actionType),
        or(isNull(schema.permissions.projectId), eq(schema.permissions.projectId, req.projectId)),
        eq(schema.permissions.policy, "deny"),
      ),
    });
    if (override) level = "L3";
  }
  const base = { workspaceId: req.workspaceId, projectId: req.projectId, actorType: req.actor.type, actorId: req.actor.id, action: `action.${req.actionType}`, target: req.title };
  if (level === "L3") {
    await audit({ ...base, outcome: "denied", data: { level, objective: req.objective } }, tx);
    throw new AppError("ACTION_FORBIDDEN", `Action interdite (${req.actionType}) : elle ne peut pas être exécutée par l'IA.`);
  }
  if (level === "L1") {
    await audit({ ...base, outcome: "allowed", data: { level } }, tx);
    return { outcome: "allowed", level: "L1" };
  }
  const [created] = await tx
    .insert(schema.approvalRequests)
    .values({
      workspaceId: req.workspaceId,
      projectId: req.projectId,
      actionType: req.actionType,
      title: req.title,
      objective: req.objective,
      estimatedCostEur: req.estimatedCostEur ?? 0,
      consequences: req.consequences,
      payload: req.payload ?? {},
      dedupeKey: req.dedupeKey,
      requestedByTaskId: req.requestedByTaskId ?? null,
    })
    .onConflictDoNothing({ target: [schema.approvalRequests.projectId, schema.approvalRequests.dedupeKey] })
    .returning({ id: schema.approvalRequests.id, status: schema.approvalRequests.status });
  const row =
    created ??
    (await tx.query.approvalRequests.findFirst({
      where: and(eq(schema.approvalRequests.projectId, req.projectId), eq(schema.approvalRequests.dedupeKey, req.dedupeKey)),
    }))!;
  if (created) await audit({ ...base, outcome: "pending", data: { level, approvalId: row.id, estimatedCostEur: req.estimatedCostEur ?? 0 } }, tx);
  if (row.status === "approved" || row.status === "executed") return { outcome: "approved", level: "L2", approvalId: row.id };
  return { outcome: "pending_approval", level: "L2", approvalId: row.id };
}
