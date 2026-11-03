"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

function Reset() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [devUrl, setDevUrl] = useState<string | null>(null);

  if (token)
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("loading");
          try {
            await api("/api/auth/reset", { body: { token, password } });
            router.replace("/connexion");
          } catch (err) {
            setState("error");
            setMsg(err instanceof Error ? err.message : "Erreur");
          }
        }}
      >
        <h1 className="text-3xl font-extrabold tracking-tight">Nouveau mot de passe</h1>
        <Field label="Mot de passe" hint="10 caractères minimum, avec des lettres et des chiffres">
          <Input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {state === "error" && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{msg}</p>}
        <Button type="submit" full size="lg" loading={state === "loading"}>
          Enregistrer
        </Button>
      </form>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("loading");
        try {
          const r = await api<{ devUrl: string | null }>("/api/auth/reset-request", { body: { email } });
          setDevUrl(r.devUrl);
          setState("sent");
        } catch (err) {
          setState("error");
          setMsg(err instanceof Error ? err.message : "Erreur");
        }
      }}
    >
      <h1 className="text-3xl font-extrabold tracking-tight">Mot de passe oublié</h1>
      <p className="text-muted">Indiquez votre e-mail : si un compte existe, vous recevrez un lien de réinitialisation valable 1 heure.</p>
      <Field label="Adresse e-mail">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {state === "sent" && (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          Si un compte existe pour cette adresse, un e-mail vient d'être envoyé.
          {devUrl && (
            <>
              {" "}
              <a href={devUrl} className="font-semibold underline">
                Lien de développement
              </a>
            </>
          )}
        </p>
      )}
      {state === "error" && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{msg}</p>}
      <Button type="submit" full size="lg" loading={state === "loading"}>
        Envoyer le lien
      </Button>
      <p className="text-center text-sm">
        <Link href="/connexion" className="font-semibold text-primary">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
