/**
 * Assistant IA de rédaction d'annonces.
 * - Avec ANTHROPIC_API_KEY : Claude rédige une annonce structurée (sortie JSON validée par Zod).
 * - Sans clé, ou en cas d'erreur : assistant local à base de règles (assistant-local.ts).
 * La source est toujours renvoyée au client pour être affichée honnêtement.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { draftFromSentence, type CategoryLite, type Draft } from "./assistant-local";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

const DraftSchema = z.object({
  title: z.string().describe("Titre court et clair, 70 caractères max, sans emoji"),
  description: z.string().describe("Description détaillée, polie, corrigée, 2 à 5 phrases, sans coordonnées personnelles"),
  categorySlug: z.string(),
  alternativeSlugs: z.array(z.string()),
  timingType: z.enum(["immediate", "today", "tomorrow", "scheduled", "recurring"]),
  startTime: z.string().nullable().describe("HH:MM ou null"),
  durationMinutes: z.number().int().nullable(),
  budgetEuros: z.number().nullable().describe("Uniquement si l'utilisateur a indiqué un montant"),
  urgency: z.enum(["normal", "high", "urgent"]),
  peopleNeeded: z.number().int(),
  skills: z.array(z.string()).describe("0 à 4 compétences utiles, en français"),
  recurrence: z.object({ freq: z.enum(["daily", "weekly", "monthly"]) }).nullable(),
  refused: z.boolean().describe("true si la demande est illégale, dangereuse ou réglementée"),
});

const SYSTEM = `Tu aides les membres d'ENTOUR, une plateforme française de petits services entre particuliers, à rédiger leurs demandes.
À partir d'une phrase, produis une annonce claire, polie et corrigée en français.
Règles :
- Ne jamais inventer de montant, d'adresse, d'heure ou de détail absent : laisse null.
- Ne jamais inclure de numéro de téléphone, e-mail ou adresse exacte dans la description.
- Choisis categorySlug parmi la liste fournie ; "autre" si rien ne correspond.
- Si la demande est illégale, dangereuse ou relève d'une profession réglementée (transport rémunéré de personnes, soins médicaux, électricité sur tableau, gaz…), mets refused à true.`;

export async function draftListing(sentence: string, categories: CategoryLite[]): Promise<Draft & { refused?: boolean }> {
  const local = draftFromSentence(sentence, categories);
  if (!aiConfigured()) return local;
  try {
    const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
    const catalog = categories.map((c) => `${c.slug}: ${c.name}`).join("\n");
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(DraftSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Catégories disponibles :\n${catalog}\n\nDate actuelle : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}\n\nDemande du membre :\n"""${sentence.slice(0, 600)}"""`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { ...local, refused: true };
    const out = response.parsed_output;
    if (!out) return local;
    const valid = new Set(categories.map((c) => c.slug));
    return {
      ...out,
      categorySlug: valid.has(out.categorySlug) ? out.categorySlug : local.categorySlug,
      alternativeSlugs: out.alternativeSlugs.filter((s) => valid.has(s)).slice(0, 3),
      categoryConfidence: 0.9,
      timingDetected: true,
      startDate: local.startDate,
      peopleNeeded: Math.max(1, Math.min(20, out.peopleNeeded)),
      budgetEuros: local.budgetEuros ?? out.budgetEuros,
      source: "claude",
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`[assistant] API ${err.status}`, err.message);
    else console.error("[assistant] échec", err);
    return local;
  }
}

/** Traduction d'un message (Claude uniquement). Retourne null si indisponible. */
export async function translateText(text: string, targetLang: string): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const client = new Anthropic({ timeout: 15_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1000,
      output_config: { effort: "low" },
      system: "Traduis fidèlement le message de l'utilisateur dans la langue demandée. Réponds uniquement par la traduction.",
      messages: [{ role: "user", content: `Langue cible : ${targetLang}\n\n${text.slice(0, 2000)}` }],
    });
    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : null;
  } catch {
    return null;
  }
}
