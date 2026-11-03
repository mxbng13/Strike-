"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import { REPORT_REASONS } from "@/lib/validators";
import { useToast } from "./providers";
import { Button, Field, Select, Sheet, Textarea } from "./ui";

export function ReportSheet({ open, onClose, targetType, targetId, label }: { open: boolean; onClose: () => void; targetType: "user" | "service" | "message" | "review" | "conversation" | "post"; targetId: string; label?: string }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Signaler ${label ?? ""}`.trim()}
      footer={
        <Button
          full
          variant="danger"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await api("/api/reports", { body: { targetType, targetId, reason, details } });
              push({ tone: "success", title: "Signalement envoyé", body: "Notre équipe de modération va l'examiner. Merci." });
              onClose();
            } catch (e) {
              push({ tone: "error", title: (e as Error).message });
            } finally {
              setLoading(false);
            }
          }}
        >
          Envoyer le signalement
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">Les signalements sont confidentiels. En cas de danger immédiat, appelez le 17 (police) ou le 112.</p>
        <Field label="Motif">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(REPORT_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Détails (facultatif)">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        </Field>
      </div>
    </Sheet>
  );
}

export function ReportButton(props: { targetType: "user" | "service" | "message" | "review" | "conversation" | "post"; targetId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={props.className ?? "inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-danger"}>
        <Flag className="size-4" /> Signaler
      </button>
      <ReportSheet open={open} onClose={() => setOpen(false)} {...props} />
    </>
  );
}
