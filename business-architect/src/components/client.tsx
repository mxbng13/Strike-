"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

export async function apiCall<T = unknown>(url: string, method = "POST", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? `Erreur ${res.status}`);
  return data as T;
}

const btn = "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
export const btnPrimary = `${btn} bg-brand-600 text-white hover:bg-brand-700`;
export const btnSecondary = `${btn} border border-line bg-white hover:bg-gray-50`;
export const btnDanger = `${btn} border border-red-200 bg-white text-red-700 hover:bg-red-50`;
const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null;
}

/** true once React has hydrated: before that, a native submit would bypass our handlers. */
function useHydrated(): boolean {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiCall(`/api/auth/${mode}`, "POST", Object.fromEntries(f.entries()));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    // method="post": even a pre-hydration native submit never puts credentials in the URL.
    <form onSubmit={submit} method="post" className="space-y-4">
      {mode === "signup" && (
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium">Nom</label>
          <input id="displayName" name="displayName" required className={input} autoComplete="name" />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">E-mail</label>
        <input id="email" name="email" type="email" required className={input} autoComplete="email" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Mot de passe {mode === "signup" && <span className="text-ink-2">(10 caractères minimum)</span>}</label>
        <input id="password" name="password" type="password" required minLength={mode === "signup" ? 10 : 1} className={input} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      </div>
      <ErrorText error={error} />
      <button className={`${btnPrimary} w-full`} disabled={busy || !hydrated}>{busy ? "…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}</button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="text-sm text-ink-2 hover:text-ink" onClick={async () => { await apiCall("/api/auth/logout"); router.push("/login"); router.refresh(); }}>
      Déconnexion
    </button>
  );
}

export function NewProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button className={btnPrimary} disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const { project } = await apiCall<{ project: { id: string } }>("/api/projects", "POST", {});
          router.push(`/projects/${project.id}`);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}>
        {busy ? "Création…" : "+ Créer un nouveau business"}
      </button>
      <ErrorText error={error} />
    </div>
  );
}

type IntakeState = { messages: Array<{ id: string; role: "assistant" | "user"; content: string }>; nextQuestion: { key: string; quickReplies: string[] } | null; complete: boolean };

