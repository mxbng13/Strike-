"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ApiError, api } from "@/lib/client";

function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", birthDate: "", referralCode: sp.get("parrain") ?? "", acceptTerms: false, website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setErrors({});
        try {
          await api("/api/auth/register", { body: { ...form, acceptTerms: form.acceptTerms || undefined } });
          router.replace("/onboarding");
          router.refresh();
        } catch (err) {
          if (err instanceof ApiError && Array.isArray(err.details)) {
            const map: Record<string, string> = {};
            for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message;
            setErrors(map);
          }
          setError(err instanceof Error ? err.message : "Inscription impossible");
          setLoading(false);
        }
      }}
    >
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Rejoindre ENTOUR</h1>
        <p className="mt-1 text-muted">Demandez de l'aide ou rendez service : un seul compte pour les deux.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" htmlFor="fn" error={errors.firstName}>
          <Input id="fn" autoComplete="given-name" required value={form.firstName} onChange={set("firstName")} />
        </Field>
        <Field label="Nom" htmlFor="ln" error={errors.lastName} hint="Seule l'initiale est publique">
          <Input id="ln" autoComplete="family-name" required value={form.lastName} onChange={set("lastName")} />
        </Field>
      </div>
      <Field label="Adresse e-mail" htmlFor="em" error={errors.email}>
        <Input id="em" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Mot de passe" htmlFor="pw" error={errors.password} hint="10 caractères minimum, avec des lettres et des chiffres">
        <Input id="pw" type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set("password")} />
      </Field>
      <Field label="Date de naissance" htmlFor="bd" error={errors.birthDate} hint="ENTOUR est réservé aux personnes majeures. Cette date ne pourra plus être modifiée.">
        <Input id="bd" type="date" required value={form.birthDate} onChange={set("birthDate")} max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)} />
      </Field>
      <Field label="Code de parrainage (facultatif)" htmlFor="rc">
        <Input id="rc" value={form.referralCode} onChange={set("referralCode")} placeholder="ABC1234" />
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={form.website} onChange={set("website")} aria-hidden />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={form.acceptTerms} onChange={set("acceptTerms")} className="mt-0.5 size-5 accent-[var(--primary)]" required />
        <span className="text-muted">
          J'accepte les{" "}
          <Link href="/legal/cgu" target="_blank" className="font-semibold text-primary">
            conditions générales
          </Link>{" "}
          et la{" "}
          <Link href="/legal/confidentialite" target="_blank" className="font-semibold text-primary">
            politique de confidentialité
          </Link>
          , et je reconnais être responsable de mes obligations fiscales et sociales liées aux revenus perçus.
        </span>
      </label>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" full size="lg" loading={loading}>
        Créer mon compte
      </Button>
      <p className="text-center text-sm text-muted">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-semibold text-primary">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
