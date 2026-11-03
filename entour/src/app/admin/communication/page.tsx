"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, Confirm, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type A = { id: string; title: string; body: string; audience: string; recipients: number; createdAt: string };

export default function Communication() {
  const { data, mutate } = useSWR<{ announcements: A[] }>("/api/admin/announcements");
  const { run, pending } = useAction();
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Communication" subtitle="Annonces générales envoyées sous forme de notification in-app." />
      <Card className="space-y-3 p-5">
        <Field label="Titre">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Message">
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={1000} />
        </Field>
        <Field label="Destinataires">
          <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="max-w-xs">
            <option value="all">Tous les membres actifs</option>
            <option value="providers">Membres proposant des services</option>
            <option value="requesters">Membres ayant publié une demande</option>
          </Select>
        </Field>
        <Button disabled={form.title.length < 3 || form.body.length < 3} onClick={() => setConfirm(true)}>
          Envoyer
        </Button>
      </Card>
      <section>
        <h2 className="mb-2 font-bold">Historique</h2>
        <Card className="divide-y divide-border">
          {data?.announcements.length === 0 && <p className="p-4 text-sm text-muted">Aucune annonce envoyée.</p>}
          {data?.announcements.map((a) => (
            <div key={a.id} className="p-4">
              <p className="font-semibold">{a.title}</p>
              <p className="text-sm text-muted">{a.body}</p>
              <p className="mt-1 flex gap-2 text-xs text-muted">
                {new Date(a.createdAt).toLocaleString("fr-FR")} <Badge>{a.audience}</Badge> {a.recipients} destinataire(s)
              </p>
            </div>
          ))}
        </Card>
      </section>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Envoyer cette annonce ?"
        loading={pending === "send"}
        onConfirm={() =>
          run("send", async () => {
            await api("/api/admin/announcements", { body: form });
            setConfirm(false);
            setForm({ title: "", body: "", audience: "all" });
            await mutate();
          }, { success: "Annonce envoyée" })
        }
        description="Tous les destinataires recevront une notification. Cette action est journalisée."
      />
    </div>
  );
}
