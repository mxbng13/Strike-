"use client";

import { Download, Moon, Sun, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { LocationPicker, type PickedLocation } from "@/components/location-picker";
import { useMe, useToast } from "@/components/providers";
import { Avatar, Button, Card, Chip, Confirm, Field, Input, PageHeader, Segmented, Select, Switch, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { RADII_KM } from "@/lib/geo";

type Cat = { id: number; name: string; icon: string; color: string };
type Settings = { theme?: "light" | "dark" | "system"; dndUntil?: string | null; dndNightly?: boolean; dailyDigest?: boolean; notifyNewMissions?: boolean; notifyUrgent?: boolean; maxNotifPerHour?: number; autoTranslate?: boolean; language?: string };

function Section({ id, title, children, description }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-1 font-bold">{title}</h2>
      {description && <p className="mb-2 text-sm text-muted">{description}</p>}
      <Card className="p-4">{children}</Card>
    </section>
  );
}

export default function SettingsPage() {
  const { me, location, mutate } = useMe();
  const { push } = useToast();
  const { data: cats } = useSWR<{ categories: Cat[] }>("/api/categories");
  const { data: blocked, mutate: mutateBlocked } = useSWR<{ blocked: { id: string; firstName: string; avatarUrl: string | null }[] }>("/api/blocks");
  const [settings, setSettings] = useState<Settings>({});
  const [muted, setMuted] = useState<number[]>([]);
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [radius, setRadius] = useState(5);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (me) setSettings(me.settings as Settings);
  }, [me]);
  useEffect(() => {
    if (location) {
      setLoc({ lat: location.lat, lng: location.lng, label: location.label, postcode: location.postcode });
      setRadius(location.radiusKm);
    }
  }, [location]);
  useEffect(() => {
    api<{ muted: number[] }>("/api/me/muted-categories").then((r) => setMuted(r.muted)).catch(() => {});
  }, []);

  const patch = async (p: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...p }));
    try {
      await api("/api/me/settings", { method: "PATCH", body: p });
      await mutate();
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    }
  };
  const dndActive = !!settings.dndUntil && new Date(settings.dndUntil) > new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader back="/profil" title="Paramètres" />

      <Section id="localisation" title="Ma zone" description="Utilisée pour vous montrer les demandes proches et vous alerter. Jamais affichée publiquement.">
        <LocationPicker value={loc} onChange={setLoc} mode="city" />
        <p className="mb-2 mt-4 text-sm font-semibold">Rayon de recherche et d'alerte</p>
        <div className="flex flex-wrap gap-2">
          {RADII_KM.map((r) => (
            <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
              {r} km
            </Chip>
          ))}
        </div>
        <Button
          className="mt-4"
          disabled={!loc}
          loading={busy === "loc"}
          onClick={async () => {
            setBusy("loc");
            try {
              await api("/api/me/location", { method: "PUT", body: { lat: loc!.lat, lng: loc!.lng, label: loc!.label, postcode: loc!.postcode, radiusKm: radius } });
              await mutate();
              push({ tone: "success", title: "Zone enregistrée" });
            } catch (e) {
              push({ tone: "error", title: (e as Error).message });
            } finally {
              setBusy(null);
            }
          }}
        >
          Enregistrer ma zone
        </Button>
      </Section>

      <Section id="notifications" title="Notifications">
        <Switch checked={settings.notifyNewMissions !== false} onChange={(v) => patch({ notifyNewMissions: v })} label="Nouvelles missions correspondant à mes compétences" />
        <Switch checked={settings.notifyUrgent !== false} onChange={(v) => patch({ notifyUrgent: v })} label="Alertes pour les missions urgentes" description="Même si les autres alertes sont désactivées ou en mode « ne pas déranger »." />
        <Switch checked={settings.dailyDigest !== false} onChange={(v) => patch({ dailyDigest: v })} label="Résumé quotidien des demandes à proximité" />
        <Field label="Nombre maximum d'alertes de missions par heure" className="mt-2">
          <Select value={settings.maxNotifPerHour ?? 6} onChange={(e) => patch({ maxNotifPerHour: Number(e.target.value) })} className="w-40">
            {[1, 3, 6, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Ne pas déranger">
        <Switch checked={!!settings.dndNightly} onChange={(v) => patch({ dndNightly: v })} label="La nuit (22 h – 8 h)" />
        <Switch
          checked={dndActive}
          onChange={(v) => patch({ dndUntil: v ? new Date(Date.now() + 8 * 3600_000).toISOString() : null })}
          label="Pendant 8 heures"
          description={dndActive ? `Actif jusqu'à ${new Date(settings.dndUntil!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Suspendez les alertes de nouvelles missions."}
        />
      </Section>

      <Section title="Catégories en silencieux" description="Vous ne recevrez plus d'alertes pour ces catégories.">
        <div className="flex flex-wrap gap-2">
          {cats?.categories.map((c) => {
            const on = muted.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={async () => {
                  const next = on ? muted.filter((x) => x !== c.id) : [...muted, c.id];
                  setMuted(next);
                  await api("/api/me/muted-categories", { method: "PUT", body: { categoryIds: next } }).catch((e) => push({ tone: "error", title: e.message }));
                }}
                className={cx("inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm", on ? "border-danger/40 bg-danger-soft text-danger line-through" : "border-border")}
              >
                <CategoryBubble icon={c.icon} color={c.color} size={24} />
                {c.name}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Apparence et langue">
        <Segmented
          value={settings.theme ?? "system"}
          onChange={(v) => patch({ theme: v })}
          options={[
            { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-4" /> Clair</span> },
            { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-4" /> Sombre</span> },
            { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" /> Système</span> },
          ]}
        />
        <Switch checked={!!settings.autoTranslate} onChange={(v) => patch({ autoTranslate: v })} label="Proposer la traduction des messages" description="Nécessite que la traduction automatique soit activée sur le serveur." />
      </Section>

      <Section title="Utilisateurs bloqués">
        {!blocked?.blocked.length ? (
          <p className="text-sm text-muted">Aucun utilisateur bloqué.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.blocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <Avatar src={b.avatarUrl} name={b.firstName} size={32} />
                <span className="flex-1 text-sm font-medium">{b.firstName}</span>
                <Button size="sm" variant="outline" onClick={async () => { await api("/api/blocks", { method: "DELETE", body: { userId: b.id } }); mutateBlocked(); }}>
                  Débloquer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sécurité">
        <div className="space-y-3">
          <Field label="Mot de passe actuel">
            <Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="Nouveau mot de passe" hint="10 caractères minimum, lettres et chiffres">
            <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Button
            variant="secondary"
            loading={busy === "pw"}
            disabled={!pw.current || pw.next.length < 10}
            onClick={async () => {
              setBusy("pw");
              try {
                await api("/api/me/password", { body: pw });
                setPw({ current: "", next: "" });
                push({ tone: "success", title: "Mot de passe modifié" });
              } catch (e) {
                push({ tone: "error", title: (e as Error).message });
              } finally {
                setBusy(null);
              }
            }}
          >
            Changer le mot de passe
          </Button>
        </div>
      </Section>

      <Section title="Mes données (RGPD)" description="Vous pouvez télécharger une copie de vos données ou supprimer votre compte à tout moment.">
        <div className="flex flex-wrap gap-2">
          <a href="/api/me/export" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">
            <Download className="size-4" /> Télécharger mes données
          </a>
          <Button variant="ghost" className="text-danger" onClick={() => setDelOpen(true)}>
            Supprimer mon compte
          </Button>
        </div>
      </Section>

      <Confirm
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Supprimer définitivement votre compte ?"
        tone="danger"
        confirmLabel="Supprimer mon compte"
        loading={busy === "del"}
        onConfirm={async () => {
          setBusy("del");
          try {
            await api("/api/me/close", { body: { confirm: delConfirm } });
            window.location.href = "/";
          } catch (e) {
            push({ tone: "error", title: (e as Error).message });
            setBusy(null);
          }
        }}
        description="Vos informations personnelles seront effacées. Les données comptables et les avis liés à des missions réelles sont conservés de façon anonymisée pour la durée légale."
      >
        <Field label="Tapez SUPPRIMER pour confirmer" className="mt-4">
          <Input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} />
        </Field>
      </Confirm>
    </div>
  );
}
