import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/shell";

/**
 * Documents juridiques. Les mentions entre crochets [ … ] doivent être complétées avec les informations
 * de la société exploitante avant toute mise en production, et l'ensemble relu par un juriste.
 */
const DOCS: Record<string, { title: string; updated: string; sections: { id?: string; h: string; p: string[] }[] }> = {
  mentions: {
    title: "Mentions légales",
    updated: "Novembre 2026",
    sections: [
      { h: "Éditeur", p: ["ENTOUR est édité par [Raison sociale], [forme juridique] au capital de [montant] €, immatriculée au RCS de [ville] sous le numéro [SIREN], dont le siège social est situé [adresse].", "Directeur de la publication : [Nom]. Contact : [adresse e-mail de contact]. Numéro de TVA intracommunautaire : [numéro]."] },
      { h: "Hébergement", p: ["Le service est hébergé par [hébergeur], [adresse], [téléphone]. Les données sont hébergées dans l'Union européenne."] },
      { h: "Paiements", p: ["Les paiements sont traités par Stripe Payments Europe Ltd, établissement de monnaie électronique agréé. ENTOUR n'encaisse ni ne détient les fonds des utilisateurs pour son propre compte."] },
      { h: "Médiation de la consommation", p: ["Conformément à l'article L612-1 du Code de la consommation, tout consommateur peut recourir gratuitement au médiateur [nom du médiateur, coordonnées] en vue de la résolution amiable d'un litige."] },
    ],
  },
  cgu: {
    title: "Conditions générales d'utilisation",
    updated: "Novembre 2026 — version 2026-11",
    sections: [
      { h: "1. Objet", p: ["ENTOUR est une plateforme de mise en relation entre particuliers souhaitant obtenir un service (« demandeurs ») et particuliers proposant de le réaliser (« intervenants »). ENTOUR n'est pas partie aux prestations : le contrat de service est conclu directement entre les membres.", "ENTOUR n'est ni employeur, ni donneur d'ordre des intervenants. Aucun lien de subordination n'existe entre ENTOUR et les membres."] },
      { h: "2. Inscription et conditions d'âge", p: ["L'inscription est réservée aux personnes physiques majeures (18 ans et plus) disposant de la capacité juridique. La date de naissance déclarée ne peut plus être modifiée, sauf rectification après vérification d'identité.", "Chaque membre ne peut détenir qu'un seul compte. Les informations fournies doivent être exactes et tenues à jour."] },
      { h: "3. Services autorisés et interdits", p: ["Sont interdits : toute activité illégale, dangereuse ou réglementée exercée sans la qualification requise (soins médicaux, transport rémunéré de personnes, travaux sur installations électriques ou de gaz relevant d'un professionnel qualifié, etc.), la vente de produits interdits, et tout contenu discriminatoire, haineux ou à caractère sexuel.", "Certaines catégories (garde d'enfants, accompagnement de personnes vulnérables, accès au domicile) sont soumises à des vérifications renforcées (téléphone, identité, références)."] },
      { id: "classement", h: "4. Classement et référencement des annonces", p: ["Conformément à l'article L111-7 du Code de la consommation, les demandes sont présentées selon un ordre tenant compte de la distance, de la date de publication, du niveau d'urgence et, le cas échéant, d'une mise en avant (option signalée comme telle). Les intervenants notifiés d'une nouvelle demande sont sélectionnés selon la distance, la catégorie, les disponibilités, les compétences déclarées, les préférences et la réputation.", "Aucune rémunération n'influence le classement en dehors des options de mise en avant explicitement identifiées."] },
      { h: "5. Prix, paiement et commission", p: ["Le prix est librement fixé entre les membres. Le paiement s'effectue exclusivement via le prestataire de paiement d'ENTOUR : il est autorisé à la confirmation de la mission puis prélevé à la confirmation de fin de mission et versé à l'intervenant, déduction faite de la commission d'ENTOUR affichée avant tout engagement.", "Les paiements effectués en dehors de la plateforme ne bénéficient d'aucune protection et sont contraires aux présentes conditions."] },
      { h: "6. Annulation, remboursement et litiges", p: ["Chaque membre peut annuler une mission en indiquant un motif ; l'autorisation de paiement est alors levée ou le montant remboursé. Les annulations répétées affectent l'indicateur de fiabilité.", "En cas de désaccord, un litige peut être ouvert dans les 14 jours suivant la fin de la mission. Le paiement est gelé et l'équipe ENTOUR rend une décision après examen des éléments fournis par les deux parties."] },
      { h: "7. Avis", p: ["Seuls les participants d'une mission réellement terminée peuvent se noter, dans un délai de 30 jours. Les avis sont publiés sans contrôle préalable ; ils peuvent être signalés et sont alors examinés par la modération. ENTOUR ne rémunère pas les avis et n'en supprime pas en raison de leur caractère négatif."] },
      { id: "fiscalite", h: "8. Obligations fiscales et sociales", p: ["Les revenus perçus via ENTOUR peuvent être imposables et, lorsque l'activité présente un caractère régulier ou professionnel, soumis à cotisations sociales et à immatriculation (par exemple sous le régime de micro-entrepreneur). Chaque membre est seul responsable du respect de ses obligations.", "En application de l'article 242 bis du Code général des impôts et de la directive (UE) 2021/514 (DAC7), ENTOUR informe chaque utilisateur, en janvier, du montant brut des transactions perçues l'année précédente et transmet ces informations à l'administration fiscale pour les utilisateurs ayant réalisé au moins 30 transactions ou perçu au moins 2 000 € au cours de l'année. Liens utiles : impots.gouv.fr et urssaf.fr."] },
      { h: "9. Modération et sanctions", p: ["ENTOUR peut retirer un contenu, suspendre ou fermer un compte en cas de manquement, après examen et avec indication du motif, conformément au règlement (UE) 2022/2065 sur les services numériques. Le membre concerné peut contester la décision via le support."] },
      { h: "10. Responsabilité", p: ["ENTOUR met en œuvre des moyens raisonnables de vérification mais ne garantit pas la qualité des prestations réalisées par les membres. Chaque membre est responsable de ses engagements et est invité à vérifier sa couverture d'assurance responsabilité civile."] },
    ],
  },
  confidentialite: {
    title: "Politique de confidentialité",
    updated: "Novembre 2026",
    sections: [
      { h: "Responsable de traitement", p: ["[Raison sociale], [adresse]. Délégué à la protection des données : [contact DPO]."] },
      { h: "Données collectées", p: ["Données de compte (nom, prénom, e-mail, date de naissance, téléphone), données de profil (photo, présentation, compétences, disponibilités), localisation approximative de votre zone et adresse des missions, contenus publiés (demandes, messages, pièces jointes, avis), données de transaction (montants, statuts — les données de carte bancaire sont traitées exclusivement par notre prestataire de paiement) et journaux de sécurité (connexions, adresses IP)."] },
      { h: "Finalités et bases légales", p: ["Exécution du contrat : mise en relation, messagerie, paiements, avis. Intérêt légitime : sécurité, prévention de la fraude, modération, statistiques agrégées. Obligation légale : conservation comptable, obligations fiscales (DAC7), réponse aux réquisitions. Consentement : partage de position en temps réel, notifications push, traduction automatique."] },
      { h: "Protection de la localisation", p: ["L'adresse exacte d'une mission n'est jamais affichée publiquement : la carte et les distances utilisent une position volontairement floutée (de 150 à 400 m). L'adresse n'est communiquée qu'à l'intervenant retenu. Le partage de position dans la messagerie est temporaire et nécessite votre action explicite."] },
      { h: "Destinataires", p: ["Les autres membres (uniquement les informations de profil public), nos sous-traitants techniques (hébergement, envoi d'e-mails et de SMS, paiement, vérification d'identité, assistance à la rédaction par IA lorsque vous l'utilisez), et les autorités lorsque la loi l'exige. Aucune donnée n'est vendue."] },
      { h: "Durées de conservation", p: ["Compte : jusqu'à sa suppression. Messages : 3 ans après la dernière activité. Données de transaction : 10 ans (obligation comptable). Journaux de sécurité : 1 an. Pièces de vérification d'identité : non conservées au-delà du contrôle."] },
      { h: "Vos droits", p: ["Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Depuis Paramètres > Mes données, vous pouvez télécharger vos données ou supprimer votre compte. Pour toute autre demande : [contact DPO]. Vous pouvez introduire une réclamation auprès de la CNIL (cnil.fr)."] },
    ],
  },
  securite: {
    title: "Règles de sécurité et de confiance",
    updated: "Novembre 2026",
    sections: [
      { h: "Avant la mission", p: ["Consultez le profil, les avis et les vérifications de la personne. Échangez uniquement via la messagerie ENTOUR. Ne communiquez jamais de code reçu par SMS, de coordonnées bancaires ou de pièce d'identité dans une conversation.", "L'adresse exacte n'est révélée qu'après votre choix d'intervenant."] },
      { h: "Garde d'enfants", p: ["Intervenant majeur, téléphone et identité vérifiés, au moins une référence validée. Nous recommandons une rencontre préalable en présence de l'enfant et des parents, et la communication des consignes de santé (allergies, numéros d'urgence)."] },
      { h: "Personnes vulnérables", p: ["Identité vérifiée obligatoire. Un proche doit être informé de l'intervention. Aucun acte de soin, de toilette médicalisée ou de gestion financière ne peut être confié via ENTOUR."] },
      { h: "Accès au domicile et animaux", p: ["Privilégiez des profils vérifiés et bien notés, mettez vos objets de valeur à l'abri et convenez des modalités de remise des clés dans la messagerie. Pour les animaux, communiquez le caractère de l'animal et les coordonnées de votre vétérinaire."] },
      { h: "Travaux et transport", p: ["Seuls les petits travaux sont autorisés. Les interventions réglementées doivent être confiées à des professionnels qualifiés et assurés. Le transport rémunéré de personnes est interdit ; seul le transport d'objets est possible."] },
      { h: "En cas de problème", p: ["Signalez tout comportement suspect depuis le profil, l'annonce ou la conversation. Vous pouvez bloquer un membre à tout moment. En cas de danger immédiat, appelez le 17 (police) ou le 112."] },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-text">
            <Logo />
          </Link>
          <nav className="flex gap-3 text-sm text-muted">
            {Object.entries(DOCS).map(([k, d]) => (
              <Link key={k} href={`/legal/${k}`} className={k === slug ? "font-semibold text-text" : ""}>
                {d.title.split(" ")[0] === "Conditions" ? "CGU" : d.title.split(" ")[0]}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-sm text-muted">Dernière mise à jour : {doc.updated}</p>
        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h} id={s.id} className="scroll-mt-6">
              <h2 className="text-lg font-bold">{s.h}</h2>
              {s.p.map((t, i) => (
                <p key={i} className="mt-2 leading-relaxed text-text/85">
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
