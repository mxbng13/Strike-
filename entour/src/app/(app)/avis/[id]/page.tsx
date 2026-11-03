"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/providers";
import { Avatar, Button, ButtonLink, Card, ErrorState, Field, PageHeader, Skeleton, StarInput, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type Ctx = { assignmentId: string; serviceTitle: string; status: string; role: "as_provider" | "as_requester"; target: { id: string; firstName: string; avatarUrl: string | null }; alreadyReviewed: boolean };
const CRITERIA = [
  ["punctuality", "Ponctualité"],
  ["communication", "Communication"],
  ["seriousness", "Sérieux"],
  ["quality", "Qualité du travail"],
  ["commitment", "Respect des engagements"],
] as const;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const { data, error } = useSWR<{ context: Ctx }>(`/api/reviews?assignmentId=${id}`);
  const [rating, setRating] = useState(0);
  const [criteria, setCriteria] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96" />;
  const c = data.context;

  if (done || c.alreadyReviewed)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <CheckCircle2 className="mx-auto size-16 text-success" />
        </motion.div>
        <h1 className="mt-4 text-2xl font-extrabold">Merci pour votre avis !</h1>
        <p className="mt-2 text-muted">Il aide toute la communauté à choisir en confiance.</p>
        <ButtonLink href="/mes-missions" className="mt-6">
          Retour à mes missions
        </ButtonLink>
      </div>
    );

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader back title="Évaluer la mission" subtitle={c.serviceTitle} />
      {c.status !== "completed" ? (
        <p className="rounded-2xl bg-warning-soft p-4 text-sm text-warning">Vous pourrez laisser un avis une fois la mission terminée et confirmée.</p>
      ) : (
        <div className="space-y-5">
          <Card className="flex flex-col items-center p-6 text-center">
            <Avatar src={c.target.avatarUrl} name={c.target.firstName} size={72} />
            <p className="mt-3 text-lg font-bold">Comment s'est passée la mission avec {c.target.firstName} ?</p>
            <div className="mt-3">
              <StarInput value={rating} onChange={setRating} size={40} label="Note globale" />
            </div>
          </Card>
          <Card className="divide-y divide-border">
            {CRITERIA.map(([k, l]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{l}</span>
                <StarInput value={criteria[k] ?? 0} onChange={(v) => setCriteria((x) => ({ ...x, [k]: v }))} size={22} label={l} />
              </div>
            ))}
          </Card>
          <Field label="Commentaire (facultatif)" hint="Restez factuel et respectueux. Les avis injurieux ou mensongers sont modérés.">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1500} rows={4} />
          </Field>
          <Button
            full
            size="lg"
            disabled={!rating}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await api("/api/reviews", { body: { assignmentId: id, rating, comment, criteria } });
                setDone(true);
              } catch (e) {
                push({ tone: "error", title: (e as Error).message });
              } finally {
                setLoading(false);
              }
            }}
          >
            Publier mon avis
          </Button>
          <button onClick={() => router.back()} className="w-full text-center text-sm font-semibold text-muted">
            Plus tard
          </button>
        </div>
      )}
    </div>
  );
}
