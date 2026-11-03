"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ButtonLink, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

function Verify() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (!token) {
      setState("error");
      setMsg("Lien incomplet.");
      return;
    }
    api("/api/auth/verify-email", { body: { token } })
      .then(() => setState("ok"))
      .catch((e) => {
        setState("error");
        setMsg(e.message);
      });
  }, [token]);
  if (state === "loading") return <Spinner className="mx-auto size-8" />;
  return (
    <div className="text-center">
      {state === "ok" ? <CheckCircle2 className="mx-auto size-16 text-success" /> : <XCircle className="mx-auto size-16 text-danger" />}
      <h1 className="mt-4 text-2xl font-extrabold">{state === "ok" ? "Adresse confirmée !" : "Lien invalide"}</h1>
      <p className="mt-2 text-muted">{state === "ok" ? "Vous pouvez maintenant publier des demandes et répondre à celles de vos voisins." : msg}</p>
      <ButtonLink href="/accueil" className="mt-6">
        Continuer
      </ButtonLink>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
