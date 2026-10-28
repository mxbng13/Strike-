import { schema, type DbOrTx, db } from "@/db/client";
import { currentCorrelationId, redact } from "@/lib/logger";

export type AuditInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  action: string;
  target?: string | null;
  outcome?: "allowed" | "denied" | "pending" | "error";
  data?: Record<string, unknown>;
};

/** Append-only audit trail for sensitive actions. Payloads are redacted. */
export async function audit(input: AuditInput, tx: DbOrTx = db()): Promise<void> {
  await tx.insert(schema.auditEvents).values({
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    target: input.target ?? null,
    outcome: input.outcome ?? "allowed",
    data: input.data ? (redact(input.data) as Record<string, unknown>) : null,
    correlationId: currentCorrelationId() ?? null,
  });
}
