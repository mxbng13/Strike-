"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CornerUpLeft,
  EyeOff,
  FileText,
  Flag,
  Languages,
  Loader2,
  MapPin,
  Mic,
  MoreVertical,
  Paperclip,
  Send,
  SmilePlus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import { MissionBox, type MissionCtx } from "@/components/mission-box";
import { useMe, useRealtime, useToast } from "@/components/providers";
import { ReportSheet } from "@/components/report-button";
import { Avatar, Button, Confirm, ErrorState, Select, Sheet, Spinner, Stars, cx } from "@/components/ui";
import { api, getBrowserPosition, uploadFile } from "@/lib/client";

type Msg = {
  id: string;
  senderId: string | null;
  kind: "text" | "image" | "video" | "file" | "audio" | "location" | "system" | "action";
  body: string;
  deleted: boolean;
  meta: { location?: { lat: number; lng: number; expiresAt: string; label?: string }; action?: { type: string } };
  createdAt: string;
  replyTo: { id: string; body: string; kind: string; senderId: string | null } | null;
  attachments: { id: string; url: string; mimeType: string; fileName: string; sizeBytes: number; durationMs: number | null }[];
  reactions: { emoji: string; users: string[] }[];
  pending?: boolean;
};
type Conv = {
  id: string;
  kind: string;
  archived: boolean;
  muted: boolean;
  blocked: boolean;
  iBlocked: boolean;
  other: { userId: string; firstName: string; avatarUrl: string | null; lastReadAt: string | null; lastDeliveredAt: string | null; ratingAvg: number; ratingCount: number } | null;
  mission: MissionCtx | null;
};

const EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "👏"];

