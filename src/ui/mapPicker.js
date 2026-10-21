// Choix de la carte de l'arène (écran COMBAT et salle du combat amical) : vignettes vues du dessus.
import { ARENA_MAP_LIST } from '../arena/maps.js';
import { arenaMapPreview, cachedArenaMapPreview } from '../render/portraits.js';
import { ICONS } from './icons.js';

/** Grille des cartes ; `attr` : nom de l'attribut de clic (data-…) ; `locked` : lecture seule (invité). */
export function mapPickerHtml(selected, attr = 'amap', locked = false) {
  return `<div class="mp-grid" role="radiogroup" aria-label="Carte">${ARENA_MAP_LIST.map((m) => {
    const img = cachedArenaMapPreview(m.id);
    return `
    <button class="mp-card ${selected === m.id ? 'sel' : ''}" data-${attr}="${m.id}" role="radio" aria-checked="${selected === m.id}" style="--mc:${m.color}" ${locked ? 'disabled' : ''}>
      <img data-mpreview="${m.id}" ${img ? `src="${img}" class="ready"` : ''} alt="" />
      <b>${m.title}</b>
      <span class="mp-check">${ICONS.check}</span>
    </button>`;
  }).join('')}</div>`;
}
/** Dessine les vignettes manquantes, une par image affichée (pour ne pas bloquer l'écran). */
export function fillMapPreviews(root) {
  const next = () => {
    const img = root.querySelector('img[data-mpreview]:not([src]), img[data-apreview]:not([src])');
    if (!img || !img.isConnected) return;
    img.src = arenaMapPreview(img.dataset.mpreview ?? img.dataset.apreview);
    img.classList.add('ready');
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}
