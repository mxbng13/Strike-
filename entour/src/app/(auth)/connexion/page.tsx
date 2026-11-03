"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = sp.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/accueil";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { email, password } });
          router.replace(safeNext);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Connexion impossible");
          setLoading(false);
        }
      }}
    >
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Bon retour 👋</h1>
        <p className="mt-1 text-muted">Connectez-vous pour retrouver vos voisins.</p>
      </div>
      <Field label="Adresse e-mail" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" full size="lg" loading={loading}>
        Se connecter
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/mot-de-passe" className="font-medium text-muted hover:text-text">
          Mot de passe oublié ?
        </Link>
        <Link href={`/inscription${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary">
          Créer un compte
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
