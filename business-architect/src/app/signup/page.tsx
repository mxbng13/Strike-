import Link from "next/link";
import { AuthForm } from "@/components/client";
import { Card } from "@/components/ui";

export default function Signup() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <Card title="Créer un compte">
        <AuthForm mode="signup" />
        <p className="mt-4 text-sm text-ink-2">Déjà inscrit ? <Link className="text-brand-700 underline" href="/login">Se connecter</Link></p>
      </Card>
    </div>
  );
}
