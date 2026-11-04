/**
 * Passerelles de paiement marketplace.
 *
 * Principe (conforme au modèle Stripe Connect « destination charges ») :
 *  1. À la confirmation de la mission, le demandeur AUTORISE le paiement (empreinte bancaire, capture manuelle).
 *  2. À la confirmation de fin de mission, le paiement est CAPTURÉ : Stripe verse directement la part de
 *     l'intervenant sur son compte connecté et prélève la commission ENTOUR (application_fee_amount).
 *  3. En cas d'annulation avant capture : l'autorisation est levée. Après capture : remboursement.
 * ENTOUR ne détient jamais les fonds sur un compte propre : ils transitent par le prestataire agréé.
 *
 * Sans STRIPE_SECRET_KEY, la passerelle « simulation » est utilisée : aucun argent réel ne circule et
 * toutes les opérations sont marquées comme simulées en base (provider = 'simulation') et dans l'interface.
 */
import "server-only";
import crypto from "node:crypto";
import Stripe from "stripe";

export type AuthorizeInput = {
  paymentId: string;
  amountCents: number; // montant total débité au demandeur
  applicationFeeCents: number;
  destinationAccount: string | null;
  description: string;
  payerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export type AuthorizeResult = { externalId: string; redirectUrl: string | null; status: "requires_payment" | "authorized" };

export interface PaymentGateway {
  name: "stripe" | "simulation";
  isLive: boolean;
  startAuthorization(input: AuthorizeInput): Promise<AuthorizeResult>;
  /** Capture totale, ou partielle (`amountCents`) avec une commission `feeCents` (ex. 0 pour un simple remboursement d'achats). */
  capture(externalId: string, opts?: { amountCents?: number; feeCents?: number }): Promise<void>;
  cancel(externalId: string): Promise<void>;
  refund(externalId: string, amountCents: number): Promise<void>;
  createPayoutAccount(user: { id: string; email: string }, returnUrl: string): Promise<{ externalId: string; onboardingUrl: string | null }>;
  payoutAccountStatus(externalId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>;
}

class SimulationGateway implements PaymentGateway {
  name = "simulation" as const;
  isLive = false;
  async startAuthorization(input: AuthorizeInput): Promise<AuthorizeResult> {
    // L'autorisation simulée est confirmée par une action explicite de l'utilisateur dans l'interface.
    return { externalId: `sim_pi_${crypto.randomUUID()}`, redirectUrl: null, status: "requires_payment" };
  }
  async capture() {}
  async cancel() {}
  async refund() {}
  async createPayoutAccount(user: { id: string }) {
    return { externalId: `sim_acct_${user.id.slice(0, 8)}`, onboardingUrl: null };
  }
  async payoutAccountStatus() {
    return { chargesEnabled: true, payoutsEnabled: true };
  }
}

class StripeGateway implements PaymentGateway {
  name = "stripe" as const;
  isLive: boolean;
  private stripe: Stripe;
  constructor(key: string) {
    this.stripe = new Stripe(key);
    this.isLive = key.startsWith("sk_live_");
  }
  async startAuthorization(input: AuthorizeInput): Promise<AuthorizeResult> {
    if (!input.destinationAccount) throw new Error("L'intervenant n'a pas encore activé ses versements");
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.payerEmail,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: input.amountCents, product_data: { name: input.description.slice(0, 120) } } }],
      payment_intent_data: {
        capture_method: "manual",
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.destinationAccount },
        on_behalf_of: input.destinationAccount,
        metadata: { entour_payment_id: input.paymentId },
      },
      metadata: { entour_payment_id: input.paymentId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { externalId: session.id, redirectUrl: session.url, status: "requires_payment" };
  }
  private async intentId(externalId: string) {
    if (externalId.startsWith("pi_")) return externalId;
    const s = await this.stripe.checkout.sessions.retrieve(externalId);
    return typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? "";
  }
  async capture(externalId: string, opts: { amountCents?: number; feeCents?: number } = {}) {
    await this.stripe.paymentIntents.capture(await this.intentId(externalId), opts.amountCents != null ? { amount_to_capture: opts.amountCents, application_fee_amount: opts.feeCents ?? 0 } : {});
  }
  async cancel(externalId: string) {
    const id = await this.intentId(externalId);
    if (id) await this.stripe.paymentIntents.cancel(id);
    else await this.stripe.checkout.sessions.expire(externalId).catch(() => {});
  }
  async refund(externalId: string, amountCents: number) {
    await this.stripe.refunds.create({ payment_intent: await this.intentId(externalId), amount: amountCents, reverse_transfer: true, refund_application_fee: true });
  }
  async createPayoutAccount(user: { id: string; email: string }, returnUrl: string) {
    const account = await this.stripe.accounts.create({
      type: "express",
      country: "FR",
      email: user.email,
      business_type: "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { entour_user_id: user.id },
    });
    const link = await this.stripe.accountLinks.create({ account: account.id, refresh_url: returnUrl, return_url: returnUrl, type: "account_onboarding" });
    return { externalId: account.id, onboardingUrl: link.url };
  }
  async payoutAccountStatus(externalId: string) {
    const a = await this.stripe.accounts.retrieve(externalId);
    return { chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled };
  }
  webhookEvent(body: string, signature: string) {
    return this.stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  }
}

let gateway: PaymentGateway | null = null;
export function getGateway(): PaymentGateway {
  if (!gateway) gateway = process.env.STRIPE_SECRET_KEY ? new StripeGateway(process.env.STRIPE_SECRET_KEY) : new SimulationGateway();
  return gateway;
}
export function getStripeGateway(): StripeGateway | null {
  const g = getGateway();
  return g instanceof StripeGateway ? g : null;
}
