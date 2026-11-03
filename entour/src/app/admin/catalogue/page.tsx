"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { CategoryBubble, Icon } from "@/components/icons";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Sheet, Skeleton, Switch, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type Cat = { id: number; slug: string; name: string; groupName: string; icon: string; color: string; description: string; keywords: string[]; sensitivity: string; requiresPhone: boolean; requiresIdentity: boolean; requiresReferences: boolean; safetyNotice: string | null; suggestedMinCents: number | null; suggestedMaxCents: number | null; suggestedDurationMinutes: number | null; sortOrder: number; isActive: boolean };
type B = { id: number; slug: string; name: string; description: string; icon: string; color: string; kind: string; rule: Record<string, unknown>; points: number; isActive: boolean };

const SENS = { standard: "Standard", home_access: "Accès au domicile", children: "Enfants", vulnerable: "Personnes vulnérables", animals: "Animaux", technical: "Travaux techniques", transport: "Transport" };

export default function CatalogPage() {
  const [tab, setTab] = useState<"categories" | "badges">("categories");
  const { run, pending } = useAction();
  const { data: cats, mutate: mc } = useSWR<{ categories: Cat[] }>("/api/admin/categories");
  const { data: bdg, mutate: mb } = useSWR<{ badges: B[] }>("/api/admin/badges");
  const [edit, setEdit] = useState<Partial<Cat> | null>(null);
  const [editB, setEditB] = useState<(Partial<B> & { ruleText?: string }) | null>(null);

  const saveCat = () =>
    run("cat", async () => {
      const { id, slug, name, groupName, icon, color, description, keywords, sensitivity, requiresPhone, requiresIdentity, requiresReferences, safetyNotice, suggestedMinCents, suggestedMaxCents, suggestedDurationMinutes, sortOrder, isActive } = edit!;
      await api("/api/admin/categories", { body: { id, slug, name, groupName, icon, color, description, keywords, sensitivity, requiresPhone, requiresIdentity, requiresReferences, safetyNotice, suggestedMinCents, suggestedMaxCents, suggestedDurationMinutes, sortOrder, isActive } });
      setEdit(null);
      await mc();
    }, { success: "Catégorie enregistrée" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Catégories & badges"
        subtitle="Modifications appliquées immédiatement, sans déploiement."
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => (tab === "categories" ? setEdit({ isActive: true, sensitivity: "standard", color: "#4F46E5", icon: "sparkles", keywords: [], sortOrder: 500 }) : setEditB({ kind: "manual", color: "#4F46E5", icon: "star", points: 0, isActive: true, ruleText: '{ "type": "manual" }' }))}>
            Ajouter
          </Button>
        }
      />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: "categories", label: `Catégories (${cats?.categories.length ?? "…"})` }, { value: "badges", label: `Badges (${bdg?.badges.length ?? "…"})` }]} />
      {tab === "categories" &&
        (!cats ? (
          <Skeleton className="h-64" />
        ) : (
          <Card className="divide-y divide-border">
            {cats.categories.map((c) => (
              <button key={c.id} onClick={() => setEdit(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                <CategoryBubble icon={c.icon} color={c.color} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.groupName} · {c.slug}
                  </span>
                </span>
                {c.sensitivity !== "standard" && <Badge tone="warning">{SENS[c.sensitivity as keyof typeof SENS]}</Badge>}
                {!c.isActive && <Badge tone="danger">Inactive</Badge>}
              </button>
            ))}
          </Card>
        ))}
      {tab === "badges" &&
        (!bdg ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {bdg.badges.map((b) => (
              <button key={b.id} onClick={() => setEditB({ ...b, ruleText: JSON.stringify(b.rule, null, 2) })} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left">
                <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: `${b.color}1F`, color: b.color }}>
                  <Icon name={b.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.name}</span>
                  <span className="block text-xs text-muted">{b.description}</span>
                  <span className="mt-1 block font-mono text-[11px] text-muted">{JSON.stringify(b.rule)}</span>
                </span>
                {!b.isActive && <Badge tone="danger">Inactif</Badge>}
              </button>
            ))}
          </div>
        ))}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Modifier la catégorie" : "Nouvelle catégorie"} size="lg" footer={<Button full loading={pending === "cat"} onClick={saveCat}>Enregistrer</Button>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom">
              <Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Identifiant (slug)">
              <Input value={edit.slug ?? ""} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
            </Field>
            <Field label="Groupe">
              <Input value={edit.groupName ?? ""} onChange={(e) => setEdit({ ...edit, groupName: e.target.value })} />
            </Field>
            <Field label="Sensibilité">
              <Select value={edit.sensitivity} onChange={(e) => setEdit({ ...edit, sensitivity: e.target.value })}>
                {Object.entries(SENS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Icône">
              <Input value={edit.icon ?? ""} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} />
            </Field>
            <Field label="Couleur">
              <Input type="color" value={edit.color ?? "#4F46E5"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
            </Field>
            <Field label="Prix indicatif min (€)">
              <Input inputMode="numeric" value={edit.suggestedMinCents != null ? edit.suggestedMinCents / 100 : ""} onChange={(e) => setEdit({ ...edit, suggestedMinCents: e.target.value ? Number(e.target.value) * 100 : null })} />
            </Field>
            <Field label="Prix indicatif max (€)">
              <Input inputMode="numeric" value={edit.suggestedMaxCents != null ? edit.suggestedMaxCents / 100 : ""} onChange={(e) => setEdit({ ...edit, suggestedMaxCents: e.target.value ? Number(e.target.value) * 100 : null })} />
            </Field>
            <Field label="Durée habituelle (min)">
              <Input inputMode="numeric" value={edit.suggestedDurationMinutes ?? ""} onChange={(e) => setEdit({ ...edit, suggestedDurationMinutes: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Ordre d'affichage">
              <Input inputMode="numeric" value={edit.sortOrder ?? 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Mots-clés (séparés par des virgules) — utilisés par l'assistant" className="sm:col-span-2">
              <Input value={(edit.keywords ?? []).join(", ")} onChange={(e) => setEdit({ ...edit, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Consigne de sécurité" className="sm:col-span-2">
              <Textarea value={edit.safetyNotice ?? ""} onChange={(e) => setEdit({ ...edit, safetyNotice: e.target.value || null })} />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={!!edit.requiresPhone} onChange={(v) => setEdit({ ...edit, requiresPhone: v })} label="Téléphone vérifié requis pour répondre" />
              <Switch checked={!!edit.requiresIdentity} onChange={(v) => setEdit({ ...edit, requiresIdentity: v })} label="Identité vérifiée requise" />
              <Switch checked={!!edit.requiresReferences} onChange={(v) => setEdit({ ...edit, requiresReferences: v })} label="Référence validée requise" />
              <Switch checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Catégorie active" />
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!editB}
        onClose={() => setEditB(null)}
        title={editB?.id ? "Modifier le badge" : "Nouveau badge"}
        footer={
          <Button
            full
            loading={pending === "badge"}
            onClick={() =>
              run("badge", async () => {
                let rule: unknown;
                try {
                  rule = JSON.parse(editB!.ruleText ?? "{}");
                } catch {
                  throw new Error("Règle JSON invalide");
                }
                const { id, slug, name, description, icon, color, kind, points, isActive } = editB!;
                await api("/api/admin/badges", { body: { id, slug, name, description, icon, color, kind, points, isActive, rule } });
                setEditB(null);
                await mb();
              }, { success: "Badge enregistré" })
            }
          >
            Enregistrer
          </Button>
        }
      >
        {editB && (
          <div className="space-y-3">
            <Field label="Nom">
              <Input value={editB.name ?? ""} onChange={(e) => setEditB({ ...editB, name: e.target.value })} />
            </Field>
            <Field label="Identifiant (slug)">
              <Input value={editB.slug ?? ""} disabled={!!editB.id} onChange={(e) => setEditB({ ...editB, slug: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input value={editB.description ?? ""} onChange={(e) => setEditB({ ...editB, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Icône">
                <Input value={editB.icon ?? ""} onChange={(e) => setEditB({ ...editB, icon: e.target.value })} />
              </Field>
              <Field label="Couleur">
                <Input type="color" value={editB.color ?? "#4F46E5"} onChange={(e) => setEditB({ ...editB, color: e.target.value })} />
              </Field>
              <Field label="Points">
                <Input inputMode="numeric" value={editB.points ?? 0} onChange={(e) => setEditB({ ...editB, points: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <Field label="Type">
              <Select value={editB.kind} onChange={(e) => setEditB({ ...editB, kind: e.target.value })}>
                <option value="auto">Automatique</option>
                <option value="seasonal">Saisonnier</option>
                <option value="manual">Manuel</option>
              </Select>
            </Field>
            <Field label="Règle d'attribution (JSON)" hint='Types : missions_done {min}, rating {min,minCount}, punctuality {minRate,minCount}, category_missions {categoryGroup,min}, verified, active_days {days,minActions}, reliability {maxCancelRate,minCount}, criterion_avg {criterion,min,minCount}, neighbor {minDistinctPeople}, season {months,min}, manual'>
              <Textarea className="font-mono text-xs" rows={5} value={editB.ruleText ?? ""} onChange={(e) => setEditB({ ...editB, ruleText: e.target.value })} />
            </Field>
            <Switch checked={!!editB.isActive} onChange={(v) => setEditB({ ...editB, isActive: v })} label="Actif" />
          </div>
        )}
      </Sheet>
    </div>
  );
}
