import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { audit } from "@/audit/service";

/**
 * Executors for approved L2 actions. An action is marked "executed" ONLY when a
 * configured connector actually performed it. Without a connector the request
 * stays "approved" with an explicit note of what remains manual — the system
 * never claims an external action it did not perform.
 */
type Executor = (req: typeof schema.approvalRequests.$inferSelect) => Promise<{ executed: boolean; note: string }>;

const NO_CONNECTOR: Record<string, string> = {
  publish_website: "Aucun connecteur d'hébergement configuré : téléchargez l'export ZIP du site et publiez-le manuellement (ex. hébergeur statique).",
  purchase_domain: "Aucun connecteur de registrar configuré : achat du nom de domaine à effectuer manuellement.",
  run_ad_campaign: "Aucun connecteur publicitaire configuré : campagne à créer manuellement avec le budget approuvé.",
  send_external_communication: "Aucun connecteur d'e-mail configuré : les messages préparés sont à envoyer manuellement.",
  create_external_account: "Création de compte à effectuer manuellement par l'utilisateur.",
  register_company: "Immatriculation à effectuer par l'utilisateur sur le guichet unique (formalites.entreprises.gouv.fr).",
};

const EXECUTORS: Record<string, Executor> = {};

export async function executeApprovedAction(approvalId: string): Promise<void> {
  const req = await db().query.approvalRequests.findFirst({ where: eq(schema.approvalRequests.id, approvalId) });
  if (!req || req.status !== "approved") return;
  const exec = EXECUTORS[req.actionType];
  if (!exec) {
    const note = NO_CONNECTOR[req.actionType] ?? "Aucun connecteur disponible pour exécuter cette action : exécution manuelle requise.";
    await db().update(schema.approvalRequests).set({ executionNote: note }).where(eq(schema.approvalRequests.id, approvalId));
    await audit({ workspaceId: req.workspaceId, projectId: req.projectId, actorType: "system", action: "action.execution_unavailable", target: req.title, outcome: "pending", data: { actionType: req.actionType } });
    return;
  }
  try {
    const r = await exec(req);
    await db()
      .update(schema.approvalRequests)
      .set({ status: r.executed ? "executed" : "approved", executionNote: r.note })
      .where(eq(schema.approvalRequests.id, approvalId));
  } catch (e) {
    await db()
      .update(schema.approvalRequests)
      .set({ status: "execution_failed", executionNote: e instanceof Error ? e.message.slice(0, 500) : "Échec" })
      .where(eq(schema.approvalRequests.id, approvalId));
  }
}
