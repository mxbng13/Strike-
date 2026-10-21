// Écran COMBAT : une seule arène. On choisit le mode (Duel 1 contre 1 ou Duo 2 contre 2) et le nombre
// d'éliminations pour gagner (3, 5 ou 10), puis JOUER. Le choix est enregistré dans la sauvegarde
// (battlePrefs) et transmis à l'arène au lancement.
import { DEFAULT_BATTLE_PREFS } from '../../data/battleModes.js';
import { save } from '../../save/storage.js';
import { ICONS, friendsArt } from '../icons.js';
import { openFriendMatch } from './friendMatch.js';
import { showPanel, closePanel } from '../panel.js';
import { openArena, ARENA_FORMATS, KILL_TARGETS, DEFAULT_KILL_TARGET } from '../../arena/arenaGame.js';
import { ARENA_MAPS } from '../../arena/maps.js';
import { arenaMapPreview, cachedArenaMapPreview, getPortrait } from '../../render/portraits.js';
import { getCharacter } from '../../data/characters.js';
import { RARITIES } from '../../data/rarities.js';
import { appearanceFor } from '../../game/appearance.js';
import { strikerTrophies } from '../../game/trophies.js';
import { openCollection } from './collection.js';

const prefsOf = (s = save.get()) => {
  const p = { ...DEFAULT_BATTLE_PREFS, ...(s.battlePrefs ?? {}) };
  if (!ARENA_FORMATS[p.arenaFormat]) p.arenaFormat = DEFAULT_BATTLE_PREFS.arenaFormat;
  if (!KILL_TARGETS.includes(p.arenaKills)) p.arenaKills = DEFAULT_KILL_TARGET;
  return p;
};
const setPrefs = (patch) => save.update((s) => ({ battlePrefs: { ...(s.battlePrefs ?? {}), ...prefsOf(s), ...patch } }));

const MODE_INFO = {
  duel: { color: '#5cffc4', icon: 'gun', desc: 'Toi contre un adversaire. Chaque élimination te rapporte un point.' },
  duo: { color: '#5cc8ff', icon: 'friends', desc: 'Toi et un allié contre deux adversaires. Les éliminations de l’équipe s’additionnent.' },
};

export function openBattleMenu() {
  const root = document.createElement('div');
  root.className = 'bm-screen';
  const map = ARENA_MAPS.map1;

  function render() {
    const s = save.get(), p = prefsOf(s);
    const rec = s.arenaRecord ?? { wins: 0, losses: 0 };
    const me = getCharacter(s.selected), look = appearanceFor(s.selected, s);
    const myImg = getPortrait(me, look.rank);
    const foe = `<span class="bm-foe">${ICONS.striker}</span>`;
    const mine = `<span class="bm-mine"><img src="${myImg}" alt="" /></span>`;
    const ally = `<span class="bm-mine ally">${ICONS.striker}</span>`;
    const preview = cachedArenaMapPreview(map.id);
    root.innerHTML = `
      <section class="bm-hero" style="--mc:${map.color}">
        <img class="bm-hero-img ${preview ? 'ready' : ''}" data-apreview="${map.id}" ${preview ? `src="${preview}"` : ''} alt="" />
        <span class="bm-hero-name">ARÈNE DE COMBAT</span>
        <span class="bm-rec"><span class="w">${rec.wins}<small>victoire${rec.wins > 1 ? 's' : ''}</small></span><span class="l">${rec.losses}<small>défaite${rec.losses > 1 ? 's' : ''}</small></span></span>
      </section>

      <section class="bm-me" style="--rarity:${RARITIES[me.rarity].color}">
        <span class="bm-me-img"><img src="${myImg}" alt="" /></span>
        <div class="bm-me-txt"><small>Ton Striker</small><b>${me.name}</b><span>${ICONS.trophy}${strikerTrophies(me.id, s)}</span></div>
        <button class="bm-change" data-change>CHANGER</button>
      </section>

      <div class="sh-banner bm-banner"><span class="sh-ic">${ICONS.battle}</span><h4>Mode</h4></div>
      <div class="bm-modes2" role="radiogroup" aria-label="Mode de jeu">${Object.values(ARENA_FORMATS).map((f) => `
        <button class="bm-mode2 ${p.arenaFormat === f.id ? 'sel' : ''}" data-aformat="${f.id}" role="radio" aria-checked="${p.arenaFormat === f.id}" style="--mc:${MODE_INFO[f.id].color}">
          <span class="bm-vs">${f.size === 1 ? `${mine}<i>VS</i>${foe}` : `<span class="bm-team">${mine}${ally}</span><i>VS</i><span class="bm-team">${foe}${foe}</span>`}</span>
          <b>${f.size === 1 ? '1 CONTRE 1' : '2 CONTRE 2'}</b><small>${f.name}</small>
          <span class="bm-check">${ICONS.check}</span>
        </button>`).join('')}
      </div>

      <div class="sh-banner bm-banner"><span class="sh-ic">${ICONS.trophy}</span><h4>Victoire à</h4></div>
      <div class="bm-kills2" role="radiogroup" aria-label="Nombre d’éliminations pour gagner">${KILL_TARGETS.map((k) => `
        <button class="bm-kill2 ${p.arenaKills === k ? 'sel' : ''}" data-kills="${k}" role="radio" aria-checked="${p.arenaKills === k}"><b>${k}</b><small>éliminations</small><em>${k === 3 ? 'Rapide' : k === 5 ? 'Classique' : 'Long'}</em></button>`).join('')}
      </div>
      <p class="bm-rule">${p.arenaFormat === 'duo' ? `La première équipe à ${p.arenaKills} éliminations gagne.` : `Le premier à ${p.arenaKills} éliminations gagne.`} Réapparition après 3 s.</p>

      <div class="sh-banner bm-banner"><span class="sh-ic">${ICONS.friends}</span><h4>Avec un ami</h4></div>
      <button class="bm-friend" data-friend>
        <span class="bmf-art">${friendsArt()}</span>
        <span class="bmf-txt"><b>JOUER AVEC UN AMI</b><small>Envoie ton lien : ton ami te rejoint en ligne pour un duel</small></span>
        <span class="bmf-go">${ICONS.share}</span>
      </button>

      <div class="bm-footer2">
        <button class="bm-go" data-play><span class="bm-go-ic">${ICONS.battle}</span><span><b>COMBAT</b><small>${ARENA_FORMATS[p.arenaFormat].name} · ${p.arenaKills} élim.</small></span></button>
      </div>`;
    const img = root.querySelector('[data-apreview]:not([src])');
    if (img) requestAnimationFrame(() => { if (!img.isConnected) return; img.src = arenaMapPreview(map.id); img.classList.add('ready'); });
  }

  root.addEventListener('click', (e) => {
    const af = e.target.closest('[data-aformat]');
    if (af) { setPrefs({ arenaFormat: af.dataset.aformat }); navigator.vibrate?.(8); render(); return; }
    const k = e.target.closest('[data-kills]');
    if (k) { setPrefs({ arenaKills: Number(k.dataset.kills) }); navigator.vibrate?.(8); render(); return; }
    if (e.target.closest('[data-friend]')) { closePanel(true); openFriendMatch(); return; }
    if (e.target.closest('[data-change]')) { closePanel(true); openCollection(true, 0); return; }
    if (e.target.closest('[data-play]')) {
      const p = prefsOf();
      closePanel(true);
      openArena({ format: p.arenaFormat, kills: p.arenaKills });
    }
  });

  render();
  showPanel({ title: 'COMBAT', icon: ICONS.battle, accent: '#ff3d7f', content: root });
}
