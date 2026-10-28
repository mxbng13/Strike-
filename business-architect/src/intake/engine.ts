import { and, asc, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/db/client";
import { AppError } from "@/lib/errors";
import {
  parseAmountEur,
  parseCountry,
  parseFreeText,
  parseHorizon,
  parseList,
  parseMode,
  parseWeeklyHours,
  type Parsed,
} from "./parsers";
import { UserProfileSchema, type UserProfile, HORIZON_LABEL, MODE_LABEL } from "./profile";
import { audit } from "@/audit/service";

/**
 * Short adaptive intake. Only asks what changes the AI's decisions; every
 * question accepts "je ne sais pas" → explicit default recorded in
 * `defaultsUsed`. The user is NEVER asked to provide a business idea
 * (only optionally, in "existing_idea" mode).
 */
type Draft = Partial<{
  mode: UserProfile["mode"];
  sector: string;
  existingIdea: string;
  budgetEur: number;
  country: { name: string; code: string };
  weeklyHours: number;
  horizon: UserProfile["horizon"];
  skills: string[];
  exclusions: string[];
}> & { defaultsUsed: string[] };

type Question = {
  key: keyof Omit<Draft, "defaultsUsed">;
  prompt: string;
  quickReplies: string[];
  applies: (d: Draft) => boolean;
  parse: (text: string) => Parsed<unknown>;
};

const QUESTIONS: Question[] = [
  {
    key: "mode",
    prompt:
      "Bonjour ! Je vais imaginer, rechercher et construire un business pour toi. Tu n'as pas besoin d'avoir d'idée. Comment veux-tu démarrer ?",
    quickReplies: ["Je n'ai pas d'idée : explore tout et choisis", "J'ai un secteur en tête", "J'ai déjà une idée à évaluer"],
    applies: () => true,
    parse: parseMode,
  },
  {
    key: "sector",
    prompt: "Quel secteur t'intéresse ? (ex. éducation, sport, finance, IA…). J'inventerai moi-même le concept dans ce secteur.",
    quickReplies: ["Éducation", "Sport & bien-être", "Services aux entreprises", "Intelligence artificielle"],
    applies: (d) => d.mode === "sector",
    parse: (t) => parseFreeText(t, 2),
  },
  {
    key: "existingIdea",
    prompt: "Décris ton idée en une ou deux phrases. Je vais l'évaluer, la challenger et proposer mieux si les preuves l'indiquent.",
    quickReplies: [],
    applies: (d) => d.mode === "existing_idea",
    parse: (t) => parseFreeText(t, 10),
  },
  {
    key: "budgetEur",
    prompt: "Quel est ton budget de départ (en euros) ?",
    quickReplies: ["500 €", "1 000 €", "5 000 €", "Je ne sais pas"],
    applies: () => true,
    parse: parseAmountEur,
  },
  {
    key: "country",
    prompt: "Dans quel pays souhaites-tu lancer ton business ?",
    quickReplies: ["France", "Belgique", "Suisse", "Canada"],
    applies: () => true,
    parse: parseCountry,
  },
  {
    key: "weeklyHours",
    prompt: "Combien d'heures peux-tu y consacrer chaque semaine ?",
    quickReplies: ["5 h", "10 h", "20 h", "Temps plein"],
    applies: () => true,
    parse: parseWeeklyHours,
  },
  {
    key: "horizon",
    prompt: "Quel horizon vises-tu ?",
    quickReplies: ["Revenus rapides", "Entreprise durable", "Forte croissance", "Je ne sais pas"],
    applies: () => true,
    parse: parseHorizon,
  },
  {
    key: "skills",
    prompt: "As-tu des compétences ou ressources utiles ? (facultatif, sépare par des virgules)",
    quickReplies: ["Passer", "Développement", "Vente", "Marketing", "Design"],
    applies: () => true,
    parse: (t) => ({ ok: true, value: parseList(t) }),
  },
  {
    key: "exclusions",
    prompt: "Y a-t-il quelque chose à éviter absolument ? (facultatif)",
    quickReplies: ["Rien de particulier", "Pas de stock physique", "Pas de démarchage client", "B2B uniquement", "B2C uniquement"],
    applies: () => true,
    parse: (t) => ({ ok: true, value: parseList(t) }),
  },
];

function buildDraft(answers: Array<{ key: string; text: string }>): Draft {
  const draft: Draft = { defaultsUsed: [] };
  for (const a of answers) {
    const q = QUESTIONS.find((x) => x.key === a.key);
    if (!q) continue;
    const r = q.parse(a.text);
    if (!r.ok) continue;
    (draft as Record<string, unknown>)[q.key] = r.value;
    draft.defaultsUsed = draft.defaultsUsed.filter((k) => k !== q.key);
    if (r.usedDefault) draft.defaultsUsed.push(q.key);
  }
  return draft;
}

function nextQuestion(d: Draft): Question | null {
  return QUESTIONS.find((q) => q.applies(d) && (d as Record<string, unknown>)[q.key] === undefined) ?? null;
}

export function draftToProfile(d: Draft): UserProfile {
  const excl = (d.exclusions ?? []).map((e) => e.toLowerCase());
  const customerPreference = excl.some((e) => /b2b uniquement/.test(e)) ? "b2b" : excl.some((e) => /b2c uniquement/.test(e)) ? "b2c" : "any";
  return UserProfileSchema.parse({
    mode: d.mode ?? "autonomous",
    country: d.country?.name ?? "France",
    countryCode: d.country?.code ?? "FR",
    budgetEur: d.budgetEur ?? 1000,
    weeklyHours: d.weeklyHours ?? 10,
    horizon: d.horizon ?? "durable",
    sector: d.mode === "sector" ? (d.sector ?? null) : null,
    existingIdea: d.mode === "existing_idea" ? (d.existingIdea ?? null) : null,
    skills: d.skills ?? [],
    exclusions: d.exclusions ?? [],
    customerPreference,
    allowPhysicalProducts: !excl.some((e) => /stock|physique/.test(e)),
    allowDirectCustomerContact: !excl.some((e) => /d[ée]marchage|contact/.test(e)),
    riskTolerance: d.horizon === "high_growth" ? "high" : d.horizon === "quick_revenue" ? "low" : "medium",
    defaultsUsed: d.defaultsUsed,
  });
}

export function summarize(p: UserProfile): string {
  const lines = [
    `Mode : ${MODE_LABEL[p.mode]}`,
    p.sector ? `Secteur imposé : ${p.sector}` : null,
    p.existingIdea ? `Ton idée : « ${p.existingIdea} »` : null,
    `Budget de départ : ${p.budgetEur.toLocaleString("fr-FR")} €`,
    `Marché : ${p.country}`,
    `Temps disponible : ${p.weeklyHours} h/semaine`,
    `Horizon : ${HORIZON_LABEL[p.horizon]}`,
    p.skills.length ? `Compétences : ${p.skills.join(", ")}` : null,
    p.exclusions.length ? `À éviter : ${p.exclusions.join(", ")}` : null,
    p.defaultsUsed.length ? `Valeurs par défaut utilisées pour : ${p.defaultsUsed.join(", ")}` : null,
  ].filter(Boolean);
  return `Voici ce que j'ai compris :\n- ${lines.join("\n- ")}\n\nJe peux maintenant chercher des opportunités réelles, inventer plusieurs concepts, les comparer et construire le business retenu. Lance la création quand tu veux.`;
}

export function firstIntakeMessage(projectId: string) {
  const q = QUESTIONS[0]!;
  return { projectId, role: "assistant" as const, questionKey: q.key, content: q.prompt };
}

export type IntakeState = {
  messages: Array<{ id: string; role: "assistant" | "user"; content: string; createdAt: Date }>;
  nextQuestion: { key: string; prompt: string; quickReplies: string[] } | null;
  complete: boolean;
  profile: UserProfile | null;
};

async function loadAnswers(projectId: string) {
  const msgs = await db().query.intakeMessages.findMany({
    where: eq(schema.intakeMessages.projectId, projectId),
    orderBy: [asc(schema.intakeMessages.createdAt), asc(schema.intakeMessages.id)],
  });
  const answers = msgs.filter((m) => m.role === "user" && m.questionKey).map((m) => ({ key: m.questionKey!, text: m.content }));
  return { msgs, answers };
}

export async function getIntakeState(projectId: string): Promise<IntakeState> {
  const { msgs, answers } = await loadAnswers(projectId);
  const draft = buildDraft(answers);
  const q = nextQuestion(draft);
  return {
    messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    nextQuestion: q ? { key: q.key, prompt: q.prompt, quickReplies: q.quickReplies } : null,
    complete: q === null,
    profile: q === null ? draftToProfile(draft) : null,
  };
}

/** Records an answer to the pending question and returns the new state. */
export async function answerIntake(projectId: string, userId: string, text: string): Promise<IntakeState> {
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new AppError("VALIDATION", "Réponse vide.");
  const { answers } = await loadAnswers(projectId);
  const draft = buildDraft(answers);
  const q = nextQuestion(draft);
  if (!q) throw new AppError("CONFLICT", "Le profil est déjà complet. Modifie-le depuis les paramètres du projet.");

  const parsed = q.parse(clean);
  await db().transaction(async (tx) => {
    await tx.insert(schema.intakeMessages).values({ projectId, role: "user", questionKey: parsed.ok ? q.key : null, content: clean });
    if (!parsed.ok) {
      await tx.insert(schema.intakeMessages).values({ projectId, role: "assistant", questionKey: q.key, content: parsed.error });
      return;
    }
    const newDraft = buildDraft([...answers, { key: q.key, text: clean }]);
    const next = nextQuestion(newDraft);
    if (next) {
      const ack = parsed.usedDefault ? "Pas de souci, j'utilise une valeur par défaut raisonnable. " : "";
      await tx.insert(schema.intakeMessages).values({ projectId, role: "assistant", questionKey: next.key, content: ack + next.prompt });
      return;
    }
    const profile = draftToProfile(newDraft);
    await saveProfile(tx, projectId, profile);
    await tx.insert(schema.intakeMessages).values({ projectId, role: "assistant", questionKey: null, content: summarize(profile) });
    await audit({ projectId, actorType: "user", actorId: userId, action: "intake.complete", data: { mode: profile.mode } }, tx);
  });
  return getIntakeState(projectId);
}

export async function saveProfile(tx: Tx, projectId: string, profile: UserProfile) {
  const existing = await tx.query.projectConstraints.findFirst({ where: eq(schema.projectConstraints.projectId, projectId) });
  const values = {
    country: profile.country,
    budgetEur: profile.budgetEur,
    weeklyHours: profile.weeklyHours,
    horizon: profile.horizon,
    sectorPreference: profile.sector,
    existingIdea: profile.existingIdea,
    skills: profile.skills,
    exclusions: profile.exclusions,
    riskTolerance: profile.riskTolerance,
    profile,
    defaultsUsed: profile.defaultsUsed,
    updatedAt: new Date(),
  };
  if (existing) {
    await tx.update(schema.projectConstraints).set({ ...values, version: existing.version + 1 }).where(eq(schema.projectConstraints.projectId, projectId));
  } else {
    await tx.insert(schema.projectConstraints).values({ projectId, ...values });
  }
  await tx.update(schema.projects).set({ mode: profile.mode, status: existing ? undefined : "ready", updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
  if (!existing) {
    await tx
      .update(schema.projectMilestones)
      .set({ status: "done", completedAt: new Date() })
      .where(and(eq(schema.projectMilestones.projectId, projectId), eq(schema.projectMilestones.phase, "intake")));
  }
}