/** The short adaptive conversation (never asks for a business idea). */
export function IntakeChat({ projectId, initial }: { projectId: string; initial: IntakeState }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [state, setState] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Recent browsers return a Promise from scrollIntoView: never return it as an effect cleanup.
    void bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length]);
  async function send(t: string) {
    if (!t.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setState(await apiCall<IntakeState>(`/api/projects/${projectId}/intake`, "POST", { text: t }));
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    setBusy(true);
    try {
      await apiCall(`/api/projects/${projectId}/run`, "POST", { action: "start" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {state.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-gray-100 text-ink"}`}>{m.content}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {state.complete ? (
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={launch} disabled={busy || !hydrated}>{busy ? "Lancement…" : "Lancer la création du business"}</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {state.nextQuestion?.quickReplies.map((q) => (
              <button key={q} disabled={busy || !hydrated} onClick={() => send(q)} className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm text-brand-700 hover:bg-brand-100">{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(text); }} method="post" className="flex gap-2">
            <label htmlFor="answer" className="sr-only">Ta réponse</label>
            <input id="answer" value={text} onChange={(e) => setText(e.target.value)} className={input} placeholder="Ta réponse (ou « je ne sais pas »)" disabled={busy} />
            <button className={btnPrimary} disabled={busy || !hydrated || !text.trim()}>Envoyer</button>
          </form>
        </>
      )}
      <ErrorText error={error} />
    </div>
  );
}

type Progress = {
  project: { status: string; statusReason: string | null };
  run: { status: string; iteration: number } | null;
  tasks: Array<{ id: string; label: string; status: string; agentId: string; attempts: number; lastError: string | null; phase: string; input: { generation?: number } }>;
  events: Array<{ id: number; type: string; message: string; createdAt: string }>;
};

const TASK_ICON: Record<string, string> = { succeeded: "✓", running: "⟳", failed: "✕", blocked: "⚠", paused_budget: "€", cancelled: "–", queued: "…", ready: "…", pending: "○" };
const TASK_COLOR: Record<string, string> = { succeeded: "text-green-700", running: "text-brand-600", failed: "text-red-700", blocked: "text-red-700", paused_budget: "text-amber-700" };

/** Live progress synchronised with the REAL task table (polling). */
export function LiveProgress({ projectId, initial }: { projectId: string; initial: Progress }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [events, setEvents] = useState(initial.events);
  const last = useRef(initial.events.at(-1)?.id ?? 0);
  const prevStatus = useRef(initial.project.status);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const data = await apiCall<Progress>(`/api/projects/${projectId}/progress?after=${last.current}`, "GET");
        if (stop) return;
        setP(data);
        if (data.events.length) {
          last.current = data.events.at(-1)!.id;
          setEvents((e) => [...e, ...data.events].slice(-80));
        }
        if (data.project.status !== prevStatus.current) {
          prevStatus.current = data.project.status;
          router.refresh();
        }
      } catch {
        /* transient */
      }
    };
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [projectId, router]);
  const visible = p.tasks.filter((t) => t.status !== "cancelled");
  const done = visible.filter((t) => t.status === "succeeded").length;
  const stuck = p.tasks.some((t) => t.status === "queued") && !p.tasks.some((t) => t.status === "running");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-sm text-ink-2">
          {done}/{visible.length} étapes terminées{p.run ? ` · itération de découverte ${p.run.iteration}` : ""}. Étapes affichées = tâches réellement planifiées et exécutées.
        </p>
        {stuck && p.project.status === "running" && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Des tâches attendent un worker. Si cela dure, vérifie que le processus <code>npm run worker</code> est lancé.</p>}
        <ol className="space-y-1">
          {visible.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden className={`w-4 text-center ${TASK_COLOR[t.status] ?? "text-gray-400"}`}>{TASK_ICON[t.status] ?? "·"}</span>
              <span className={t.status === "running" ? "font-semibold" : ""}>
                {t.label}
                {(t.input?.generation ?? 1) > 1 && <span className="text-ink-2"> (passe {t.input.generation})</span>}
                <span className="sr-only"> — {t.status}</span>
                {t.attempts > 1 && <span className="text-xs text-ink-2"> · tentative {t.attempts}</span>}
                {t.lastError && t.status !== "succeeded" && <span className="block text-xs text-red-700">{t.lastError}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Journal en direct</h3>
        <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="border-b border-line py-1">
              <span className="text-ink-2">{new Date(e.createdAt).toLocaleTimeString("fr-FR")}</span> {e.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RunControls({ projectId, status, hasRun }: { projectId: string; status: string; hasRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showContest, setShowContest] = useState(false);
  const act = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await apiCall(`/api/projects/${projectId}/run`, "POST", { action, ...extra });
      setShowContest(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "ready" && !hasRun && <button className={btnPrimary} disabled={busy} onClick={() => act("start")}>Lancer la création</button>}
        {status === "running" && <button className={btnSecondary} disabled={busy} onClick={() => act("pause")}>Mettre en pause</button>}
        {(status === "paused" || status === "blocked") && <button className={btnPrimary} disabled={busy} onClick={() => act("resume")}>Reprendre</button>}
        {status !== "intake" && <button className={btnSecondary} disabled={busy} onClick={() => setShowContest((v) => !v)}>Contester / demander une nouvelle piste</button>}
      </div>
      {showContest && (
        <form className="space-y-2 rounded-lg border border-line p-3" onSubmit={(e) => { e.preventDefault(); void act("new_direction", { reason }); }}>
          <label htmlFor="reason" className="block text-sm font-medium">Pourquoi ? (l'IA rejettera le choix actuel et explorera d'autres directions)</label>
          <textarea id="reason" className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className={btnPrimary} disabled={busy}>Relancer l'exploration</button>
        </form>
      )}
      <ErrorText error={error} />
    </div>
  );
}

export function ApprovalButtons({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: "approved" | "rejected") => {
    if (decision === "approved" && !window.confirm("Confirmer l'approbation de cette action ? Elle peut engager des dépenses ou des effets externes.")) return;
    setBusy(true);
    try {
      await apiCall(`/api/approvals/${approvalId}`, "POST", { decision });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnPrimary} disabled={busy} onClick={() => decide("approved")}>Approuver</button>
      <button className={btnDanger} disabled={busy} onClick={() => decide("rejected")}>Refuser</button>
      <ErrorText error={error} />
    </div>
  );
}

export function JsonForm({ url, method = "PUT", fields, submitLabel }: { url: string; method?: string; submitLabel: string; fields: Array<{ name: string; label: string; type: "number" | "select" | "text" | "checkbox"; value: string | number | boolean; options?: Array<[string, string]>; help?: string }> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const fd of fields) {
      if (fd.type === "checkbox") body[fd.name] = f.get(fd.name) === "on";
      else if (fd.type === "number") body[fd.name] = Number(f.get(fd.name));
      else if (fd.name === "exclusions" || fd.name === "skills") body[fd.name] = String(f.get(fd.name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      else body[fd.name] = f.get(fd.name);
    }
    setError(null);
    setOk(false);
    try {
      await apiCall(url, method, body);
      setOk(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {fields.map((fd) => (
        <div key={fd.name}>
          {fd.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={fd.name} defaultChecked={Boolean(fd.value)} /> {fd.label}</label>
          ) : (
            <>
              <label htmlFor={fd.name} className="mb-1 block text-sm font-medium">{fd.label}</label>
              {fd.type === "select" ? (
                <select id={fd.name} name={fd.name} defaultValue={String(fd.value)} className={input}>
                  {fd.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input id={fd.name} name={fd.name} type={fd.type} step="any" defaultValue={String(fd.value)} className={input} />
              )}
            </>
          )}
          {fd.help && <p className="mt-1 text-xs text-ink-2">{fd.help}</p>}
        </div>
      ))}
      <button className={btnPrimary}>{submitLabel}</button>
      {ok && <p className="text-sm text-green-700">Enregistré.</p>}
      <ErrorText error={error} />
    </form>
  );
}
