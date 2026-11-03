import Link from "next/link";
import { AppShell, Logo } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";

/** Pages consultables sans compte (annonce partagée, profil public) : coque complète si connecté. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) return <AppShell>{children}</AppShell>;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-text">
            <Logo />
          </Link>
          <div className="flex gap-2">
            <Link href="/connexion" className="rounded-xl px-3 py-2 text-sm font-semibold">
              Se connecter
            </Link>
            <Link href="/inscription" className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-ink">
              S'inscrire
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
