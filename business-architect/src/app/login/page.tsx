import Link from "next/link";
import { AuthForm } from "@/components/client";
import { Card } from "@/components/ui";

export default function Login() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <Card title="Connexion">
        <AuthForm mode="login" />
        <p className="mt-4 text-sm text-ink-2">Pas de compte ? <Link className="text-brand-700 underline" href="/signup">Créer un compte</Link></p>
      </Card>
    </div>
  );
}
