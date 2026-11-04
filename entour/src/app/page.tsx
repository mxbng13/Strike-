import { ArrowRight, BadgeCheck, CreditCard, MessageCircle, ShieldCheck, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CategoryBubble } from "@/components/icons";
import { Logo } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { CATEGORY_SEEDS } from "@/db/catalog";

export default async function Landing() {
  if (await getCurrentUser()) redirect("/accueil");
  const featured = ["baby-sitting", "livraison-repas", "aide-demenagement", "promenade-chiens", "tonte-pelouse", "montage-meubles", "aide-informatique", "courses-alimentaires"]
    .map((s) => CATEGORY_SEEDS.find((c) => c.slug === s)!)
    .filter(Boolean);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo className="text-text" />
        <nav className="flex items-center gap-2">
          <Link href="/connexion" className="rounded-xl px-4 py-2 text-sm font-semibold hover:bg-surface-2">
            Se connecter
          </Link>
          <Link href="/inscription" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink">
            S'inscrire
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">
            <Sparkles className="size-4" /> Les services entre voisins, simplement
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Besoin d'un coup de main ?
            <br />
            <span className="text-primary">Quelqu'un est juste à côté.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Publiez votre besoin en moins d'une minute — baby-sitting, courses, bricolage, jardin, déménagement ou n'importe quel petit service. Les personnes disponibles autour de vous répondent, vous choisissez, vous payez en toute sécurité.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/inscription" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-primary px-6 font-semibold text-primary-ink shadow-[0_12px_28px_-12px_var(--primary)]">
              Publier une demande <ArrowRight className="size-5" />
            </Link>
            <Link href="/inscription" className="inline-flex h-13 items-center gap-2 rounded-2xl border border-border bg-surface px-6 font-semibold">
              Gagner de l'argent en rendant service
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-success" /> Paiement sécurisé
            </li>
            <li className="flex items-center gap-1.5">
              <BadgeCheck className="size-4 text-success" /> Profils vérifiés
            </li>
            <li className="flex items-center gap-1.5">
              <Star className="size-4 text-success" /> Avis certifiés
            </li>
          </ul>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_30%_30%,var(--primary-soft),transparent_70%)]" />
          <div className="space-y-3">
            {[
              { t: "Garder Léo (5 ans) ce soir", c: "baby-sitting", p: "30 €", d: "19 h – 22 h · à 600 m", u: true },
              { t: "Ramener un McDo à la maison", c: "livraison-repas", p: "5 €", d: "Maintenant · à 1 km", u: true },
              { t: "Déplacer un canapé au 3ᵉ étage", c: "aide-demenagement", p: "40 €", d: "Samedi 10 h · 2 personnes" },
              { t: "Promener Pixel pendant 30 min", c: "promenade-chiens", p: "8 €", d: "Tous les jours · 12 h" },
            ].map((x, i) => {
              const cat = CATEGORY_SEEDS.find((c) => c.slug === x.c)!;
              return (
                <div key={i} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 shadow-card" style={{ marginLeft: i % 2 ? 28 : 0 }}>
                  <CategoryBubble icon={cat.icon} color={cat.color} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{x.t}</p>
                    <p className="text-sm text-muted">{x.d}</p>
                  </div>
                  <div className="text-right">
                    <p className="rounded-xl bg-primary-soft px-2 py-1 font-extrabold text-primary">{x.p}</p>
                    {x.u && <p className="mt-1 text-xs font-semibold text-danger">Urgent</p>}
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-center text-xs text-muted">Exemples d'annonces à titre d'illustration</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-extrabold tracking-tight">Comment ça marche</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "1", t: "Publiez", d: "Décrivez votre besoin en une phrase : l'assistant rédige l'annonce et suggère un prix juste." },
              { n: "2", t: "Recevez des réponses", d: "Les voisins disponibles et compétents sont prévenus. Ils acceptent, proposent un tarif ou posent une question." },
              { n: "3", t: "Choisissez", d: "Comparez notes, avis, distance, badges et prix. Discutez dans la messagerie intégrée." },
              { n: "4", t: "Payez & notez", d: "L'argent est bloqué dans la tirelire ENTOUR puis versé à la fin. ENTOUR ne prend que 5 % de la rémunération, jamais sur les achats." },
            ].map((s) => (
              <div key={s.n}>
                <span className="flex size-10 items-center justify-center rounded-2xl bg-primary font-extrabold text-primary-ink">{s.n}</span>
                <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
                <p className="mt-1 text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-extrabold tracking-tight">Plus de 50 types de services… et tous les autres</h2>
        <p className="mt-2 text-muted">Si votre besoin n'est pas dans la liste, créez une demande entièrement personnalisée.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {featured.map((c) => (
            <div key={c.slug} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <CategoryBubble icon={c.icon} color={c.color} size={40} />
              <span className="text-sm font-semibold leading-tight">{c.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { i: ShieldCheck, t: "La confiance avant tout", d: "Vérification de l'e-mail, du téléphone et de l'identité. Règles renforcées pour la garde d'enfants, l'accès au domicile et les personnes vulnérables." },
            { i: CreditCard, t: "Tirelire protégée, 5 % seulement", d: "Commande à 30 € + 5 € de service ? Vous bloquez 35 € ; l'intervenant ne paie rien de sa poche et reçoit 34,75 € à la fin. ENTOUR prend 5 % de la rémunération uniquement." },
            { i: MessageCircle, t: "Tout se passe dans l'app", d: "Messagerie complète, propositions de prix, changements d'horaire, partage temporaire de position : tout est tracé." },
          ].map((f) => (
            <div key={f.t} className="rounded-3xl border border-border bg-surface p-6">
              <f.i className="size-7 text-primary" />
              <h3 className="mt-4 text-lg font-bold">{f.t}</h3>
              <p className="mt-1 text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-[2rem] bg-primary px-8 py-12 text-center text-white">
          <h2 className="text-3xl font-extrabold tracking-tight">Votre quartier vous attend</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/80">L'inscription est gratuite. Vous ne payez que les services dont vous bénéficiez.</p>
          <Link href="/inscription" className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 font-semibold text-[#3b2fd9]">
            Créer mon compte <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <Logo className="text-text" />
          <nav className="flex flex-wrap gap-4">
            <Link href="/legal/cgu">Conditions générales</Link>
            <Link href="/legal/confidentialite">Confidentialité</Link>
            <Link href="/legal/mentions">Mentions légales</Link>
            <Link href="/legal/securite">Règles de sécurité</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
