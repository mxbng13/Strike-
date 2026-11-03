"use client";

import { Bell, BellOff, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { useToast } from "@/components/providers";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Sheet, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type Cat = { id: number; name: string; icon: string; color: string; groupName: string; requiresIdentity: boolean; requiresPhone: boolean; requiresReferences: boolean };
type Skill = { categoryId: number; description: string; yearsExperience: number; hourlyRateCents: number | null; notify: boolean };

export default function SkillsPage() {
  const { push } = useToast();
  const { data: cats } = useSWR<{ categories: Cat[] }>("/api/categories");
  const { data, mutate } = useSWR<{ skills: Skill[] }>("/api/me/overview");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Skill>({ categoryId: 0, description: "", yearsExperience: 0, hourlyRateCents: null, notify: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setSkills(data.skills);
  }, [data]);
  const catOf = (id: number) => cats?.categories.find((c) => c.id === id);

  const save = async (next: Skill[]) => {
    setSaving(true);
    try {
      await api("/api/me/skills", { method: "PUT", body: { skills: next } });
      setSkills(next);
      await mutate();
      push({ tone: "success", title: "Compétences enregistrées" });
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back="/profil" title="Mes compétences" subtitle="Vous serez alerté(e) des demandes correspondantes autour de vous." action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Ajouter</Button>} />
      {skills.length === 0 && <EmptyState title="Aucune compétence déclarée" description="Ajoutez les services que vous savez rendre pour recevoir des missions adaptées." action={<Button onClick={() => setAdding(true)}>Ajouter une compétence</Button>} />}
      <div className="space-y-2">
        {skills.map((s) => {
          const c = catOf(s.categoryId);
          if (!c) return null;
          return (
            <Card key={s.categoryId} className="flex items-start gap-3 p-4">
              <CategoryBubble icon={c.icon} color={c.color} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted">
                  {s.yearsExperience} an{s.yearsExperience > 1 ? "s" : ""} d'expérience{s.hourlyRateCents ? ` · ${s.hourlyRateCents / 100} €/h` : ""}
                </p>
                {s.description && <p className="mt-1 text-sm">{s.description}</p>}
                {(c.requiresIdentity || c.requiresPhone || c.requiresReferences) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                    <ShieldAlert className="size-3.5" /> Vérifications requises : {[c.requiresPhone && "téléphone", c.requiresIdentity && "identité", c.requiresReferences && "références"].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <button aria-label={s.notify ? "Désactiver les alertes" : "Activer les alertes"} onClick={() => save(skills.map((x) => (x.categoryId === s.categoryId ? { ...x, notify: !x.notify } : x)))} className="rounded-full p-2 hover:bg-surface-2">
                {s.notify ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4 text-muted" />}
              </button>
              <button aria-label="Supprimer" onClick={() => save(skills.filter((x) => x.categoryId !== s.categoryId))} className="rounded-full p-2 hover:bg-surface-2">
                <Trash2 className="size-4 text-muted" />
              </button>
            </Card>
          );
        })}
      </div>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Ajouter une compétence"
        footer={
          <Button
            full
            loading={saving}
            disabled={!draft.categoryId}
            onClick={async () => {
              await save([...skills.filter((x) => x.categoryId !== draft.categoryId), draft]);
              setAdding(false);
              setDraft({ categoryId: 0, description: "", yearsExperience: 0, hourlyRateCents: null, notify: true });
            }}
          >
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Service">
            <Select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })}>
              <option value={0}>Choisir…</option>
              {cats?.categories
                .filter((c) => !skills.some((s) => s.categoryId === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Années d'expérience">
            <Input type="number" min={0} max={60} value={draft.yearsExperience} onChange={(e) => setDraft({ ...draft, yearsExperience: Math.max(0, Math.min(60, Number(e.target.value))) })} className="w-28" />
          </Field>
          <Field label="Tarif horaire indicatif (facultatif, €)">
            <Input inputMode="numeric" value={draft.hourlyRateCents ? draft.hourlyRateCents / 100 : ""} onChange={(e) => setDraft({ ...draft, hourlyRateCents: e.target.value ? Number(e.target.value.replace(/\D/g, "")) * 100 : null })} className="w-28" />
          </Field>
          <Field label="Description" hint="Matériel, diplômes, spécialités…">
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, 400) })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