function dayLabel(d: Date) {
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === t.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
const hm = (s: string) => new Date(s).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fileSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.round(b / 1e3)} Ko`);

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { push } = useToast();
  const { on } = useRealtime();
  const { data, error, mutate } = useSWR<{ conversation: Conv; messages: Msg[] }>(`/api/conversations/${id}`);
  const [older, setOlder] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [locMinutes, setLocMinutes] = useState("30");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState<{ rec: MediaRecorder; start: number } | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conv = data?.conversation;
  const messages = [...older, ...(data?.messages ?? [])].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  const myId = me?.id;

  const markRead = useCallback(() => {
    api(`/api/conversations/${id}/read`, { body: {} }).catch(() => {});
  }, [id]);

  useEffect(() => {
    markRead();
  }, [markRead, data?.messages.length]);

  // Temps réel : nouveaux messages, frappe, accusés de lecture
  useEffect(
    () =>
      on((e) => {
        if (!("conversationId" in e) || e.conversationId !== id) return;
        if (e.type === "typing" && e.userId !== myId) {
          setTypingName(e.name);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTypingName(null), 4000);
        }
        if (e.type === "message:new" || e.type === "message:updated" || e.type === "conversation:read") {
          if (e.type === "message:new" && e.senderId !== myId) setTypingName(null);
          mutate();
        }
      }),
    [on, id, myId, mutate],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length, typingName]);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await api<{ messages: Msg[] }>(`/api/conversations/${id}/messages?before=${encodeURIComponent(messages[0].createdAt)}`);
      setOlder((o) => [...r.messages, ...o]);
      setHasMore(r.messages.length >= 50);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (payload: Record<string, unknown>, optimistic?: Partial<Msg>) => {
    const tempId = `tmp-${Date.now()}`;
    if (optimistic && data) {
      mutate(
        {
          ...data,
          messages: [
            ...data.messages,
            { id: tempId, senderId: myId ?? null, kind: "text", body: "", deleted: false, meta: {}, createdAt: new Date().toISOString(), replyTo: null, attachments: [], reactions: [], pending: true, ...optimistic } as Msg,
          ],
        },
        false,
      );
    }
    atBottom.current = true;
    try {
      const r = await api<{ id: string; warning: string | null }>(`/api/conversations/${id}/messages`, { body: { ...payload, replyToId: replyTo?.id ?? null } });
      if (r.warning) setWarning(r.warning);
      setReplyTo(null);
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      mutate();
    }
  };

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2500 && v.trim()) {
      lastTyping.current = Date.now();
      api(`/api/conversations/${id}/typing`, { body: {} }).catch(() => {});
    }
  };

  const submitText = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    send({ kind: "text", body }, { body });
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        const r = await uploadFile(f, "message", id);
        const kind = r.kind === "image" ? "image" : r.kind === "video" ? "video" : r.kind === "audio" ? "audio" : "file";
        await send({ kind, body: "", attachmentKeys: [r.key] });
      }
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      const start = Date.now();
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - start;
        if (durationMs < 800) return;
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const file = new File([new Blob(chunks, { type })], `vocal.${type.includes("mp4") ? "m4a" : "webm"}`, { type });
        setUploading(true);
        try {
          const r = await uploadFile(file, "message", id);
          await send({ kind: "audio", body: "", attachmentKeys: [r.key], durationMs });
        } catch (e) {
          push({ tone: "error", title: (e as Error).message });
        } finally {
          setUploading(false);
        }
      };
      rec.start();
      setRecording({ rec, start });
      setRecSeconds(0);
    } catch {
      push({ tone: "error", title: "Micro indisponible", body: "Autorisez l'accès au micro pour envoyer un message vocal." });
    }
  };
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSeconds(Math.floor((Date.now() - recording.start) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  const shareLocation = async () => {
    try {
      const pos = await getBrowserPosition();
      await send({ kind: "location", body: "", location: { lat: pos.lat, lng: pos.lng, minutes: Number(locMinutes) } });
      setLocOpen(false);
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    }
  };

  const setFlags = async (flags: Record<string, boolean>, success: string, leave = false) => {
    try {
      await api(`/api/conversations/${id}`, { method: "PATCH", body: flags });
      push({ tone: "success", title: success });
      setMenu(false);
      if (leave) router.push("/messages");
      else mutate();
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    }
  };

  const translate = async (m: Msg) => {
    try {
      const r = await api<{ text: string }>("/api/assistant/translate", { body: { text: m.body, lang: navigator.language?.startsWith("fr") ? "anglais" : "français" } });
      setTranslations((t) => ({ ...t, [m.id]: r.text }));
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!conv || !data) return <Spinner className="mx-auto mt-20 size-8" />;
  const other = conv.other;
  const myLast = [...messages].reverse().find((m) => m.senderId === myId && !m.pending);
  const readUpTo = other?.lastReadAt ? new Date(other.lastReadAt) : null;
  const deliveredUpTo = other?.lastDeliveredAt ? new Date(other.lastDeliveredAt) : null;
  const canWrite = !conv.blocked;

  return (
    <div className="-mx-4 -mb-28 -mt-4 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6 lg:-mb-12 lg:-mt-8 lg:h-dvh">
      {/* En-tête */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
        <Link href="/messages" aria-label="Retour" className="rounded-full p-2 hover:bg-surface-2">
          <ArrowLeft className="size-5" />
        </Link>
        {other && (
          <Link href={`/u/${other.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar src={other.avatarUrl} name={other.firstName} size={40} />
            <span className="min-w-0">
              <span className="block truncate font-bold">{other.firstName}</span>
              <span className="block text-xs text-muted">{typingName ? <span className="font-semibold text-primary">écrit…</span> : <Stars value={other.ratingAvg} count={other.ratingCount} size={11} />}</span>
            </span>
          </Link>
        )}
        <div className="relative">
          <button aria-label="Options de la conversation" onClick={() => setMenu((m) => !m)} className="rounded-full p-2 hover:bg-surface-2">
            <MoreVertical className="size-5" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-xl">
                {[
                  { i: conv.archived ? Archive : Archive, l: conv.archived ? "Désarchiver" : "Archiver", f: () => setFlags({ archived: !conv.archived }, conv.archived ? "Conversation désarchivée" : "Conversation archivée", !conv.archived) },
                  { i: conv.muted ? Bell : BellOff, l: conv.muted ? "Réactiver les notifications" : "Mettre en sourdine", f: () => setFlags({ muted: !conv.muted }, conv.muted ? "Notifications réactivées" : "Conversation en sourdine") },
                  { i: EyeOff, l: "Supprimer de mon affichage", f: () => setFlags({ hide: true }, "Conversation supprimée de votre affichage", true) },
                  { i: Flag, l: "Signaler la conversation", f: () => { setMenu(false); setReportOpen(true); }, danger: true },
                  { i: Ban, l: conv.iBlocked ? "Débloquer" : `Bloquer ${other?.firstName ?? ""}`, f: () => { setMenu(false); setBlockOpen(true); }, danger: true },
                ].map((x) => (
                  <button key={x.l} onClick={x.f} className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2", x.danger && "text-danger")}>
                    <x.i className="size-4" /> {x.l}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {conv.mission && other && <MissionBox m={conv.mission} conversationId={id} otherName={other.firstName} onChange={() => mutate()} />}

      {/* Messages */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {hasMore && messages.length >= 50 && (
          <div className="mb-2 text-center">
            <Button size="sm" variant="ghost" loading={loadingOlder} onClick={loadOlder}>
              Messages plus anciens
            </Button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Démarrez la conversation. Restez courtois et ne communiquez jamais de code reçu par SMS.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const mine = m.senderId === myId && m.kind !== "system";
          const grouped = prev && prev.senderId === m.senderId && !newDay && prev.kind !== "system" && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 120_000;
          return (
            <div key={m.id}>
              {newDay && <p className="my-3 text-center text-xs font-semibold capitalize text-muted">{dayLabel(new Date(m.createdAt))}</p>}
              {m.kind === "system" || m.kind === "action" ? (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto my-2 max-w-md rounded-2xl bg-surface-2 px-4 py-2 text-center text-xs text-muted">
                  {m.body} <span className="opacity-60">· {hm(m.createdAt)}</span>
                </motion.p>
              ) : (
                <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.15 }} className={cx("group flex items-end gap-2", mine ? "justify-end" : "justify-start", !grouped && "mt-2")}>
                  <div className={cx("relative max-w-[80%] sm:max-w-[65%]", mine && "order-2")}>
                    <div
                      className={cx(
                        "rounded-3xl px-3.5 py-2 text-[15px] leading-relaxed",
                        mine ? "rounded-br-lg bg-primary text-primary-ink" : "rounded-bl-lg border border-border bg-surface",
                        m.pending && "opacity-60",
                        m.deleted && "italic opacity-60",
                      )}
                    >
                      {m.replyTo && (
                        <div className={cx("mb-1.5 rounded-xl border-l-2 px-2 py-1 text-xs", mine ? "border-white/60 bg-white/10" : "border-primary bg-surface-2")}>
                          <p className="line-clamp-2 opacity-80">{m.replyTo.body || "Pièce jointe"}</p>
                        </div>
                      )}
                      {m.deleted ? (
                        "Message retiré"
                      ) : (
                        <>
                          {m.attachments.map((a) =>
                            a.mimeType.startsWith("image/") ? (
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={a.url} alt={a.fileName} className="my-1 max-h-72 rounded-2xl object-cover" />
                              </a>
                            ) : a.mimeType.startsWith("video/") ? (
                              <video key={a.id} src={a.url} controls className="my-1 max-h-72 rounded-2xl" />
                            ) : a.mimeType.startsWith("audio/") ? (
                              <div key={a.id} className="flex items-center gap-2 py-1">
                                <Mic className="size-4 shrink-0" />
                                <audio src={a.url} controls className="h-9 max-w-[220px]" />
                              </div>
                            ) : (
                              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className={cx("my-1 flex items-center gap-2 rounded-2xl px-3 py-2", mine ? "bg-white/15" : "bg-surface-2")}>
                                <FileText className="size-5 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold">{a.fileName}</span>
                                  <span className="block text-xs opacity-70">{fileSize(a.sizeBytes)}</span>
                                </span>
                              </a>
                            ),
                          )}
                          {m.kind === "location" && m.meta.location && (
                            <LocationBubble loc={m.meta.location} mine={mine} />
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          {translations[m.id] && <p className="mt-1 border-t border-current/20 pt-1 text-sm italic opacity-80">{translations[m.id]}</p>}
                        </>
                      )}
                    </div>
                    {m.reactions.length > 0 && (
                      <div className={cx("-mt-2 flex gap-0.5", mine ? "justify-end pr-2" : "pl-2")}>
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            onClick={() => api(`/api/messages/${m.id}`, { body: { emoji: r.emoji } }).then(() => mutate())}
                            className={cx("rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs shadow-sm", myId && r.users.includes(myId) && "border-primary")}
                          >
                            {r.emoji} {r.users.length > 1 && r.users.length}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className={cx("mt-0.5 flex items-center gap-1 px-2 text-[11px] text-muted", mine ? "justify-end" : "justify-start")}>
                      {hm(m.createdAt)}
                      {mine && myLast?.id === m.id && (
                        <span className="inline-flex items-center gap-0.5" aria-label="Statut du message">
                          {readUpTo && readUpTo >= new Date(m.createdAt) ? (
                            <>
                              <CheckCheck className="size-3.5 text-primary" /> Lu
                            </>
                          ) : deliveredUpTo && deliveredUpTo >= new Date(m.createdAt) ? (
                            <>
                              <CheckCheck className="size-3.5" /> Distribué
                            </>
                          ) : (
                            <>
                              <Check className="size-3.5" /> Envoyé
                            </>
                          )}
                        </span>
                      )}
                    </p>
                    {/* Actions au survol / appui */}
                    {!m.deleted && !m.pending && (
                      <div className={cx("absolute top-1 hidden gap-0.5 group-hover:flex", mine ? "-left-24" : "-right-24")}>
                        <button aria-label="Répondre" onClick={() => setReplyTo(m)} className="rounded-full bg-surface p-1.5 shadow-card">
                          <CornerUpLeft className="size-3.5" />
                        </button>
                        <button aria-label="Réagir" onClick={() => setReactFor(reactFor === m.id ? null : m.id)} className="rounded-full bg-surface p-1.5 shadow-card">
                          <SmilePlus className="size-3.5" />
                        </button>
                        {m.body && !mine && (
                          <button aria-label="Traduire" onClick={() => translate(m)} className="rounded-full bg-surface p-1.5 shadow-card">
                            <Languages className="size-3.5" />
                          </button>
                        )}
                        {mine && Date.now() - new Date(m.createdAt).getTime() < 15 * 60_000 && (
                          <button aria-label="Retirer le message" onClick={() => api(`/api/messages/${m.id}`, { method: "DELETE" }).then(() => mutate())} className="rounded-full bg-surface p-1.5 shadow-card">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <AnimatePresence>
                      {reactFor === m.id && (
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className={cx("absolute -top-11 z-20 flex gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-xl", mine ? "right-0" : "left-0")}>
                          {EMOJIS.map((e) => (
                            <button
                              key={e}
                              className="text-xl transition hover:scale-125"
                              onClick={() => {
                                setReactFor(null);
                                api(`/api/messages/${m.id}`, { body: { emoji: e } }).then(() => mutate());
                              }}
                            >
                              {e}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {/* Bouton mobile pour répondre/réagir (pas de survol sur écran tactile) */}
                  <button aria-label="Actions du message" onClick={() => setReactFor(reactFor === m.id ? null : m.id)} onDoubleClick={() => setReplyTo(m)} className={cx("mb-6 shrink-0 rounded-full p-1 text-muted opacity-40 sm:hidden", mine && "order-1")}>
                    <SmilePlus className="size-4" />
                  </button>
                </motion.div>
              )}
            </div>
          );
        })}
        <AnimatePresence>
          {typingName && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 flex items-center gap-2">
              <span className="flex gap-1 rounded-3xl rounded-bl-lg border border-border bg-surface px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <motion.span key={d} className="size-1.5 rounded-full bg-muted" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />
                ))}
              </span>
              <span className="text-xs text-muted">{typingName} écrit…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {warning && (
        <div className="flex items-start gap-2 border-t border-warning/30 bg-warning-soft px-4 py-2 text-xs text-warning">
          <span className="flex-1">{warning}</span>
          <button onClick={() => setWarning(null)} aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Saisie */}
      {canWrite ? (
        <div className="border-t border-border bg-surface px-3 py-2.5 pb-safe">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <CornerUpLeft className="size-4 text-primary" />
              <p className="min-w-0 flex-1 truncate text-muted">{replyTo.body || "Pièce jointe"}</p>
              <button onClick={() => setReplyTo(null)} aria-label="Annuler la réponse">
                <X className="size-4" />
              </button>
            </div>
          )}
          {recording ? (
            <div className="flex items-center gap-3">
              <span className="size-3 animate-pulse rounded-full bg-danger" />
              <span className="flex-1 text-sm font-semibold">Enregistrement… {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}</span>
              <Button variant="ghost" size="sm" onClick={() => { recording.rec.ondataavailable = null; recording.rec.onstop = () => recording.rec.stream.getTracks().forEach((t) => t.stop()); recording.rec.stop(); setRecording(null); }}>
                Annuler
              </Button>
              <Button size="sm" icon={<Square className="size-4" />} onClick={() => { recording.rec.stop(); setRecording(null); }}>
                Envoyer
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-1.5">
              <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label="Joindre un fichier">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
                <input type="file" className="hidden" multiple accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf,text/plain" onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
              </label>
              <button aria-label="Partager ma position" onClick={() => setLocOpen(true)} className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                <MapPin className="size-5" />
              </button>
              <textarea
                value={text}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitText();
                  }
                }}
                rows={1}
                placeholder="Écrire un message…"
                aria-label="Message"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-3xl border border-border bg-surface-2 px-4 py-2.5 text-[15px] focus:border-primary focus:outline-none"
                style={{ height: Math.min(128, 40 + (text.split("\n").length - 1) * 22) }}
              />
              {text.trim() ? (
                <motion.button whileTap={{ scale: 0.85 }} aria-label="Envoyer" onClick={submitText} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink">
                  <Send className="size-5" />
                </motion.button>
              ) : (
                <button aria-label="Enregistrer un message vocal" onClick={startRecording} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Mic className="size-5" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="border-t border-border bg-surface px-4 py-4 text-center text-sm text-muted">{conv.iBlocked ? "Vous avez bloqué cette personne." : "Vous ne pouvez plus échanger avec cette personne."}</p>
      )}

      <Sheet open={locOpen} onClose={() => setLocOpen(false)} title="Partager ma position" footer={<Button full onClick={shareLocation} icon={<MapPin className="size-4" />}>Partager ma position</Button>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Votre position actuelle sera visible par {other?.firstName} uniquement, pendant la durée choisie. Utile pour se retrouver ou suivre une livraison.</p>
          <Select value={locMinutes} onChange={(e) => setLocMinutes(e.target.value)}>
            {[15, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                Pendant {n < 60 ? `${n} minutes` : `${n / 60} heure${n > 60 ? "s" : ""}`}
              </option>
            ))}
          </Select>
        </div>
      </Sheet>
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="conversation" targetId={id} label="la conversation" />
      <Confirm
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={conv.iBlocked ? `Débloquer ${other?.firstName} ?` : `Bloquer ${other?.firstName} ?`}
        tone={conv.iBlocked ? "primary" : "danger"}
        confirmLabel={conv.iBlocked ? "Débloquer" : "Bloquer"}
        description={conv.iBlocked ? "Vous pourrez de nouveau échanger." : "Cette personne ne pourra plus vous écrire, voir vos demandes ni répondre à vos annonces. Elle n'en sera pas informée."}
        onConfirm={async () => {
          await api("/api/blocks", { method: conv.iBlocked ? "DELETE" : "POST", body: { userId: other?.userId } });
          setBlockOpen(false);
          push({ tone: "success", title: conv.iBlocked ? "Utilisateur débloqué" : "Utilisateur bloqué" });
          mutate();
        }}
      />
    </div>
  );
}

function LocationBubble({ loc, mine }: { loc: { lat: number; lng: number; expiresAt: string; label?: string }; mine: boolean }) {
  const expired = new Date(loc.expiresAt) < new Date();
  return (
    <div className={cx("my-1 rounded-2xl px-3 py-2", mine ? "bg-white/15" : "bg-surface-2")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="size-4" /> Position partagée
      </p>
      {expired ? (
        <p className="text-xs opacity-70">Partage expiré</p>
      ) : (
        <>
          <p className="text-xs opacity-70">Visible jusqu'à {hm(loc.expiresAt)}</p>
          <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold underline">
            Ouvrir dans la carte
          </a>
        </>
      )}
    </div>
  );
}
