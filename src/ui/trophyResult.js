// Bloc « trophées » des écrans de fin de combat : trophées gagnés/perdus avec le Striker, son total et son
// palier (Basique / Or / Diamant), avec l'annonce d'un changement de palier.
import { ICONS } from './icons.js';
import { tierOfTrophies, nextTier } from '../data/ranks.js';
import { rankEmblem } from './rankEmblem.js';
import { POINTS_PER_LEVEL } from '../data/ranked.js';

export function trophyResultHtml(tr, strikerName) {
  if (!tr?.striker) return '';
  const { before, after } = tr.striker;
  const d = after - before;
  const rk = tierOfTrophies(after), was = tierOfTrophies(before), nx = nextTier(after);
  const changed = rk.id !== was.id;
  // une seule ligne compacte (le classement du joueur est affiché juste au-dessus) ; un changement de palier est mis en avant
  return `
    <div class="r-trophies ${d > 0 ? 'up' : d < 0 ? 'down' : ''} ${changed ? 'tier-changed' : ''}" style="--rk:${rk.color}"><span class="pi">${ICONS.trophy}</span><b>${d > 0 ? '+' : ''}${d}</b>
      <span class="rt-txt"><small>Trophées de ${strikerName} : ${after}</small><small class="rt-tier">${changed ? (d > 0 ? `Nouveau palier : ${rk.label} !` : `Retour au palier ${rk.label}`) : `Palier ${rk.label}${nx ? ` · ${nx.label} à ${nx.minTrophies}` : ''}`}</small></span></div>`;
}

// Bloc « classement » de l'écran de fin : points de classement gagnés / perdus, rang du joueur (emblème)
// et barre du niveau en cours, animée de l'ancienne à la nouvelle valeur ; annonce d'une promotion.

export function rankedResultHtml(rk) {
  if (!rk || rk.duplicate) return '';
  const { delta, after, rankAfter: r, promoted, demoted } = rk;
  const pctOf = (x) => (rankOfLevel(x, r) * 100).toFixed(1);
  const from = promoted ? 0 : demoted ? 100 : pctOf(rk.before), to = r.isMax ? 100 : pctOf(after);
  const sub = r.isMax ? `${r.progress.toLocaleString('fr-FR')} trophées au-delà de Zénith` : `${r.progress.toLocaleString('fr-FR')} / ${POINTS_PER_LEVEL.toLocaleString('fr-FR')} trophées`;
  return `
    <div class="r-ranked ${promoted ? 'promoted' : ''} ${demoted ? 'demoted' : ''} ${delta < 0 ? 'down' : ''}" style="--rk:${r.tier.main};--rk-l:${r.tier.light}">
      <span class="rr-emb">${rankEmblem(r.tierIndex, r.level, { size: 46 })}</span>
      <div class="rr-main">
        <small>${promoted ? 'PROMOTION !' : demoted ? 'Niveau perdu' : 'Classement'}</small>
        <b>${r.label}</b>
        <span class="rr-bar"><i style="--from:${from}%;--to:${to}%"></i></span>
        <small class="rr-sub">${sub}</small>
      </div>
      <b class="rr-delta">${delta > 0 ? '+' : ''}${delta}<small class="rr-tro">${ICONS.trophy}</small></b>
    </div>`;
}
/** Part (0 à 1) du niveau `r` remplie avec `points` (bornée). */
function rankOfLevel(points, r) {
  if (r.isMax) return 1;
  return Math.max(0, Math.min(1, (points - r.levelStart) / POINTS_PER_LEVEL));
}
