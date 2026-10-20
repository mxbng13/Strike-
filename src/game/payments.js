// Achats en argent réel (packs de pièces et de diamants, premium du passe de combat à 7,99 €).
//
// Architecture prévue pour les achats intégrés iOS (StoreKit) et Android (Google Play Billing), par exemple
// via une application Capacitor + un plugin d'achats intégrés :
//   1. requestPurchase(productId) ouvre la feuille de paiement du store (fournie par le « provider »).
//   2. Le store renvoie un reçu ; le reçu est VÉRIFIÉ côté serveur (jamais sur le téléphone seul).
//   3. Seulement après validation, onPurchaseVerified() crédite les pièces, une seule fois par transaction.
//
// Aucun provider n'est connecté pour l'instant : un clic sur « Acheter » ne crédite RIEN.
import { COIN_PACKS, GEM_PACKS } from '../data/shopOffers.js';
import { PASS_PREMIUM } from '../data/battlePass.js';
import { unlockPremiumVerified } from './battlePass.js';
import { save } from '../save/storage.js';

let provider = null; // { purchase(productId) -> Promise<{ transactionId, receipt }>, verify(receipt) -> Promise<boolean> }

/** À appeler au démarrage de l'application native quand le plugin de paiement est prêt. */
export function registerPaymentProvider(p) { provider = p; }
export const paymentsAvailable = () => !!provider;

export async function requestPurchase(productId) {
  if (!provider) return { ok: false, error: 'unavailable' };
  try {
    const { transactionId, receipt } = await provider.purchase(productId);
    if (!(await provider.verify(receipt))) return { ok: false, error: 'invalid' };
    return onPurchaseVerified(productId, transactionId);
  } catch (e) {
    return { ok: false, error: 'cancelled' };
  }
}

/** Crédite un achat VALIDÉ. Idempotent : une transaction déjà créditée ne l'est pas une deuxième fois. */
export function onPurchaseVerified(productId, transactionId) {
  if (productId === PASS_PREMIUM.productId) {
    if (!transactionId) return { ok: false, error: 'unknown' };
    if ((save.get().purchases ?? []).includes(transactionId)) return { ok: false, error: 'duplicate' };
    const r = unlockPremiumVerified(transactionId);
    if (r.ok) save.update((st) => ({ purchases: [...(st.purchases ?? []), transactionId] }));
    return r.ok ? { ok: true, premium: true } : r;
  }
  const coinPack = COIN_PACKS.find((p) => p.productId === productId);
  const gemPack = GEM_PACKS.find((p) => p.productId === productId);
  const s = save.get();
  if ((!coinPack && !gemPack) || !transactionId) return { ok: false, error: 'unknown' };
  if ((s.purchases ?? []).includes(transactionId)) return { ok: false, error: 'duplicate' };
  const coins = coinPack?.coins ?? 0, gems = gemPack?.gems ?? 0;
  save.update((st) => ({ coins: st.coins + coins, gems: st.gems + gems, purchases: [...(st.purchases ?? []), transactionId] }));
  return { ok: true, coins, gems };
}
