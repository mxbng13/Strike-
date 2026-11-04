"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, ImagePlus, Lightbulb, Loader2, Lock, Repeat, Share2, ShieldAlert, Sparkles, Timer, Users, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { MoneyBreakdown } from "@/components/fees";
import { LocationPicker, type PickedLocation } from "@/components/location-picker";
import { useMe, useToast } from "@/components/providers";
import { Button, ButtonLink, Card, Chip, Field, Input, PageHeader, Segmented, Select, Sheet, Switch, Textarea, cx } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import { formatDuration } from "@/lib/dates";
import { RADII_KM } from "@/lib/geo";
import { formatEUR } from "@/lib/money";
import type { PriceSuggestion } from "@/lib/pricing";

type Cat = { id: number; slug: string; name: string; icon: string; color: string; groupName: string; sensitivity: string; safetyNotice: string | null; suggestedDurationMinutes: number | null; requiresIdentity: boolean; requiresPhone: boolean };
type Timing = "immediate" | "today" | "tomorrow" | "scheduled" | "recurring";
type Pricing = "fixed" | "negotiable" | "offer";
type Finding = { code: string; severity: "info" | "warning" | "risk"; message: string };

const TIMINGS: { v: Timing; label: string }[] = [
  { v: "immediate", label: "Maintenant" },
  { v: "today", label: "Aujourd'hui" },
  { v: "tomorrow", label: "Demain" },
  { v: "scheduled", label: "Date précise" },
  { v: "recurring", label: "Récurrent" },
];
/** Catégories où l'intervenant avance généralement des achats : l'option est proposée d'office. */
const PURCHASE_CATS = new Set(["livraison-repas", "courses-alimentaires", "courses-pharmacie", "courses-derniere-minute", "accompagnement-courses"]);
const euros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PublishForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { me, location } = useMe();
  const { push } = useToast();
  const { data: catData } = useSWR<{ categories: Cat[] }>("/api/categories");
  const { data: groupsData } = useSWR<{ groups: { id: string; name: string; isMember: boolean }[] }>(location ? "/api/community/groups" : null);
  const cats = useMemo(() => catData?.categories ?? [], [catData]);

  const [sentence, setSentence] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftSource, setDraftSource] = useState<"claude" | "local" | null>(null);
  const [altCats, setAltCats] = useState<number[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<{ key: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [timing, setTiming] = useState<Timing>("today");
  const [startsAt, setStartsAt] = useState<string>("");
  const [time, setTime] = useState("18:00");
  const [duration, setDuration] = useState<number | null>(null);
  const [timeMode, setTimeMode] = useState<"estimate" | "exact">("estimate");
  const [endTime, setEndTime] = useState("");
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [until, setUntil] = useState("");
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [radius, setRadius] = useState(5);
  const [pricing, setPricing] = useState<Pricing>("fixed");
  const [purchaseOn, setPurchaseOn] = useState(false);
  const [purchase, setPurchase] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [people, setPeople] = useState(1);
  const [urgency, setUrgency] = useState<"normal" | "high" | "urgent">("normal");
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "invite" | "group">("public");
  const [groupId, setGroupId] = useState<string>("");
  const [groupBuy, setGroupBuy] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ id: string; held: boolean; notified: number; findings: Finding[] } | null>(null);
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);

  const category = cats.find((c) => c.id === categoryId) ?? null;

  // Pré-remplissages : ?categorie=, ?urgent=1, ?renouveler=<id>
  useEffect(() => {
    const c = sp.get("categorie");
    if (c) setCategoryId(Number(c));
    if (sp.get("urgent") === "1") {
      setTiming("immediate");
      setUrgency("urgent");
    }
    const renew = sp.get("renouveler");
    if (renew)
      api<{ template: { title: string; categoryId: number; description: string; pricingType: Pricing; budgetCents: number | null; durationMinutes: number | null; peopleNeeded: number; skillsRequired: string[]; searchRadiusKm: number; location: PickedLocation; addressPrivate: string | null; purchaseCents: number | null; purchaseNote: string | null; parentServiceId: string } }>(`/api/services/${renew}/renew`)
        .then(({ template: t }) => {
          setTitle(t.title);
          setCategoryId(t.categoryId);
          setDescription(t.description);
          setPricing(t.pricingType);
          setBudget(t.budgetCents ? String(t.budgetCents / 100) : "");
          setDuration(t.durationMinutes);
          setPeople(t.peopleNeeded);
          setSkills(t.skillsRequired);
          setRadius(t.searchRadiusKm);
          setLoc({ ...t.location, address: t.addressPrivate ?? undefined });
          setParentId(t.parentServiceId);
          if (t.purchaseCents) {
            setPurchaseOn(true);
            setPurchase(String(t.purchaseCents / 100));
            setPurchaseNote(t.purchaseNote ?? "");
          }
        })
        .catch(() => push({ tone: "error", title: "Impossible de charger l'ancienne demande" }));
  }, [sp, push]);

  useEffect(() => {
    if (!loc && location) setLoc({ lat: location.lat, lng: location.lng, label: location.label, postcode: location.postcode });
    if (location?.radiusKm) setRadius(location.radiusKm);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // La durée n'est jamais pré-remplie : c'est au demandeur de l'indiquer (estimation ou horaire précis).
  }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggestion de prix (historique réel ou repères indicatifs)
  useEffect(() => {
    if (category && PURCHASE_CATS.has(category.slug)) setPurchaseOn(true);
  }, [category]);

  useEffect(() => {
    if (!categoryId) return setSuggestion(null);
    const ctrl = new AbortController();
    api<{ suggestion: PriceSuggestion }>(`/api/services/price-suggestion?categoryId=${categoryId}${duration ? `&duration=${duration}` : ""}&urgency=${urgency}`, { signal: ctrl.signal })
      .then((r) => setSuggestion(r.suggestion))
      .catch(() => {});
    return () => ctrl.abort();
  }, [categoryId, duration, urgency]);

  const runAssistant = async () => {
    setDrafting(true);
    try {
      const { draft } = await api<{ draft: { title: string; description: string; categoryId: number | null; alternativeSlugs: string[]; timingType: Timing; timingDetected: boolean; startDate: string | null; startTime: string | null; durationMinutes: number | null; durationExact: boolean; budgetEuros: number | null; urgency: "normal" | "high" | "urgent"; peopleNeeded: number; skills: string[]; recurrence: { freq: "daily" | "weekly" | "monthly" } | null; source: "claude" | "local"; refused?: boolean } }>("/api/assistant/draft", { body: { text: sentence } });
      if (draft.refused) {
        push({ tone: "error", title: "Cette demande ne peut pas être publiée sur ENTOUR", body: "Elle semble concerner une activité illégale, dangereuse ou réglementée." });
        return;
      }
      setTitle(draft.title);
      setDescription(draft.description);
      if (draft.categoryId) setCategoryId(draft.categoryId);
      setAltCats(draft.alternativeSlugs.map((s) => cats.find((c) => c.slug === s)?.id).filter((x): x is number => !!x));
      if (draft.timingDetected) setTiming(draft.timingType);
      setUrgency(draft.urgency);
      if (draft.durationMinutes) setDuration(draft.durationMinutes);
      if (draft.durationExact && draft.startTime && draft.durationMinutes) {
        const end = (Number(draft.startTime.slice(0, 2)) * 60 + Number(draft.startTime.slice(3, 5)) + draft.durationMinutes) % 1440;
        setTimeMode("exact");
        setEndTime(`${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`);
      } else if (draft.durationMinutes) setTimeMode("estimate");
      if (draft.budgetEuros != null) {
        setBudget(String(draft.budgetEuros));
        setPricing("fixed");
      }
      setPeople(draft.peopleNeeded);
      if (draft.skills.length) setSkills(draft.skills);
      if (draft.recurrence) setFreq(draft.recurrence.freq);
      if (draft.startTime) {
        setTime(draft.startTime);
        const base = draft.startDate ? new Date(`${draft.startDate}T00:00:00`) : new Date();
        if (!draft.startDate && draft.timingType === "tomorrow") base.setDate(base.getDate() + 1);
        const [h, m] = draft.startTime.split(":").map(Number);
        base.setHours(h, m, 0, 0);
        if (draft.timingType === "scheduled" || draft.timingType === "recurring") setStartsAt(toLocalInput(base));
      }
      setDraftSource(draft.source);
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setDrafting(false);
    }
  };

  const computeStartsAt = (): string | null => {
    if (timing === "immediate") return null;
    if (timing === "scheduled" || timing === "recurring") return startsAt ? new Date(startsAt).toISOString() : null;
    const d = new Date();
    if (timing === "tomorrow") d.setDate(d.getDate() + 1);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  /** Heure de début (HH:MM) utilisée pour l'horaire précis. */
  const startHHMM = (): string | null => {
    if (timing === "today" || timing === "tomorrow") return time;
    if ((timing === "scheduled" || timing === "recurring") && startsAt) return startsAt.slice(11, 16);
    return null;
  };
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  /** Durée finale en minutes, ou un message d'erreur. */
  const timeNeeded = (): { minutes: number } | { error: string } => {
    if (timeMode === "estimate") return duration ? { minutes: duration } : { error: "Choisissez une durée estimée, ou passez en horaire précis" };
    if (timing === "immediate") return { error: "Pour une demande immédiate, indiquez une durée estimée" };
    const start = startHHMM();
    if (!start) return { error: "Choisissez d'abord la date et l'heure de début" };
    if (!endTime) return { error: "Indiquez l'heure de fin" };
    const m = toMin(endTime) - toMin(start);
    return m > 0 ? { minutes: m } : { error: "L'heure de fin doit être après l'heure de début" };
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!categoryId) errs.categoryId = "Choisissez une catégorie";
    if (title.trim().length < 5) errs.title = "Titre trop court (5 caractères minimum)";
    if (description.trim().length < 10) errs.description = "Décrivez votre besoin (10 caractères minimum)";
    if (!loc) errs.location = "Indiquez le lieu";
    if (pricing !== "offer" && !(Number(budget) > 0)) errs.budgetCents = "Indiquez un montant";
    if (purchaseOn && !(euros(purchase) >= 100)) errs.purchaseCents = "Indiquez le montant des achats (1 € minimum)";
    if (purchaseOn && pricing === "offer" && !(Number(budget) > 0)) errs.budgetCents = "Avec des achats à avancer, indiquez la rémunération proposée";
    if ((timing === "scheduled" || timing === "recurring") && !startsAt) errs.startsAt = "Choisissez la date et l'heure";
    const tn = timeNeeded();
    if ("error" in tn) errs.durationMinutes = tn.error;
    setErrors(errs);
    if (Object.keys(errs).length) {
      push({ tone: "error", title: "Quelques informations manquent", body: Object.values(errs)[0] });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ id: string; held: boolean; notified: number; findings: Finding[] }>("/api/services", {
        body: {
          title: title.trim(),
          categoryId,
          description: description.trim(),
          imageKeys: images.map((i) => i.key),
          location: { lat: loc!.lat, lng: loc!.lng, label: loc!.label, postcode: loc!.postcode },
          addressPrivate: loc!.address ?? null,
          searchRadiusKm: radius,
          timingType: timing,
          startsAt: computeStartsAt(),
          durationMinutes: "minutes" in tn ? tn.minutes : null,
          durationExact: timeMode === "exact",
          pricingType: pricing,
          budgetCents: budget ? Math.round(Number(budget.replace(",", ".")) * 100) : null,
          purchaseCents: purchaseOn ? euros(purchase) : null,
          purchaseNote: purchaseOn ? purchaseNote.trim() || null : null,
          peopleNeeded: people,
          urgency: timing === "immediate" ? "urgent" : urgency,
          skillsRequired: skills,
          recurrence: timing === "recurring" ? { freq, interval: 1, until: until || null } : null,
          visibility,
          groupId: visibility === "group" ? groupId || null : null,
          isGroupBuy: groupBuy,
          parentServiceId: parentId,
        },
      });
      setDone(r);
    } catch (e) {
      const err = e as Error & { details?: { path: string; message: string }[] };
      if (Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details) map[d.path.split(".")[0]] = d.message;
        setErrors(map);
      }
      push({ tone: "error", title: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return <Success result={done} visibility={visibility} />;

  const filteredCats = cats.filter((c) => !catSearch || c.name.toLowerCase().includes(catSearch.toLowerCase()) || c.groupName.toLowerCase().includes(catSearch.toLowerCase()));
  const groupsByName = filteredCats.reduce<Record<string, Cat[]>>((acc, c) => ((acc[c.groupName] ??= []).push(c), acc), {});

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={parentId ? "Renouveler une demande" : "Publier une demande"} subtitle="Moins d'une minute. Vos voisins disponibles sont prévenus aussitôt." />

      {!me?.emailVerified && (
        <div className="mb-4 flex gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="size-5 shrink-0" /> Confirmez votre adresse e-mail pour pouvoir publier.
        </div>
      )}

      {/* Assistant IA */}
      <Card className="mb-5 overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-[#6d5cff] p-5 text-white">
          <p className="flex items-center gap-2 font-bold">
            <Wand2 className="size-5" /> Décrivez votre besoin en une phrase
          </p>
          <p className="mt-0.5 text-sm text-white/80">L'assistant rédige l'annonce, choisit la catégorie et détecte l'horaire et le budget.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sentence.trim().length > 3 && (e.preventDefault(), runAssistant())}
              placeholder="Ex : je cherche qqn pour garder mon fils de 5 ans ce soir de 19h à 22h, 30€"
              className="h-12 w-full rounded-xl border-0 bg-white/95 sm:flex-1 px-4 text-[15px] text-[#1b1a2e] placeholder:text-[#8a8799] focus:outline-none focus:ring-4 focus:ring-white/40"
              aria-label="Décrire votre besoin"
            />
            <Button onClick={runAssistant} loading={drafting} disabled={sentence.trim().length < 4} className="bg-white !text-[#3b2fd9] hover:bg-white/90" icon={<Sparkles className="size-4" />}>
              Rédiger
            </Button>
          </div>
        </div>
        {draftSource && (
          <p className="flex items-center gap-2 px-5 py-2.5 text-xs text-muted">
            <Check className="size-4 text-success" />
            {draftSource === "claude" ? "Annonce rédigée par l'assistant IA" : "Annonce pré-remplie par l'assistant local (règles automatiques)"} — vérifiez et ajustez si besoin.
          </p>
        )}
      </Card>

      <div className="space-y-6">
        {/* Catégorie */}
        <Field label="Catégorie" error={errors.categoryId}>
          <button type="button" onClick={() => setCatOpen(true)} className={cx("flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left", errors.categoryId ? "border-danger" : "border-border")}>
            {category ? <CategoryBubble icon={category.icon} color={category.color} size={40} /> : <span className="flex size-10 items-center justify-center rounded-2xl bg-surface-2 text-muted">?</span>}
            <span className="flex-1">
              <span className="block font-semibold">{category?.name ?? "Choisir une catégorie"}</span>
              <span className="block text-xs text-muted">{category?.groupName ?? "Plus de 50 services, ou « Autre service » pour une demande libre"}</span>
            </span>
            <span className="text-sm font-semibold text-primary">Modifier</span>
          </button>
          {altCats.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted">Ou peut-être :</span>
              {altCats.map((id) => {
                const c = cats.find((x) => x.id === id)!;
                return (
                  <Chip key={id} active={categoryId === id} onClick={() => setCategoryId(id)} className="h-8 text-xs">
                    {c.name}
                  </Chip>
                );
              })}
            </div>
          )}
        </Field>

        {category?.safetyNotice && (
          <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-4 text-sm">
            <ShieldAlert className="size-5 shrink-0 text-primary" />
            <p>{category.safetyNotice}</p>
          </div>
        )}

        <Field label="Titre" error={errors.title} hint={`${title.length}/90`}>
          <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 90))} placeholder="Ex : Garder mon fils de 5 ans ce soir" />
        </Field>

        <Field
          label={
            <span className="flex items-center justify-between">
              Description
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={async () => {
                  const r = await api<{ text: string }>("/api/assistant/correct", { body: { text: description } });
                  setDescription(r.text);
                }}
              >
                Corriger le texte
              </button>
            </span>
          }
          error={errors.description}
          hint="Précisez ce qu'il faut faire, le matériel, l'accès… Ne mettez ni téléphone ni adresse : ils s'échangent après acceptation."
        >
          <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 3000))} rows={4} />
        </Field>

        {/* Photos */}
        <div>
          <p className="mb-2 text-sm font-semibold">Photos (facultatif)</p>
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-20 rounded-2xl object-cover" />
                <button type="button" aria-label="Retirer la photo" onClick={() => setImages((x) => x.filter((i) => i.key !== img.key))} className="absolute -right-1.5 -top-1.5 rounded-full bg-text p-1 text-bg">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.length < 6 && (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-xs text-muted hover:border-primary/40">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                Ajouter
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  multiple
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 6 - images.length);
                    setUploading(true);
                    for (const f of files) {
                      try {
                        const r = await uploadFile(f, "public");
                        setImages((x) => [...x, { key: r.key, url: r.url }]);
                      } catch (err) {
                        push({ tone: "error", title: (err as Error).message });
                      }
                    }
                    setUploading(false);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {/* Quand */}
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4" /> Quand ?
          </p>
          <div className="flex flex-wrap gap-2">
            {TIMINGS.map((t) => (
              <Chip key={t.v} active={timing === t.v} onClick={() => setTiming(t.v)}>
                {t.v === "recurring" && <Repeat className="size-3.5" />}
                {t.label}
              </Chip>
            ))}
          </div>
          {(timing === "today" || timing === "tomorrow") && (
            <Field label="Heure de début">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-40" />
            </Field>
          )}
          {(timing === "scheduled" || timing === "recurring") && (
            <Field label={timing === "recurring" ? "Première occurrence" : "Date et heure"} error={errors.startsAt}>
              <Input type="datetime-local" value={startsAt} min={toLocalInput(new Date())} onChange={(e) => setStartsAt(e.target.value)} className="max-w-xs" />
            </Field>
          )}
          {timing === "recurring" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fréquence">
                <Select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
                  <option value="daily">Tous les jours</option>
                  <option value="weekly">Toutes les semaines</option>
                  <option value="monthly">Tous les mois</option>
                </Select>
              </Field>
              <Field label="Jusqu'au (facultatif)">
                <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </Field>
            </div>
          )}
          <div id="temps" className={cx("space-y-3 rounded-3xl border bg-surface p-4", errors.durationMinutes ? "border-danger" : "border-border")}>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="size-4" /> Temps nécessaire <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">Obligatoire</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">Indiquez une estimation, ou l'horaire précis de début et de fin.</p>
            </div>
            <Segmented
              value={timeMode}
              onChange={setTimeMode}
              className="w-full"
              options={[
                { value: "estimate", label: "Estimation" },
                { value: "exact", label: "Horaire précis" },
              ]}
            />
            {timeMode === "estimate" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <Chip key={d} active={duration === d} onClick={() => setDuration(d)} className="h-8 text-xs">
                      ≈ {formatDuration(d)}
                    </Chip>
                  ))}
                </div>
                {category?.suggestedDurationMinutes && <p className="text-xs text-muted">Repère pour ce service : environ {formatDuration(category.suggestedDurationMinutes)}.</p>}
              </>
            ) : timing === "immediate" ? (
              <p className="text-sm text-warning">Pour une demande immédiate, indiquez plutôt une durée estimée.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Début">
                  <Input value={startHHMM() ?? "—"} disabled className="w-32" />
                </Field>
                <Field label="Fin">
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-32" />
                </Field>
                {(() => {
                  const tn = timeNeeded();
                  return "minutes" in tn ? <p className="pb-3 text-sm font-semibold text-success">soit {formatDuration(tn.minutes)}</p> : endTime ? <p className="pb-3 text-sm text-danger">{tn.error}</p> : null;
                })()}
              </div>
            )}
            {errors.durationMinutes && <p className="text-sm font-semibold text-danger">{errors.durationMinutes}</p>}
          </div>
        </div>

        {/* Où */}
        <Field label="Où ?" error={errors.location} hint="Seule une zone approximative est visible publiquement. L'adresse exacte n'est communiquée qu'à la personne retenue.">
          <LocationPicker value={loc} onChange={setLoc} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">Diffuser dans un rayon de</p>
          <div className="flex flex-wrap gap-2">
            {RADII_KM.map((r) => (
              <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
                {r} km
              </Chip>
            ))}
          </div>
        </div>

        {/* Achats à avancer */}
        <div className={cx("space-y-3 rounded-3xl border bg-surface p-4", errors.purchaseCents ? "border-danger" : "border-border")}>
          <Switch
            checked={purchaseOn}
            onChange={setPurchaseOn}
            label="L'intervenant doit avancer des achats"
            description="Ex. : votre menu au restaurant, des courses, un médicament. Vous bloquez le montant dans la tirelire ENTOUR avant qu'il n'achète ; il est remboursé à l'euro près, sans commission."
          />
          {purchaseOn && (
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Field label="Prix des achats" error={errors.purchaseCents}>
                <div className="relative">
                  <Input inputMode="decimal" value={purchase} onChange={(e) => setPurchase(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="30" className="pr-10 text-lg font-bold" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">€</span>
                </div>
              </Field>
              <Field label="Quoi acheter ?" hint="Le détail précis peut aussi se donner dans la conversation.">
                <Input value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value.slice(0, 300))} placeholder="Ex. : menu Best Of Big Mac, frites, Coca" />
              </Field>
            </div>
          )}
        </div>

        {/* Rémunération */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">{purchaseOn ? "Rémunération pour le service (en plus des achats)" : "Rémunération"}</p>
          <Segmented
            value={pricing}
            onChange={setPricing}
            className="w-full"
            options={[
              { value: "fixed", label: "Prix fixe" },
              { value: "negotiable", label: "Négociable" },
              { value: "offer", label: "Faire une offre" },
            ]}
          />
          <p className="text-xs text-muted">
            {pricing === "fixed" && "Vous fixez le montant. Les intervenants l'acceptent ou posent une question."}
            {pricing === "negotiable" && "Prix indicatif : les intervenants peuvent proposer un autre tarif."}
            {pricing === "offer" && "Les intervenants proposent leur tarif. Vous pouvez indiquer un budget indicatif."}
          </p>
          <Field error={errors.budgetCents}>
            <div className="relative max-w-[220px]">
              <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d,.]/g, ""))} placeholder={pricing === "offer" ? "Budget indicatif (facultatif)" : "Montant"} className="pr-10 text-lg font-bold" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">€</span>
            </div>
          </Field>
          {suggestion && (
            <div className="flex items-start gap-3 rounded-2xl bg-success-soft p-3.5 text-sm">
              <Lightbulb className="size-5 shrink-0 text-success" />
              <div className="flex-1">
                <p>
                  <strong>Prix conseillé : {formatEUR(suggestion.recommendedCents)}</strong> (fourchette {formatEUR(suggestion.lowCents)} – {formatEUR(suggestion.highCents)}
                  {suggestion.hourly && duration ? ` pour ${formatDuration(duration)}` : ""})
                </p>
                <p className="text-xs text-muted">{suggestion.basis === "history" ? `Calculé sur ${suggestion.sampleSize} missions similaires réalisées sur ENTOUR.` : "Repère indicatif défini par ENTOUR (pas encore assez de missions similaires)."}</p>
                {Number(budget) > 0 && Number(budget) * 100 < suggestion.lowCents * 0.6 && <p className="mt-1 text-xs font-semibold text-warning">Votre budget est nettement en dessous des repères : peu de personnes risquent de répondre.</p>}
              </div>
              <button type="button" onClick={() => setBudget(String(suggestion.recommendedCents / 100))} className="shrink-0 rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold shadow-card">
                Appliquer
              </button>
            </div>
          )}
          <MoneyBreakdown serviceCents={Number(budget) > 0 ? euros(budget) : null} purchaseCents={purchaseOn && euros(purchase) > 0 ? euros(purchase) : 0} perspective="requester" />
        </div>

        {/* Options */}
        <details className="group rounded-3xl border border-border bg-surface p-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between font-semibold">
            Options avancées
            <span className="text-sm text-muted group-open:hidden">personnes, urgence, compétences, visibilité</span>
          </summary>
          <div className="mt-4 space-y-5">
            <Field label="Nombre de personnes recherchées">
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label="Moins">
                  −
                </Button>
                <span className="flex w-10 items-center justify-center gap-1 text-lg font-bold">
                  <Users className="size-4" /> {people}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => setPeople((p) => Math.min(20, p + 1))} aria-label="Plus">
                  +
                </Button>
              </div>
            </Field>
            {timing !== "immediate" && (
              <Field label="Niveau d'urgence">
                <Segmented
                  value={urgency}
                  onChange={setUrgency}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "Pressé" },
                    { value: "urgent", label: "Urgent" },
                  ]}
                />
              </Field>
            )}
            <Field label="Compétences particulières" hint="Ex : permis B, véhicule utilitaire, anglais, premiers secours…">
              <div className="flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && skillInput.trim()) {
                      e.preventDefault();
                      setSkills((s) => [...new Set([...s, skillInput.trim()])].slice(0, 8));
                      setSkillInput("");
                    }
                  }}
                  placeholder="Ajouter puis Entrée"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {skills.map((s) => (
                  <button key={s} type="button" onClick={() => setSkills((x) => x.filter((y) => y !== s))} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    {s} <X className="size-3" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Visibilité">
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
                <option value="public">Publique — diffusée aux voisins</option>
                <option value="invite">Privée — sur invitation (lien à partager)</option>
                <option value="group">Réservée à un groupe de quartier</option>
              </Select>
            </Field>
            {visibility === "group" && (
              <Field label="Groupe" error={errors.groupId}>
                <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Choisir…</option>
                  {groupsData?.groups
                    .filter((g) => g.isMember)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Switch checked={groupBuy} onChange={setGroupBuy} label="Demande groupée entre voisins" description="Ex : un seul passage à la déchetterie partagé entre plusieurs foyers. Les voisins intéressés peuvent se manifester dans la conversation." />
          </div>
        </details>

        {visibility !== "public" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Lock className="size-4" /> Cette demande ne sera pas diffusée aux voisins ni affichée sur la carte publique.
          </p>
        )}

        <div className="sticky bottom-16 z-10 -mx-4 bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pb-3 pt-6 lg:bottom-0 lg:mx-0 lg:px-0">
          <Button full size="lg" onClick={submit} loading={submitting} disabled={!me?.emailVerified} className="shadow-xl">
            Publier ma demande
          </Button>
        </div>
      </div>

      <Sheet open={catOpen} onClose={() => setCatOpen(false)} title="Choisir une catégorie" size="lg">
        <Input autoFocus value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Rechercher…" className="mb-4" />
        <div className="space-y-5">
          {Object.entries(groupsByName).map(([g, list]) => (
            <div key={g}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{g}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategoryId(c.id);
                      setCatOpen(false);
                    }}
                    className={cx("flex items-center gap-3 rounded-2xl border p-2.5 text-left text-sm", c.id === categoryId ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2")}
                  >
                    <CategoryBubble icon={c.icon} color={c.color} size={34} />
                    <span className="flex-1 font-medium leading-tight">{c.name}</span>
                    {(c.requiresIdentity || c.requiresPhone) && <ShieldAlert className="size-4 text-muted" aria-label="Catégorie avec vérifications renforcées" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Success({ result, visibility }: { result: { id: string; held: boolean; notified: number; findings: Finding[] }; visibility: string }) {
  const { data } = useSWR<{ service: { inviteCode: string | null; title: string } }>(`/api/services/${result.id}`);
  const { push } = useToast();
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/missions/${result.id}${data?.service.inviteCode ? `?invite=${data.service.inviteCode}` : ""}` : "";
  const warnings = result.findings.filter((f) => f.severity !== "info");
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
        <CheckCircle2 className={cx("mx-auto size-20", result.held ? "text-warning" : "text-success")} strokeWidth={1.6} />
      </motion.div>
      <h1 className="mt-5 text-2xl font-extrabold">{result.held ? "Demande en cours de vérification" : "Demande publiée !"}</h1>
      <p className="mt-2 text-muted">
        {result.held
          ? "Notre équipe la relit avant publication. Vous serez prévenu(e) très vite."
          : visibility === "public"
            ? result.notified > 0
              ? `${result.notified} voisin${result.notified > 1 ? "s" : ""} correspondant à votre demande ${result.notified > 1 ? "ont" : "a"} été prévenu${result.notified > 1 ? "s" : ""}.`
              : "Elle est visible sur la carte et dans le fil de votre quartier. Vous serez prévenu(e) dès la première réponse."
            : "Partagez le lien ci-dessous avec les personnes de votre choix."}
      </p>
      <AnimatePresence>
        {warnings.length > 0 && (
          <div className="mt-5 space-y-2 text-left">
            {warnings.map((f) => (
              <p key={f.code} className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="size-4 shrink-0 translate-y-0.5" /> {f.message}
              </p>
            ))}
          </div>
        )}
      </AnimatePresence>
      <div className="mt-6 flex flex-col gap-2">
        <ButtonLink href={`/missions/${result.id}`} size="lg">
          Voir ma demande
        </ButtonLink>
        <Button
          variant="outline"
          icon={<Share2 className="size-4" />}
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: data?.service.title ?? "Demande ENTOUR", url: shareUrl });
              else {
                await navigator.clipboard.writeText(shareUrl);
                push({ tone: "success", title: "Lien copié" });
              }
            } catch {
              /* partage annulé */
            }
          }}
        >
          Partager à un proche
        </Button>
        <Link href="/accueil" className="mt-2 text-sm font-semibold text-muted">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

export default function PublishPage() {
  return (
    <Suspense>
      <PublishForm />
    </Suspense>
  );
}
