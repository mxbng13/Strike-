"use client";

import { MailWarning, MapPin, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { useMe, useToast } from "./providers";

export function AccountBanners() {
  const { me, location, loading } = useMe();
  const { push } = useToast();
  const path = usePathname();
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (loading || !me) return null;
  const banners: React.ReactNode[] = [];
  if (me.status === "suspended")
    banners.push(
      <div key="s" className="flex items-start gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
        <ShieldAlert className="size-5 shrink-0" />
        <p>
          <strong>Compte suspendu.</strong> Vous pouvez consulter l'application mais pas publier, candidater ni envoyer de messages. Contactez le support pour en savoir plus.
        </p>
      </div>,
    );
  if (!me.emailVerified)
    banners.push(
      <div key="e" className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
        <MailWarning className="size-5 shrink-0 text-warning" />
        <p className="min-w-0 flex-1">
          <strong>Confirmez votre e-mail</strong> pour publier et répondre aux demandes. Un lien a été envoyé à {me.email}.
          {devUrl && (
            <>
              {" "}
              <a className="font-semibold text-primary underline" href={devUrl}>
                Lien de développement
              </a>
            </>
          )}
        </p>
        <button
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              const r = await api<{ devUrl: string | null }>("/api/auth/resend-verification", { method: "POST", body: {} });
              setDevUrl(r.devUrl);
              push({ tone: "success", title: "E-mail renvoyé" });
            } catch (e) {
              push({ tone: "error", title: e instanceof Error ? e.message : "Erreur" });
            } finally {
              setSending(false);
            }
          }}
          className="rounded-xl bg-surface px-3 py-1.5 font-semibold text-text shadow-card"
        >
          Renvoyer
        </button>
      </div>,
    );
  if (!location && !path.startsWith("/onboarding") && !path.startsWith("/publier"))
    banners.push(
      <Link key="l" href="/onboarding" className="flex items-center gap-3 rounded-2xl bg-primary-soft p-4 text-sm text-primary">
        <MapPin className="size-5 shrink-0" />
        <span className="flex-1">
          <strong>Indiquez votre quartier</strong> pour voir les demandes et les voisins disponibles autour de vous.
        </span>
        <span className="font-semibold">Configurer →</span>
      </Link>,
    );
  if (!banners.length) return null;
  return <div className="mb-4 space-y-2">{banners}</div>;
}
