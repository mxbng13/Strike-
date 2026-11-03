"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCircle2, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import { fetcher } from "@/lib/client";
import type { CurrentUser } from "@/lib/auth";
import type { RealtimeEvent } from "@/lib/realtime";

/* ───────── Toasts ───────── */

type Toast = { id: number; tone: "success" | "error" | "info"; title: string; body?: string; href?: string | null };
const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.tone === "error" ? 6000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-3" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : Bell;
            const content = (
              <>
                <Icon className={`mt-0.5 size-5 shrink-0 ${t.tone === "success" ? "text-success" : t.tone === "error" ? "text-danger" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  {t.body && <p className="line-clamp-2 text-sm text-muted">{t.body}</p>}
                </div>
              </>
            );
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xl"
              >
                {t.href ? (
                  <Link href={t.href} className="flex min-w-0 flex-1 items-start gap-3" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
                    {content}
                  </Link>
                ) : (
                  content
                )}
                <button aria-label="Fermer" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-muted">
                  <X className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────── Session ───────── */

export type MeResponse = {
  user: CurrentUser | null;
  location: { lat: number; lng: number; label: string; radiusKm: number; postcode: string | null } | null;
  unread: { notifications: number; messages: number };
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse>("/api/me", fetcher, { revalidateOnFocus: true });
  return { me: data?.user ?? null, location: data?.location ?? null, unread: data?.unread ?? { notifications: 0, messages: 0 }, loading: isLoading, error, mutate };
}

/* ───────── Thème ───────── */

function ThemeSync() {
  const { me } = useMe();
  const theme = (me?.settings?.theme as string) ?? "system";
  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      try {
        localStorage.setItem("entour-theme", theme);
      } catch {
        /* stockage indisponible */
      }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

/* ───────── Temps réel ───────── */

type Listener = (e: RealtimeEvent) => void;
const RealtimeCtx = createContext<{ on: (fn: Listener) => () => void; connected: boolean }>({ on: () => () => {}, connected: false });
export const useRealtime = () => useContext(RealtimeCtx);

function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const { mutate } = useSWRConfig();
  const { push } = useToast();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!me) return;
    let es: EventSource | null = null;
    let retry = 1000;
    let closed = false;
    const connect = () => {
      es = new EventSource("/api/realtime");
      es.onopen = () => {
        setConnected(true);
        retry = 1000;
      };
      es.onmessage = (msg) => {
        let e: RealtimeEvent | { type: "hello" };
        try {
          e = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (e.type === "hello") return;
        const ev = e as RealtimeEvent;
        listeners.current.forEach((fn) => fn(ev));
        switch (ev.type) {
          case "notification:new":
            mutate("/api/me");
            mutate("/api/notifications");
            if (ev.notifType === "message" && pathRef.current?.startsWith("/messages")) break;
            push({ tone: "info", title: ev.title, body: ev.body, href: ev.link });
            break;
          case "message:new":
          case "conversation:read":
            mutate((k) => typeof k === "string" && k.startsWith("/api/conversations"));
            mutate("/api/me");
            break;
          case "service:updated":
          case "assignment:updated":
            mutate((k) => typeof k === "string" && (k.startsWith("/api/services") || k.startsWith("/api/conversations") || k.startsWith("/api/missions")));
            break;
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (!closed) setTimeout(connect, (retry = Math.min(retry * 2, 30_000)));
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
    };
  }, [me?.id, mutate, push]); // eslint-disable-line react-hooks/exhaustive-deps

  const on = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return <RealtimeCtx.Provider value={{ on, connected }}>{children}</RealtimeCtx.Provider>;
}

/* ───────── Mode Demandeur / Offreur ───────── */

type Mode = "demandeur" | "offreur";
const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "demandeur", setMode: () => {} });
export const useMode = () => useContext(ModeCtx);

function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("demandeur");
  useEffect(() => {
    try {
      const m = localStorage.getItem("entour-mode");
      if (m === "offreur" || m === "demandeur") setModeState(m);
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("entour-mode", m);
    } catch {
      /* stockage indisponible */
    }
  };
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, shouldRetryOnError: false, revalidateOnFocus: false }}>
      <ToastProvider>
        <ModeProvider>
          <ThemeSync />
          <RealtimeProvider>{children}</RealtimeProvider>
        </ModeProvider>
      </ToastProvider>
    </SWRConfig>
  );
}

/** Exécute une action serveur avec retour visuel (toast) et gestion d'erreur uniforme. */
export function useAction() {
  const { push } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, opts: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
      setPending(key);
      try {
        const r = await fn();
        if (opts.success) push({ tone: "success", title: opts.success });
        if (opts.refresh) router.refresh();
        return r;
      } catch (e) {
        push({ tone: "error", title: e instanceof Error ? e.message : "Une erreur est survenue" });
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [push, router],
  );
  return { run, pending };
}
