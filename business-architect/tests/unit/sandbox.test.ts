import { describe, it, expect } from "vitest";
import { runInSandbox, sandboxCapabilities } from "@/sandbox/runner";

process.env.SANDBOX_DIR = "./sandbox-runs/unit";

describe("sandbox", () => {
  it("exécute un script et capture la sortie", async () => {
    const r = await runInSandbox([{ path: "a.mjs", content: "console.log('ok', 1+1)" }], "a.mjs");
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ok 2");
  });
  it("interdit la lecture hors du répertoire, les sous-processus et l'accès aux secrets", async () => {
    process.env.SECRET_CANARY = "s3cr3t";
    const code = `
      import fs from "node:fs"; import cp from "node:child_process";
      let out = [];
      try { fs.readFileSync("/etc/passwd"); out.push("READ") } catch { out.push("NOREAD") }
      try { cp.execSync("ls"); out.push("EXEC") } catch { out.push("NOEXEC") }
      out.push(process.env.SECRET_CANARY ? "LEAK" : "NOSECRET");
      console.log(out.join(","));`;
    const r = await runInSandbox([{ path: "b.mjs", content: code }], "b.mjs");
    expect(r.stdout.trim()).toBe("NOREAD,NOEXEC,NOSECRET");
  });
  it("coupe le réseau quand l'isolation par namespace est disponible", async () => {
    const r = await runInSandbox([{ path: "n.mjs", content: `fetch("https://example.com").then(()=>console.log("NET")).catch(()=>console.log("NONET"))` }], "n.mjs");
    if (sandboxCapabilities().networkIsolation) expect(r.stdout.trim()).toBe("NONET");
    else expect(r.isolation.network).toBe("not_isolated");
  });
  it("tue un script qui dépasse le délai", async () => {
    const r = await runInSandbox([{ path: "loop.mjs", content: "while(true){}" }], "loop.mjs", { timeoutMs: 1000 });
    expect(r.timedOut).toBe(true);
  });
  it("ramène les chemins « ../ » à l'intérieur de la sandbox", async () => {
    const r = await runInSandbox([{ path: "../../evil.mjs", content: "console.log('contained')" }], "evil.mjs");
    expect(r.stdout.trim()).toBe("contained");
  });
});
