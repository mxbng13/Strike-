// Récompenses de connexion : état du jour et récupération (une seule fois par jour).
import { save } from '../save/storage.js';
import { DAILY_REWARDS } from '../data/daily.js';
import { dayKey, applyPassReward } from './battlePass.js';

const prevDay = (t) => dayKey(t - 86400000);

/** { day: index 0-6 du jour à récupérer (ou récupéré aujourd'hui), claimable, streakBroken } */
export function dailyStatus(t = Date.now(), s = save.get()) {
  const d = s.daily ?? { next: 0, last: null };
  const today = dayKey(t);
  if (d.last === today) return { day: (d.next + DAILY_REWARDS.length - 1) % DAILY_REWARDS.length, claimable: false, claimedToday: true };
  const continues = d.last === prevDay(t);
  return { day: continues ? d.next : 0, claimable: true, claimedToday: false, streakBroken: !!d.last && !continues };
}

export function claimDaily(t = Date.now()) {
  const st = dailyStatus(t);
  if (!st.claimable) return { ok: false };
  const reward = DAILY_REWARDS[st.day];
  save.update((s) => ({ ...applyPassReward(s, reward), daily: { next: (st.day + 1) % DAILY_REWARDS.length, last: dayKey(t) } }));
  return { ok: true, day: st.day, reward };
}
