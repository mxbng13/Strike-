/**
 * Analyse d'un ticket de caisse / d'une preuve d'achat.
 * Avec ANTHROPIC_API_KEY : Claude lit l'image (ou le PDF) et en extrait le total, l'enseigne et la date,
 * puis compare au montant déclaré. Sans clé : aucune analyse automatique, la décision revient à un modérateur.
 * Dans tous les cas, c'est un membre de l'équipe ENTOUR qui valide le remboursement.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { aiConfigured } from "./assistant";

export type ReceiptAnalysis = { source: "claude" | "none"; totalCents?: number | null; merchant?: string | null; date?: string | null; readable?: boolean; consistent?: boolean | null; notes?: string };

const Schema = z.object({
  readable: z.boolean().describe("true si l'image montre lisiblement un ticket, une facture ou une preuve d'achat"),
  totalEuros: z.number().nullable().describe("Montant total payé en euros, ou null s'il est illisible"),
  merchant: z.string().nullable(),
  date: z.string().nullable().describe("Date d'achat au format AAAA-MM-JJ, ou null"),
  notes: z.string().describe("Une ou deux phrases factuelles en français : ce que montre la preuve, éléments douteux éventuels"),
});

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Compare un total lu au montant déclaré : tolérance de 1 € ou 5 %. */
export function isConsistent(readCents: number | null | undefined, declaredCents: number): boolean | null {
  if (readCents == null) return null;
  return Math.abs(readCents - declaredCents) <= Math.max(100, Math.round(declaredCents * 0.05));
}

export async function analyzeReceipt(buf: Buffer, mimeType: string, declaredCents: number, context: string): Promise<ReceiptAnalysis> {
  if (!aiConfigured()) return { source: "none", notes: "Analyse automatique non activée sur ce serveur : vérification manuelle par l'équipe." };
  try {
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
    const media = IMAGE_TYPES.includes(mimeType as (typeof IMAGE_TYPES)[number])
      ? { type: "image" as const, source: { type: "base64" as const, media_type: mimeType as (typeof IMAGE_TYPES)[number], data: buf.toString("base64") } }
      : { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: buf.toString("base64") } };
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      system: "Tu vérifies des preuves d'achat pour une plateforme de services entre particuliers. Lis uniquement ce qui figure sur le document ; n'invente rien.",
      messages: [{ role: "user", content: [media, { type: "text", text: `Contexte de la mission : ${context.slice(0, 300)}\nMontant déclaré par l'intervenant : ${(declaredCents / 100).toFixed(2)} €.` }] }],
    });
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) return { source: "none", notes: "Analyse automatique impossible : vérification manuelle." };
    const totalCents = out.totalEuros == null ? null : Math.round(out.totalEuros * 100);
    return { source: "claude", readable: out.readable, totalCents, merchant: out.merchant, date: out.date, consistent: out.readable ? isConsistent(totalCents, declaredCents) : false, notes: out.notes };
  } catch (err) {
    console.error("[receipt] analyse échouée", err);
    return { source: "none", notes: "Analyse automatique indisponible : vérification manuelle." };
  }
}
