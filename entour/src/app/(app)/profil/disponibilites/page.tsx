"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/providers";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";

type Slot = { weekday: number; startMinute: number; endMinute: number };
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default function AvailabilityPage() {
  const { push } = useToast();
  const { data } = useSWR<{ availabilities: Slot[] }>("/api/me/overview");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setSlots(data.availabilities.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })));
  }, [data]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back="/profil" title="Mes disponibilités" subtitle="Les demandes en dehors de ces créneaux ne vous seront pas notifiées (sauf si vous êtes « disponible maintenant »). Sans créneau, vous recevez toutes les demandes." />
      <div className="space-y-2">
        {DAYS.map((d, wd) => {
          const daySlots = slots.map((s, i) => ({ ...s, i })).filter((s) => s.weekday === wd);
          return (
            <Card key={d} className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{d}</p>
                <button onClick={() => setSlots((s) => [...s, { weekday: wd, startMinute: 18 * 60, endMinute: 21 * 60 }])} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <Plus className="size-4" /> Créneau
                </button>
              </div>
              {daySlots.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Indisponible</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {daySlots.map((s) => (
                    <div key={s.i} className="flex items-center gap-2">
                      <Input type="time" value={toTime(s.startMinute)} onChange={(e) => setSlots((x) => x.map((y, j) => (j === s.i ? { ...y, startMinute: fromTime(e.target.value) } : y)))} className="w-32" />
                      <span className="text-muted">à</span>
                      <Input type="time" value={toTime(Math.min(s.endMinute, 1439))} onChange={(e) => setSlots((x) => x.map((y, j) => (j === s.i ? { ...y, endMinute: fromTime(e.target.value) || 1440 } : y)))} className="w-32" />
                      <button aria-label="Supprimer le créneau" onClick={() => setSlots((x) => x.filter((_, j) => j !== s.i))} className="rounded-full p-2 text-muted hover:bg-surface-2">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <Button
        full
        size="lg"
        className="mt-5"
        loading={saving}
        onClick={async () => {
          if (slots.some((s) => s.startMinute >= s.endMinute)) return push({ tone: "error", title: "Un créneau a une heure de fin avant son heure de début" });
          setSaving(true);
          try {
            await api("/api/me/availability", { method: "PUT", body: { slots } });
            push({ tone: "success", title: "Disponibilités enregistrées" });
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
  );
}
