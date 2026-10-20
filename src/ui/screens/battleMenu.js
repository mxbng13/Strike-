// Écran COMBAT : une seule arène. On choisit le mode (Duel 1 contre 1 ou Duo 2 contre 2) et le nombre
// d'éliminations pour gagner (3, 5 ou 10), puis JOUER. Le choix est enregistré dans la sauvegarde
// (battlePrefs) et transmis à l'arène au lancement.
import { DEFAULT_BATTLE_PREFS } from '../../data/battleModes.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { showPanel, closePanel } from '../panel.js';
import { openArena, ARENA_FORMATS, KILL_TARGETS, DEFAULT_KILL_TARGET } from '../../arena/arenaGame.js';
import { ARENA_MAPS } from '../../arena/maps.js';
import { arenaMapPreview, cachedArenaMapPreview } from '../../render/portraits.js';

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
    root.innerHTML = `
      <section class="bm-arena" style="--mc:${map.color}">
        <span class="bm-thumb ${cachedArenaMapPreview(map.id) ? 'ready' : ''}"><img data-apreview="${map.id}" ${cachedArenaMapPreview(map.id) ? `src="${cachedArenaMapPreview(map.id)}"` : ''} alt="" /></span>
        <div class="bm-arena-txt"><b>Arène de combat</b><small>${map.desc}</small><span class="bm-info">${ICONS.trophy}<span>${rec.wins} victoire${rec.wins > 1 ? 's' : ''} · ${rec.losses} défaite${rec.losses > 1 ? 's' : ''}</span></span></div>
      </section>

      <p class="bm-opt-label">Mode de jeu</p>
      <div class="bm-formats" role="radiogroup" aria-label="Mode de jeu">${Object.values(ARENA_FORMATS).map((f) => `
        <button class="bm-format ${p.arenaFormat === f.id ? 'sel' : ''}" data-aformat="${f.id}" role="radio" aria-checked="${p.arenaFormat === f.id}" style="--mc:${MODE_INFO[f.id].color}">
          <span class="bm-ic">${ICONS[MODE_INFO[f.id].icon]}</span>
          <b>${f.size === 1 ? '1 contre 1' : '2 contre 2'}</b><small>${f.name}</small>
          <span class="bm-check">${ICONS.check}</span>
        </button>`).join('')}
      </div>
      <p class="bm-mode-desc">${MODE_INFO[p.arenaFormat].desc}</p>

      <p class="bm-opt-label">Nombre d’éliminations pour gagner</p>
      <div class="bm-kills" role="radiogroup" aria-label="Nombre d’éliminations pour gagner">${KILL_TARGETS.map((k) => `
        <button class="bm-kill ${p.arenaKills === k ? 'sel' : ''}" data-kills="${k}" role="radio" aria-checked="${p.arenaKills === k}"><b>${k}</b><small>élim.</small></button>`).join('')}
      </div>
      <p class="bm-mode-desc">${p.arenaFormat === 'duo' ? `La première équipe à ${p.arenaKills} éliminations gagne.` : `Le premier à ${p.arenaKills} éliminations gagne.`} Les combattants éliminés réapparaissent dans leur camp après 3 s.</p>

      <div class="bm-footer">
        <div class="bm-sum" style="--mc:${MODE_INFO[p.arenaFormat].color}"><b>${ARENA_FORMATS[p.arenaFormat].name} · ${p.arenaKills} éliminations</b><span>Arène de combat</span></div>
        <button class="r-btn bm-play" data-play>${ICONS.battle}JOUER</button>
      </div>`;
    const img = root.querySelector('[data-apreview]:not([src])');
    if (img) requestAnimationFrame(() => { if (!img.isConnected) return; img.src = arenaMapPreview(map.id); img.closest('.bm-thumb').classList.add('ready'); });
  }

  root.addEventListener('click', (e) => {
    const af = e.target.closest('[data-aformat]');
    if (af) { setPrefs({ arenaFormat: af.dataset.aformat }); navigator.vibrate?.(8); render(); return; }
    const k = e.target.closest('[data-kills]');
    if (k) { setPrefs({ arenaKills: Number(k.dataset.kills) }); navigator.vibrate?.(8); render(); return; }
    if (e.target.closest('[data-play]')) {
      const p = prefsOf();
      closePanel(true);
      openArena({ format: p.arenaFormat, kills: p.arenaKills });
    }
  });

  render();
  showPanel({ title: 'COMBAT', subtitle: 'Arène · 1 contre 1 ou 2 contre 2', icon: ICONS.battle, accent: '#ff3d7f', content: root });
}
