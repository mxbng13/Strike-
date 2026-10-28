import { boss, stopBoss, TASK_QUEUE, setDispatcher, pgBossDispatcher } from "./queue";
import { executeTask, recoverStale } from "./orchestrator";
import { closeDb } from "@/db/client";
import { logger } from "@/lib/logger";
import { runMigrations } from "@/db/migrate";

/**
 * Background worker process (npm run worker). Long business generations never
 * depend on an open HTTP request: the web app only enqueues; this process
 * executes, survives page closes, and recovers interrupted work on restart.
 */
async function main() {
  await runMigrations();
  setDispatcher(pgBossDispatcher);
  const b = await boss();
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 3);
  await b.work<{ taskId: string }>(TASK_QUEUE, { localConcurrency: concurrency, batchSize: 1 }, async (jobs) => {
    for (const job of jobs) await executeTask(job.data.taskId);
  });
  const recovered = await recoverStale();
  logger.info("worker started", { concurrency, recovered: recovered.requeued });
  const timer = setInterval(() => void recoverStale().catch((e) => logger.error("recovery failed", { error: e })), 60_000);

  const shutdown = async (sig: string) => {
    logger.info("worker stopping", { sig });
    clearInterval(timer);
    await stopBoss();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (e) => {
  logger.error("worker crashed", { error: e });
  await closeDb();
  process.exit(1);
});
