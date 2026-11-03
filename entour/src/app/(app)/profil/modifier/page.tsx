"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useMe, useToast } from "@/components/providers";
import { Avatar, Button, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import type { PublicProfile } from "@/server/users";

const keyFromUrl = (u: string) => u.replace(/^\/api\/files\//, "");

export default function EditProfile() {
  const { me, mutate: mutateMe } = useMe();
  const { push } = useToast();
  const { data, mutate } = useSWR<{ profile: PublicProfile }>("/api/me/overview");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<{ key: string | null; url: string | null }>({ key: null, url: null });
  const [portfolio, setPortfolio] = useState<{ key: string; url: string; caption?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data || !me) return;
    setFirstName(me.firstName);
    setLastName(me.lastName);
    setBio(data.profile.bio);
    setAvatar({ key: me.avatarUrl ? keyFromUrl(me.avatarUrl) : null, url: me.avatarUrl });
    setPortfolio(data.profile.portfolio.map((p) => ({ key: keyFromUrl(p.url), url: p.url, caption: p.caption })));
  }, [data, me]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader back="/profil" title="Modifier mon profil" />
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar src={avatar.url} name={`${firstName} ${lastName}`} size={84} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Changer la photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const r = await uploadFile(f, "public");
                  setAvatar({ key: r.key, url: r.url });
                } catch (err) {
                  push({ tone: "error", title: (err as Error).message });
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {avatar.url && (
            <button className="text-sm text-muted" onClick={() => setAvatar({ key: null, url: null })}>
              Retirer
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Nom" hint="Seule l'initiale est affichée">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <Field label="Présentation" hint={`${bio.length}/800 — parlez de vous, de votre expérience, de ce que vous aimez faire.`}>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 800))} rows={5} />
        </Field>
        <Field label="Photos de réalisations (facultatif)" hint="Jardin entretenu, meuble monté, gâteau d'anniversaire… jusqu'à 12 photos.">
          <div className="flex flex-wrap gap-2">
            {portfolio.map((p) => (
              <div key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="size-24 rounded-2xl object-cover" />
                <button aria-label="Retirer" onClick={() => setPortfolio((x) => x.filter((y) => y.key !== p.key))} className="absolute -right-1.5 -top-1.5 rounded-full bg-text p-1 text-bg">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {portfolio.length < 12 && (
              <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-xs text-muted">
                <ImagePlus className="size-5" /> Ajouter
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const r = await uploadFile(f, "public");
                      setPortfolio((x) => [...x, { key: r.key, url: r.url }]);
                    } catch (err) {
                      push({ tone: "error", title: (err as Error).message });
                    }
                  }}
                />
              </label>
            )}
          </div>
        </Field>
        <Button
          full
          size="lg"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api("/api/me", { method: "PATCH", body: { firstName, lastName, bio, avatarKey: avatar.key, portfolio: portfolio.map((p) => ({ key: p.key, caption: p.caption })) } });
              await Promise.all([mutate(), mutateMe()]);
              push({ tone: "success", title: "Profil mis à jour" });
            } catch (e) {
              push({ tone: "error", title: (e as Error).message });
            } finally {
              setSaving(false);
            }
          }}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
