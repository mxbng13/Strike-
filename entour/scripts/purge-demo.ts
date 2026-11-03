/** Supprime toutes les données de démonstration (comptes is_demo et tout ce qui en dépend). */
import { loadEnv } from "./env";
loadEnv();
const { sqlClient } = await import("../src/db");

const ids = (await sqlClient`select id from users where is_demo = true`).map((r) => r.id as string);
if (!ids.length) {
  console.log("Aucune donnée de démonstration.");
} else {
  await sqlClient.begin(async (tx) => {
    // Paiements et transactions liés (aucun en principe, la démo n'en crée pas)
    await tx`delete from transactions where payment_id in (select id from payments where payer_id = any(${ids}) or payee_id = any(${ids}))`;
    await tx`delete from disputes where opened_by = any(${ids})`;
    await tx`delete from payments where payer_id = any(${ids}) or payee_id = any(${ids})`;
    await tx`delete from services where requester_id = any(${ids}) or is_demo = true`;
    await tx`delete from conversations where id in (select conversation_id from conversation_members where user_id = any(${ids}))`;
    await tx`delete from users where id = any(${ids})`;
  });
  console.log(`✓ ${ids.length} comptes de démonstration supprimés.`);
}
await sqlClient.end();
