"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui";

function Return() {
  const ok = useSearchParams().get("status") === "success";
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {ok ? <CheckCircle2 className="mx-auto size-16 text-success" /> : <XCircle className="mx-auto size-16 text-danger" />}
      <h1 className="mt-4 text-2xl font-extrabold">{ok ? "Paiement sécurisé" : "Paiement interrompu"}</h1>
      <p className="mt-2 text-muted">
        {ok ? "Le montant est autorisé et sera prélevé uniquement à la confirmation de fin de mission. La confirmation peut prendre quelques secondes." : "Aucun montant n'a été prélevé. Vous pouvez réessayer depuis la conversation de la mission."}
      </p>
      <ButtonLink href="/mes-missions" className="mt-6">
        Mes missions
      </ButtonLink>
    </div>
  );
}

export default function PaymentReturn() {
  return (
    <Suspense>
      <Return />
    </Suspense>
  );
}
