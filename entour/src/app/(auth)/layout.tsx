import Link from "next/link";
import { Logo } from "@/components/shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="text-text">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-xs text-muted">
          <Link href="/legal/cgu" className="hover:underline">CGU</Link> · <Link href="/legal/confidentialite" className="hover:underline">Confidentialité</Link> · <Link href="/legal/mentions" className="hover:underline">Mentions légales</Link>
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(18,160,107,0.35),transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">Un coup de main, à deux rues de chez vous.</p>
          <p className="mt-4 max-w-md text-lg text-white/80">Baby-sitting, courses, bricolage, jardin, déménagement… Publiez en moins d'une minute, vos voisins répondent.</p>
        </div>
      </div>
    </div>
  );
}
