import { z } from "zod";
import { RADII_KM } from "./geo";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ message: `${label} requis` })
    .trim()
    .min(min, `${label} : ${min} caractères minimum`)
    .max(max, `${label} : ${max} caractères maximum`);

export const passwordSchema = z
  .string()
  .min(10, "Mot de passe : 10 caractères minimum")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Le mot de passe doit contenir des lettres et des chiffres");

export const registerSchema = z.object({
  firstName: trimmed(1, 40, "Prénom"),
  lastName: trimmed(1, 60, "Nom"),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
  password: passwordSchema,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide"),
  acceptTerms: z.literal(true, { message: "Vous devez accepter les conditions générales" }),
  referralCode: z.string().trim().toUpperCase().max(12).optional().or(z.literal("")),
  website: z.string().max(0).optional(), // pot de miel anti-robots
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis").max(200),
});

export const locationSchema = z.object({
  lat: z.number().min(41).max(51.5, "Position hors de France"),
  lng: z.number().min(-5.5).max(10, "Position hors de France"),
  label: trimmed(2, 120, "Localisation"),
  postcode: z.string().trim().max(10).optional().nullable(),
});

export const radiusSchema = z.coerce.number().refine((r) => (RADII_KM as readonly number[]).includes(r), "Rayon invalide");

export const createServiceSchema = z
  .object({
    title: trimmed(5, 90, "Titre"),
    categoryId: z.number().int().positive("Choisissez une catégorie"),
    description: trimmed(10, 3000, "Description"),
    imageKeys: z.array(z.string().max(80)).max(6).default([]),
    location: locationSchema,
    addressPrivate: z.string().trim().max(200).optional().nullable(),
    searchRadiusKm: radiusSchema,
    timingType: z.enum(["immediate", "today", "tomorrow", "scheduled", "recurring"]),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
    durationMinutes: z.number({ message: "Indiquez le temps nécessaire (estimation ou horaire précis)" }).int().min(5, "Durée trop courte").max(24 * 60 * 14),
    durationExact: z.boolean().default(false),
    pricingType: z.enum(["fixed", "negotiable", "offer"]),
    budgetCents: z.number().int().min(0).max(1_000_000).optional().nullable(),
    /** Montant des achats à avancer par l'intervenant (bloqué dans la tirelire, jamais commissionné). */
    purchaseCents: z.number().int().min(100, "Montant des achats : 1 € minimum").max(50_000, "Montant des achats : 500 € maximum").optional().nullable(),
    purchaseNote: z.string().trim().max(300).optional().nullable(),
    peopleNeeded: z.number().int().min(1).max(20).default(1),
    urgency: z.enum(["normal", "high", "urgent"]).default("normal"),
    skillsRequired: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
    recurrence: z
      .object({ freq: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().min(1).max(12).default(1), until: z.string().optional().nullable() })
      .optional()
      .nullable(),
    visibility: z.enum(["public", "invite", "group"]).default("public"),
    groupId: z.string().uuid().optional().nullable(),
    isGroupBuy: z.boolean().default(false),
    parentServiceId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.pricingType !== "offer" && (v.budgetCents == null || v.budgetCents <= 0))
      ctx.addIssue({ code: "custom", path: ["budgetCents"], message: "Indiquez un budget (ou choisissez « Faire une offre »)" });
    if ((v.timingType === "scheduled" || v.timingType === "recurring") && !v.startsAt)
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Indiquez la date et l'heure souhaitées" });
    if (v.timingType === "recurring" && !v.recurrence) ctx.addIssue({ code: "custom", path: ["recurrence"], message: "Indiquez la fréquence" });
    if (v.startsAt && new Date(v.startsAt).getTime() < Date.now() - 15 * 60_000)
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: "La date choisie est déjà passée" });
    if (v.purchaseCents && v.pricingType === "offer" && !v.budgetCents)
      ctx.addIssue({ code: "custom", path: ["budgetCents"], message: "Avec des achats à avancer, indiquez la rémunération proposée" });
    if (v.durationExact && v.timingType === "immediate")
      ctx.addIssue({ code: "custom", path: ["durationExact"], message: "Pour une demande immédiate, indiquez une durée estimée" });
    if (v.visibility === "group" && !v.groupId) ctx.addIssue({ code: "custom", path: ["groupId"], message: "Choisissez un groupe" });
  });
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const applySchema = z.object({
  message: z.string().trim().max(1000).default(""),
  experience: z.string().trim().max(600).default(""),
  acceptsBudget: z.boolean().default(false),
  proposedPriceCents: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

export const profileSchema = z.object({
  firstName: trimmed(1, 40, "Prénom").optional(),
  lastName: trimmed(1, 60, "Nom").optional(),
  bio: z.string().trim().max(800).optional(),
  avatarKey: z.string().max(80).nullable().optional(),
  portfolio: z.array(z.object({ key: z.string().max(80), caption: z.string().max(120).optional() })).max(12).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().max(4000).default(""),
  kind: z.enum(["text", "image", "video", "file", "audio", "location"]).default("text"),
  replyToId: z.string().uuid().optional().nullable(),
  attachmentKeys: z.array(z.string().max(80)).max(6).default([]),
  durationMs: z.number().int().max(10 * 60_000).optional(),
  location: z.object({ lat: z.number(), lng: z.number(), minutes: z.number().int().min(5).max(240), label: z.string().max(120).optional() }).optional(),
  clientId: z.string().max(64).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1500).default(""),
  criteria: z
    .object({
      punctuality: z.number().int().min(1).max(5),
      communication: z.number().int().min(1).max(5),
      seriousness: z.number().int().min(1).max(5),
      quality: z.number().int().min(1).max(5),
      commitment: z.number().int().min(1).max(5),
    })
    .partial()
    .default({}),
});

export const reportSchema = z.object({
  targetType: z.enum(["user", "service", "message", "review", "conversation", "post"]),
  targetId: z.string().uuid(),
  reason: z.enum(["fraud", "inappropriate", "harassment", "dangerous", "illegal", "fake_profile", "no_show", "spam", "other"]),
  details: z.string().trim().max(2000).default(""),
});

export const REPORT_REASONS: Record<string, string> = {
  fraud: "Fraude ou arnaque",
  inappropriate: "Contenu inapproprié",
  harassment: "Harcèlement",
  dangerous: "Comportement dangereux",
  illegal: "Activité illégale",
  fake_profile: "Faux profil",
  no_show: "Absence / non-respect de l'engagement",
  spam: "Spam",
  other: "Autre",
};
