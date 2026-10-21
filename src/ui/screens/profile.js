// PROFIL : photo, nom (modifiable), classement compétitif, trophées des Strikers, passe, combats…
import { AVATARS, NAME_RULES } from '../../data/profile.js';
import { CHARACTERS } from '../../data/characters.js';
import { rankOf, nextRankStep, pointsDelta, RANKED_RULES } from '../../data/ranked.js';
import { setPlayerName, setAvatar, setAvatarPhoto, validateName } from '../../game/profile.js';
import { rankedPoints, rankedBest } from '../../game/ranked.js';
import { TROPHY_RULES } from '../../data/trophies.js';
import { rankEmblem } from '../rankEmblem.js';
import { passLevel } from '../../game/battlePass.js';
import { playerId } from '../../game/social.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { avatarSvg } from '../avatar.js';
import { showPanel, toast } from '../panel.js';
import { accountCard } from '../accountCard.js';

export function openProfile() {
  const el = document.createElement('div');
  el.className = 'profile-page';
  let mode = null; // null | 'name' | 'avatar'

  function render() {
    const s = save.get();
    const pts = rankedPoints(s), r = rankOf(pts), nx = nextRankStep(pts), bestR = rankOf(rankedBest(s));
    const strikerTotal = Object.values(s.strikerTrophies ?? {}).reduce((a, b) => a + b, 0);
    const fmt = (n) => n.toLocaleString('fr-FR');
    const owned = CHARACTERS.filter((c) => s.owned.includes(c.id)).length;
    el.innerHTML = `
      <section class="pf-head">
        <button class="pf-avatar" data-edit-avatar aria-label="Modifier la photo">${avatarSvg(s.avatar)}<span class="pf-edit">${ICONS.edit}</span></button>
        <div class="pf-id">
          <h3>${escapeHtml(s.playerName)}</h3>
          <span class="pf-tag">${playerId()}</span>
          <div class="pf-actions">
            <button class="f-btn" data-edit-name>${ICONS.edit} Nom</button>
            <button class="f-btn" data-edit-avatar>${ICONS.user} Photo</button>
          </div>
        </div>
      </section>

      ${mode === 'name' ? `
      <section class="pf-section pf-form">
        <label for="pf-name">Nouveau nom (${NAME_RULES.min} à ${NAME_RULES.max} caractères)</label>
        <input id="pf-name" type="text" maxlength="${NAME_RULES.max + 4}" value="${escapeHtml(s.playerName)}" autocomplete="off" />
        <p class="pf-error" hidden></p>
        <div class="r-btns"><button class="r-btn ghost" data-cancel>ANNULER</button><button class="r-btn" data-confirm-name>CONFIRMER</button></div>
      </section>` : ''}

      ${mode === 'avatar' ? `
      <section class="pf-section">
        <h4 class="f-sec">Choisis ta photo</h4>
        <div class="pf-photo">
          <label class="pf-photo-btn" for="pf-photo-input">${ICONS.camera}<span><b>Choisir dans ma photothèque</b><small>Ta photo est recadrée en carré et reste sur cet appareil.</small></span></label>
          <input id="pf-photo-input" type="file" accept="image/*" hidden />
        </div>
        <div class="av-grid">${s.avatarPhoto ? `<button class="av-pick ${s.avatar === 'photo' ? 'sel' : ''}" data-avatar="photo" aria-label="Ma photo">${avatarSvg('photo')}<span class="av-tag">Ma photo</span></button>` : ''}${AVATARS.map((a) => `<button class="av-pick ${s.avatar === a.id ? 'sel' : ''}" data-avatar="${a.id}" aria-label="${a.name}">${avatarSvg(a.id)}</button>`).join('')}</div>
        <div class="r-btns"><button class="r-btn ghost" data-cancel>ANNULER</button><button class="r-btn" data-confirm-avatar>CONFIRMER</button></div>
      </section>` : ''}

      <section class="pf-section pf-stats">
        <h4 class="f-sec">Classement compétitif</h4>
        <div class="pf-rank" style="--rk:${r.tier.main};--rk-l:${r.tier.light}">
          <span class="pf-rank-emb">${rankEmblem(r.tierIndex, r.level, { size: 64 })}</span>
          <div><b>${r.label}</b><small>${fmt(pts)} trophées</small>
            <span class="rkc-bar"><i style="width:${r.isMax ? 100 : (r.progress / 1000) * 100}%"></i></span>
            <small>${nx ? `${nx.label} à ${fmt(nx.points)} trophées (encore ${fmt(nx.points - pts)})` : 'Rang ultime atteint'}</small></div>
        </div>
        <div class="st-grid">
          <div class="st-tile"><b>${fmt(rankedBest(s))}</b><small>Record de trophées · ${bestR.label}</small></div>
          <div class="st-tile trophy"><span class="st-ico">${ICONS.trophy}</span><b>${fmt(strikerTotal)}</b><small>Trophées des Strikers (total)</small></div>
          <div class="st-tile"><b>${s.pass ? passLevel(s.pass.xp).tier : 0}</b><small>Palier du passe</small></div>
          <div class="st-tile"><b>+${pointsDelta(pts, 'win')} / −${-pointsDelta(pts, 'loss')}</b><small>Trophées par victoire / défaite à ce rang</small></div>
        </div>
        <p class="pf-note">Chaque rang (Ruine, Onde, Flux, Nova, Vortex, Pulse, Apex, Titan, Nexus) compte 3 niveaux de 1 000 trophées ; Zénith est le rang ultime.${RANKED_RULES.rankFloor ? ' Une défaite ne fait jamais quitter le rang atteint.' : ''}${RANKED_RULES.fleeAsLoss ? ' Abandonner un combat compte comme une défaite.' : ''} Chaque Striker garde aussi ses propres trophées (victoire +${TROPHY_RULES.win}, défaite ${TROPHY_RULES.loss}), qui fixent son palier Or / Diamant.</p>
      </section>
      <section class="pf-section pf-stats">
        <h4 class="f-sec">Combats et collection</h4>
        <div class="st-grid">
          <div class="st-tile win"><b>${s.arenaRecord?.wins ?? 0}</b><small>Victoires en arène</small></div>
          <div class="st-tile lose"><b>${s.arenaRecord?.losses ?? 0}</b><small>Défaites en arène</small></div>
          <div class="st-tile"><b>${owned} / ${CHARACTERS.length}</b><small>Strikers possédés</small></div>
          <div class="st-tile"><b>${(s.characterSkinsOwned?.length ?? 0) + (s.weaponSkinsOwned?.length ?? 0)}</b><small>Skins débloqués</small></div>
        </div>
      </section>`;
    if (mode === 'name') {
      const input = el.querySelector('#pf-name');
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('input', () => {
        const v = validateName(input.value);
        const err = el.querySelector('.pf-error');
        err.hidden = v.ok || !input.value; err.textContent = v.ok ? '' : v.error;
      });
      setTimeout(() => input.focus(), 50);
    }
    if (mode === 'avatar') {
      el.querySelector('#pf-photo-input').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
          const res = setAvatarPhoto(await squarePhoto(file));
          if (!res.ok) throw new Error('size');
          toast('Photo de profil mise à jour', '#5cffc4', 'ok');
          mode = null; render();
        } catch { toast('Impossible d’utiliser cette image : choisis une photo (JPEG, PNG…).', '#ff5c7a', 'error'); }
      });
    }
  }

  let pickedAvatar = null;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-edit-name')) { mode = 'name'; render(); }
    else if (t.hasAttribute('data-edit-avatar')) { mode = 'avatar'; pickedAvatar = save.get().avatar; render(); }
    else if (t.hasAttribute('data-cancel')) { mode = null; render(); }
    else if (t.dataset.avatar) {
      pickedAvatar = t.dataset.avatar;
      el.querySelectorAll('.av-pick').forEach((b) => b.classList.toggle('sel', b === t));
    } else if (t.hasAttribute('data-confirm-avatar')) {
      setAvatar(pickedAvatar);
      toast('Photo de profil mise à jour', '#5cffc4', 'ok');
      mode = null; render();
    } else if (t.hasAttribute('data-confirm-name')) {
      const res = setPlayerName(el.querySelector('#pf-name').value);
      if (!res.ok) { const err = el.querySelector('.pf-error'); err.hidden = false; err.textContent = res.error; return; }
      toast(`Nom changé : ${res.value}`, '#5cffc4', 'ok');
      mode = null; render();
    }
  });
  render();
  // carte COMPTE (gérée à part : elle reste en place quand le reste du profil est redessiné)
  const page = document.createElement('div');
  page.className = 'profile-wrap';
  page.append(el, accountCard());
  showPanel({ title: 'PROFIL', icon: ICONS.user, accent: '#5cc8ff', content: page });
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Recadre une image de la photothèque en carré 256 × 256 (centre) et la compresse en JPEG. */
async function squarePhoto(file) {
  if (!file.type.startsWith('image/') || file.size > 25e6) throw new Error('type');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('empty');
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}
