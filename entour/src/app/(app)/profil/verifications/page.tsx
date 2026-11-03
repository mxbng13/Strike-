"use client";

import { CheckCircle2, Clock, IdCard, Mail, Phone, UserCheck, XCircle } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { useMe, useToast } from "@/components/providers";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type Verif = { id: string; type: string; status: string; createdAt: string; decisionNote: string | null; details: { name?: string } };
type Cat = { id: number; name: string; requiresReferences: boolean };

function Status({ ok, pending }: { ok: boolean; pending?: boolean }) {
  if (ok) return <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>Vérifié</Badge>;
  if (pending) return <Badge tone="warning" icon={<Clock className="size-3" />}>En cours</Badge>;
  return <Badge>Non vérifié</Badge>;
}

export default function VerificationsPage() {
  const { me, mutate: mutateMe } = useMe();
  const { push } = useToast();
  const { data, mutate } = useSWR<{ verifications: Verif[] }>("/api/me/overview");
  const { data: cats } = useSWR<{ categories: Cat[] }>("/api/categories");
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState<{ phone: string; devCode: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ref, setRef] = useState({ name: "", relation: "", contact: "", categoryId: "" });

  const idPending = data?.verifications.some((v) => v.type === "identity" && v.status === "pending");
  const refs = data?.verifications.filter((v) => v.type === "reference") ?? [];
  const call = async (key: string, fn: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await fn();
      push({ tone: "success", title: success });
      await Promise.all([mutate(), mutateMe()]);
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader back="/profil" title="Vérifications" subtitle="Plus votre profil est vérifié, plus les membres vous font confiance. Certaines catégories exigent des vérifications." />

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Mail className="size-5 text-primary" />
          <p className="flex-1 font-semibold">Adresse e-mail</p>
          <Status ok={!!me?.emailVerified} />
        </div>
        <p className="mt-1 pl-8 text-sm text-muted">{me?.email}</p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Phone className="size-5 text-primary" />
          <p className="flex-1 font-semibold">Numéro de téléphone</p>
          <Status ok={!!me?.phoneVerified} />
        </div>
        {!me?.phoneVerified && (
          <div className="mt-3 space-y-3 pl-8">
            {!codeSent ? (
              <div className="flex gap-2">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" className="max-w-[220px]" />
                <Button loading={busy === "sms"} onClick={() => call("sms", async () => setCodeSent(await api("/api/me/phone", { body: { phone } })), "Code envoyé par SMS")}>
                  Recevoir un code
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Code envoyé au {codeSent.phone}.{" "}
                  {codeSent.devCode && (
                    <span className="font-semibold text-warning">
                      [Développement — aucun fournisseur SMS configuré] Code : {codeSent.devCode}
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="max-w-[140px] text-center text-lg tracking-widest" />
                  <Button loading={busy === "code"} onClick={() => call("code", async () => { await api("/api/me/phone", { method: "PUT", body: { code } }); setCodeSent(null); }, "Téléphone vérifié")}>
                    Valider
                  </Button>
                  <Button variant="ghost" onClick={() => setCodeSent(null)}>
                    Changer
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <IdCard className="size-5 text-primary" />
          <p className="flex-1 font-semibold">Identité</p>
          <Status ok={!!me?.identityVerified} pending={idPending} />
        </div>
        {!me?.identityVerified && (
          <div className="mt-3 space-y-3 pl-8 text-sm">
            <p className="text-muted">
              Requise pour la garde d'enfants, l'aide aux personnes vulnérables et la surveillance de domicile. La vérification est réalisée par notre prestataire certifié ou par un modérateur habilité ; votre pièce d'identité n'est jamais affichée sur ENTOUR et n'est pas conservée au-delà du contrôle.
            </p>
            {idPending ? (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">Demande en cours d'examen. Vous serez notifié(e) de la décision.</p>
            ) : (
              <>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message pour l'équipe (facultatif)" maxLength={300} rows={2} />
                <Button loading={busy === "id"} onClick={() => call("id", async () => { await api("/api/me/identity", { body: { note } }); }, "Demande envoyée")}>
                  Demander la vérification
                </Button>
              </>
            )}
            {data?.verifications
              .filter((v) => v.type === "identity" && v.status === "rejected")
              .slice(0, 1)
              .map((v) => (
                <p key={v.id} className="flex items-center gap-1.5 text-danger">
                  <XCircle className="size-4" /> Dernière demande refusée{v.decisionNote ? ` : ${v.decisionNote}` : ""}
                </p>
              ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <UserCheck className="size-5 text-primary" />
          <p className="flex-1 font-semibold">Références</p>
          <Badge tone={refs.some((r) => r.status === "approved") ? "success" : "neutral"}>{refs.filter((r) => r.status === "approved").length} validée(s)</Badge>
        </div>
        <p className="mt-1 pl-8 text-sm text-muted">Obligatoires pour le baby-sitting : indiquez une famille ou un employeur pouvant attester de votre sérieux. Notre équipe les contacte avant validation.</p>
        {refs.length > 0 && (
          <ul className="mt-3 space-y-1 pl-8 text-sm">
            {refs.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                {r.details.name} — <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{{ approved: "Validée", rejected: "Refusée", pending: "En vérification" }[r.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 pl-8 sm:grid-cols-2">
          <Field label="Nom de la référence">
            <Input value={ref.name} onChange={(e) => setRef({ ...ref, name: e.target.value })} />
          </Field>
          <Field label="Relation">
            <Input value={ref.relation} onChange={(e) => setRef({ ...ref, relation: e.target.value })} placeholder="Ex : famille gardée 2 ans" />
          </Field>
          <Field label="Contact (téléphone ou e-mail)">
            <Input value={ref.contact} onChange={(e) => setRef({ ...ref, contact: e.target.value })} />
          </Field>
          <Field label="Pour la catégorie">
            <Select value={ref.categoryId} onChange={(e) => setRef({ ...ref, categoryId: e.target.value })}>
              <option value="">Toutes</option>
              {cats?.categories
                .filter((c) => c.requiresReferences)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Button
            className="sm:col-span-2"
            variant="secondary"
            loading={busy === "ref"}
            disabled={ref.name.length < 2 || ref.relation.length < 2 || ref.contact.length < 5}
            onClick={() =>
              call("ref", async () => {
                await api("/api/me/references", { body: { ...ref, categoryId: ref.categoryId ? Number(ref.categoryId) : null } });
                setRef({ name: "", relation: "", contact: "", categoryId: "" });
              }, "Référence ajoutée")
            }
          >
            Ajouter la référence
          </Button>
        </div>
      </Card>
    </div>
  );
}
