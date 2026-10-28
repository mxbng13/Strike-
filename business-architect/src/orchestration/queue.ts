import { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

export const TASK_QUEUE = "agent-task";

export interface Dispatcher {
  enqueue(taskIds: string[], opts?: { delaySeconds?: number }): Promise<void>;
}

/** Test / inline mode: nothing is sent; callers drain with runUntilIdle(). */
export const noopDispatcher: Dispatcher = { enqueue: async () => {} };

const g = globalThis as unknown as { __baBoss?: Promise<PgBoss>; __baDispatcher?: Dispatcher };

export async function boss(): Promise<PgBoss> {
  g.__baBoss ??= (async () => {
    const b = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
    b.on("error", (e) => logger.error("pg-boss error", { error: e }));
    await b.start();
    await b.createQueue(TASK_QUEUE, { policy: "stately", retryLimit: 0, expireInSeconds: 20 * 60 }).catch(() => undefined);
    return b;
  })();
  return g.__baBoss;
}

export async function stopBoss(): Promise<void> {
  if (g.__baBoss) {
    const b = await g.__baBoss;
    g.__baBoss = undefined;
    await b.stop({ graceful: true });
  }
}

/**
 * pg-boss transport. Our agent_tasks table stays the source of truth; jobs only
 * carry task ids. singletonKey = taskId (stately policy) prevents duplicate
 * queued jobs for the same task.
 */
export const pgBossDispatcher: Dispatcher = {
  async enqueue(taskIds, opts) {
    const b = await boss();
    for (const id of taskIds) {
      await b.send(TASK_QUEUE, { taskId: id }, { singletonKey: id, startAfter: opts?.delaySeconds ?? 0 });
    }
  },
};

export function setDispatcher(d: Dispatcher): void {
  g.__baDispatcher = d;
}

export function dispatcher(): Dispatcher {
  return g.__baDispatcher ?? pgBossDispatcher;
}
