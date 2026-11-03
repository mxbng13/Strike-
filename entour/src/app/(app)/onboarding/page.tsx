"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { LocationPicker, type PickedLocation } from "@/components/location-picker";
import { useMe, useMode, useToast } from "@/components/providers";
import { Button, Chip, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { RADII_KM } from "@/lib/geo";

type Cat = { id: number; name: string; icon: string; color: string; groupName: string; sensitivity: string };

export default function Onboarding() {
  const router = useRouter();
  const { me, mutate } = useMe();
  const { setMode } = useMode();
  const { push } = useToast();
  const { data } = useSWR<{ categories: Cat[] }>("/api/categories");
  const [step, setStep] = useState(0);
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [radius, setRadius] = useState(5);
  const [intent, setIntent] = useState<"both" | "demandeur" | "offreur">("both");
  const [skills, setSkills] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      if (loc) await api("/api/me/location", { method: "PUT", body: { lat: loc.lat, lng: loc.lng, label: loc.label, postcode: loc.postcode, radiusKm: radius } });
      if (skills.length) await api("/api/me/skills", { method: "PUT", body: { skills: skills.map((categoryId) => ({ categoryId, description: "", yearsExperience: 0 })) } });
      setMode(intent === "offreur" ? "offreur" : "demandeur");
      await mutate();
      push({ tone: "success", title: "Bienvenue sur ENTOUR !" });
      router.replace(intent === "demandeur" ? "/publier" : "/accueil");
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    <div key="loc" className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Où êtes-vous, {me?.firstName} ?</h1>
        <p className="mt-1 text-muted">Votre position sert à vous montrer ce qui se passe autour de vous. Elle n'est jamais affichée publiquement.</p>
      </div>
      <LocationPicker value={loc} onChange={setLoc} mode="city" placeholder="Votre ville ou quartier" />
      <div>
        <p className="mb-2 text-sm font-semibold">Rayon de recherche</p>
        <div className="flex flex-wrap gap-2">
          {RADII_KM.map((r) => (
            <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
              {r} km
            </Chip>
          ))}
        </div>
      </div>
      <Button full size="lg" disabled={!loc} onClick={() => setStep(1)}>
        Continuer
      </Button>
    </div>,
    <div key="intent" className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Qu'est-ce qui vous amène ?</h1>
        <p className="mt-1 text-muted">Vous pourrez passer d'un mode à l'autre à tout moment.</p>
      </div>
      {(
        [
          ["demandeur", "J'ai besoin d'aide", "Publier des demandes et trouver quelqu'un près de chez moi"],
          ["offreur", "Je veux rendre service", "Recevoir des missions et gagner de l'argent autour de moi"],
          ["both", "Les deux", "Demander et proposer selon les moments"],
        ] as const
      ).map(([v, t, d]) => (
        <button key={v} onClick={() => setIntent(v)} className={cx("flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition", intent === v ? "border-primary bg-primary-soft" : "border-border bg-surface")}>
          <span className={cx("flex size-6 items-center justify-center rounded-full border-2", intent === v ? "border-primary bg-primary text-primary-ink" : "border-border")}>{intent === v && <Check className="size-4" />}</span>
          <span>
            <span className="block font-bold">{t}</span>
            <span className="block text-sm text-muted">{d}</span>
          </span>
        </button>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(0)}>
          Retour
        </Button>
        <Button full size="lg" onClick={() => (intent === "demandeur" ? finish() : setStep(2))} loading={saving}>
          Continuer
        </Button>
      </div>
    </div>,
    <div key="skills" className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Quels services pouvez-vous rendre ?</h1>
        <p className="mt-1 text-muted">Vous recevrez les demandes correspondantes près de chez vous. Modifiable à tout moment.</p>
      </div>
      <div className="grid max-h-[50dvh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {data?.categories
          .filter((c) => c.groupName !== "Autre")
          .map((c) => {
            const on = skills.includes(c.id);
            return (
              <button key={c.id} onClick={() => setSkills((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))} className={cx("flex items-center gap-3 rounded-2xl border p-2.5 text-left text-sm transition", on ? "border-primary bg-primary-soft" : "border-border bg-surface")}>
                <CategoryBubble icon={c.icon} color={c.color} size={34} />
                <span className="flex-1 font-medium leading-tight">{c.name}</span>
                {on && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
      </div>
      <p className="text-xs text-muted">Certaines catégories (garde d'enfants, accès au domicile, personnes vulnérables) exigent des vérifications supplémentaires avant de pouvoir répondre.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          Retour
        </Button>
        <Button full size="lg" onClick={finish} loading={saving}>
          Terminer
        </Button>
      </div>
    </div>,
  ];

  return (
    <div className="mx-auto max-w-lg py-4">
      <div className="mb-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx("h-1.5 flex-1 rounded-full transition", i <= step ? "bg-primary" : "bg-border")} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
          {steps[step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
