import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/http";
import { LogoutButton } from "@/components/client";

export const metadata: Metadata = { title: "Business Architect AI", description: "L'IA qui découvre, conçoit et construit un business à partir de tes contraintes." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="fr">
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:p-2">Aller au contenu</a>
        <header className="border-b border-line bg-white">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3" aria-label="Navigation principale">
            <Link href={user ? "/dashboard" : "/"} className="font-bold text-brand-700">Business Architect AI</Link>
            {user ? (
              <div className="flex items-center gap-4 text-sm">
                <Link href="/dashboard" className="hover:text-brand-700">Tableau de bord</Link>
                <Link href="/approvals" className="hover:text-brand-700">Approbations</Link>
                <Link href="/settings" className="hover:text-brand-700">Paramètres</Link>
                <span className="hidden text-ink-2 sm:inline">{user.displayName}</span>
                <LogoutButton />
              </div>
            ) : (
              <div className="flex gap-4 text-sm">
                <Link href="/login">Connexion</Link>
                <Link href="/signup" className="font-semibold text-brand-700">Créer un compte</Link>
              </div>
            )}
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
