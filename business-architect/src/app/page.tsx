import { redirect } from "next/navigation";
import { currentUser } from "@/lib/http";
import { ButtonLink } from "@/components/ui";

export default async function Home() {
  if (await currentUser().catch(() => null)) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">Tu n'as pas besoin d'idée.</h1>
      <p className="mt-4 text-lg text-ink-2">Donne ton budget, ton temps et tes contraintes. L'IA recherche des opportunités réelles, invente et compare des concepts, choisit le plus pertinent, puis construit le business : stratégie, finances, marque, site, plans de vente et de lancement.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/signup">Commencer</ButtonLink>
        <ButtonLink href="/login" variant="secondary">J'ai déjà un compte</ButtonLink>
      </div>
      <p className="mt-8 text-xs text-ink-2">Aucune action externe (dépense, publication, envoi) n'est réalisée sans ton approbation explicite. Les prévisions ne sont jamais des garanties.</p>
    </div>
  );
}
