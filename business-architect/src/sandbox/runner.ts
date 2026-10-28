import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * Isolated execution of GENERATED code. Never runs in the app process.
 * Layers (each reported in the result):
 *  - fresh temporary directory, deleted afterwards;
 *  - Node permission model: fs read/write limited to that directory, no child
 *    processes, no workers, no native addons;
 *  - network namespace without interfaces (`unshare -n`) when available;
 *  - empty environment (no secrets), CPU / file-size limits (prlimit), wall-clock timeout,
 *    heap cap, bounded stdout/stderr.
 */
export type SandboxFile = { path: string; content: string };
export type SandboxResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  isolation: { network: "namespace" | "not_isolated"; filesystem: "node-permission"; limits: string[] };
};

const MAX_OUTPUT = 64 * 1024;
let unshareOk: boolean | null = null;
let prlimitOk: boolean | null = null;

function probe(cmd: string, args: string[]): boolean {
  try {
    return spawnSync(cmd, args, { timeout: 3000, stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

export function sandboxCapabilities() {
  unshareOk ??= probe("unshare", ["-n", "true"]) || probe("unshare", ["-r", "-n", "true"]);
  prlimitOk ??= probe("prlimit", ["--cpu=1", "true"]);
  return { networkIsolation: unshareOk, resourceLimits: prlimitOk };
}

function safeRel(p: string): string {
  const norm = path.posix.normalize(p.replace(/\\/g, "/")).replace(/^(\.\.(\/|$))+/, "").replace(/^\/+/, "");
  if (!norm || norm.startsWith("..")) throw new Error(`Chemin de fichier refusé : ${p}`);
  return norm;
}

export async function runInSandbox(files: SandboxFile[], entry: string, opts?: { timeoutMs?: number; args?: string[] }): Promise<SandboxResult> {
  const caps = sandboxCapabilities();
  const root = path.resolve(env().SANDBOX_DIR);
  const dir = path.join(root, randomUUID());
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  try {
    for (const f of files) {
      const target = path.join(dir, safeRel(f.path));
      if (!target.startsWith(dir + path.sep)) throw new Error(`Chemin hors sandbox : ${f.path}`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, f.content, "utf8");
    }
    const nodeArgs = [
      "--permission",
      `--allow-fs-read=${dir}`,
      `--allow-fs-write=${dir}`,
      "--max-old-space-size=128",
      path.join(dir, safeRel(entry)),
      ...(opts?.args ?? []),
    ];
    let cmd = process.execPath;
    let args = nodeArgs;
    const limits = ["timeout", "heap 128 Mo", "sortie 64 Ko", "env vide"];
    if (caps.resourceLimits) {
      args = ["--cpu=10", "--fsize=10485760", "--nofile=64", cmd, ...args];
      cmd = "prlimit";
      limits.push("CPU 10 s", "fichiers ≤ 10 Mo", "64 descripteurs");
    }
    if (caps.networkIsolation) {
      args = ["-n", cmd, ...args];
      cmd = "unshare";
    }
    const timeoutMs = opts?.timeoutMs ?? 15_000;
    return await new Promise<SandboxResult>((resolve) => {
      const child = spawn(cmd, args, { cwd: dir, env: { PATH: "/usr/bin:/bin", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (b: Buffer) => (stdout = (stdout + b.toString()).slice(0, MAX_OUTPUT)));
      child.stderr.on("data", (b: Buffer) => (stderr = (stderr + b.toString()).slice(0, MAX_OUTPUT)));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout,
          stderr: stderr.replaceAll(dir, "<sandbox>"),
          durationMs: Date.now() - started,
          timedOut,
          isolation: { network: caps.networkIsolation ? "namespace" : "not_isolated", filesystem: "node-permission", limits },
        });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((e) => logger.warn("sandbox cleanup failed", { error: e }));
  }
}
