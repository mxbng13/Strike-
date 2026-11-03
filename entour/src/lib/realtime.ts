/**
 * Temps réel : PostgreSQL LISTEN/NOTIFY + Server-Sent Events.
 *
 * Choix d'architecture : aucun service supplémentaire à opérer (pas de Redis ni de serveur WebSocket).
 * Chaque instance Next.js ouvre UNE connexion LISTEN ; les événements publiés par n'importe quelle
 * instance sont relayés aux navigateurs connectés à cette instance via SSE.
 * Les charges utiles sont volontairement légères (identifiants) : le client recharge ce dont il a besoin.
 */
import { EventEmitter } from "node:events";
import { sqlClient } from "@/db";

export type RealtimeEvent =
  | { type: "message:new"; conversationId: string; messageId: string; senderId: string | null }
  | { type: "message:updated"; conversationId: string; messageId: string }
  | { type: "conversation:read"; conversationId: string; userId: string; at: string }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "notification:new"; notificationId: string; title: string; body: string; link: string | null; notifType: string }
  | { type: "service:updated"; serviceId: string }
  | { type: "assignment:updated"; assignmentId: string; serviceId: string };

const CHANNEL = "entour_events";

type G = { __entourBus?: EventEmitter; __entourListen?: Promise<unknown> };
const g = globalThis as unknown as G;

function bus(): EventEmitter {
  if (!g.__entourBus) {
    g.__entourBus = new EventEmitter();
    g.__entourBus.setMaxListeners(10_000);
  }
  return g.__entourBus;
}

async function ensureListening() {
  if (!g.__entourListen) {
    g.__entourListen = sqlClient
      .listen(CHANNEL, (payload) => {
        try {
          const { u, e } = JSON.parse(payload) as { u: string[]; e: RealtimeEvent };
          for (const userId of u) bus().emit(`user:${userId}`, e);
        } catch {
          /* charge utile invalide ignorée */
        }
      })
      .catch((err) => {
        console.error("[realtime] LISTEN impossible", err);
        g.__entourListen = undefined;
      });
  }
  await g.__entourListen;
}

/** Publie un événement à destination d'un ou plusieurs utilisateurs (toutes instances confondues). */
export async function publish(userIds: (string | null | undefined)[], event: RealtimeEvent) {
  const u = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!u.length) return;
  const payload = JSON.stringify({ u, e: event });
  if (payload.length > 7800) return; // limite NOTIFY : 8000 octets
  try {
    await sqlClient.notify(CHANNEL, payload);
  } catch (err) {
    console.error("[realtime] NOTIFY échoué", err);
  }
}

export async function subscribe(userId: string, cb: (e: RealtimeEvent) => void): Promise<() => void> {
  await ensureListening();
  const key = `user:${userId}`;
  bus().on(key, cb);
  return () => bus().off(key, cb);
}
