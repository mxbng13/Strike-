// Carte COMPTE du profil : connexion / création de compte, état de la sauvegarde en ligne, choix de la
// partie à garder quand l'appareil et le compte en ont chacun une.
import { accountAvailable, accountState, onAccount, signIn, signUp, signOut, syncNow, resolveChoice } from '../net/account.js';
import { ICONS } from './icons.js';
import { toast } from './panel.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');
const ago = (t) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? 'à l’instant' : s < 60 ? `il y a ${s} s` : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`;
};

export function accountCard() {
  const el = document.createElement('section');
  el.className = 'pf-section ac-card';
  let busy = false, error = '', choice = null, info = '';

  const summary = (title, s, key) => `
    <button class="ac-pick" data-keep="${key}">
      <small>${title}</small>
      <b>${esc(s.name)}</b>
      <span>${ICONS.trophy}${fmt(s.trophies)}</span>
      <span>${ICONS.coin}${fmt(s.coins)}</span>
      <span>${ICONS.gem}${fmt(s.gems)}</span>
      <span>${ICONS.striker}${s.strikers} Strikers</span>
      <em>${key === 'cloud' ? 'REPRENDRE CETTE PARTIE' : 'GARDER CETTE PARTIE'}</em>
    </button>`;

  function render() {
    const st = accountState();
    let body;
    if (!accountAvailable()) {
      body = `<p class="ac-note">${ICONS.clock}<span>La sauvegarde en ligne s’active dès que le serveur du jeu est branché. Ta partie reste enregistrée sur cet appareil.</span></p>`;
    } else if (choice) {
      body = `
        <p class="ac-lead">Ce compte a déjà une partie. Laquelle veux-tu garder ?</p>
        <div class="ac-choice">${summary('Sur cet appareil', choice.local, 'local')}${summary('Dans ton compte', choice.cloud, 'cloud')}</div>
        <p class="ac-note small">Une copie de secours de l’autre partie est gardée sur cet appareil.</p>`;
    } else if (st.user) {
      const label = { syncing: 'Synchronisation…', synced: `Sauvegardé ${ago(st.lastSync)}`, error: 'Échec de la synchronisation', choice: 'Choix en attente' }[st.status] ?? 'Connecté';
      body = `
        <div class="ac-user">
          <span class="ac-ok ${st.status === 'error' ? 'bad' : ''}">${st.status === 'error' ? ICONS.close : ICONS.check}</span>
          <div><b>${esc(st.user.email)}</b><small data-ac-status>${label}</small></div>
        </div>
        <p class="ac-note small">Ta progression est enregistrée dans ton compte : connecte-toi sur un autre téléphone pour la retrouver.</p>
        <div class="r-btns"><button class="r-btn ghost" data-ac-out ${busy ? 'disabled' : ''}>SE DÉCONNECTER</button><button class="r-btn" data-ac-sync ${busy ? 'disabled' : ''}>${ICONS.rotate}SAUVEGARDER</button></div>`;
    } else {
      body = `
        <p class="ac-lead">Connecte-toi pour garder tes Strikers, trophées et pièces sur tous tes téléphones.</p>
        <form class="ac-form" novalidate>
          <label>E-mail<input name="email" type="email" autocomplete="email" inputmode="email" required /></label>
          <label>Mot de passe<input name="password" type="password" autocomplete="current-password" minlength="6" required /></label>
          <p class="pf-error" ${error ? '' : 'hidden'} role="alert">${esc(error)}</p>
          ${info ? `<p class="ac-info">${esc(info)}</p>` : ''}
          <div class="r-btns">
            <button class="r-btn ghost" type="submit" data-ac-mode="up" ${busy ? 'disabled' : ''}>CRÉER UN COMPTE</button>
            <button class="r-btn" type="submit" data-ac-mode="in" ${busy ? 'disabled' : ''}>${busy ? '…' : 'SE CONNECTER'}</button>
          </div>
        </form>`;
    }
    el.innerHTML = `<h4 class="f-sec">${ICONS.shield} Compte et sauvegarde</h4>${body}`;
    el.querySelectorAll('input').forEach((i) => i.addEventListener('pointerdown', (e) => e.stopPropagation()));
    el.querySelector('form')?.addEventListener('submit', submit);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const f = e.currentTarget, mode = e.submitter?.dataset.acMode ?? 'in';
    const email = f.email.value.trim(), password = f.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { error = 'Entre une adresse e-mail valide.'; render(); return; }
    if (password.length < 6) { error = 'Le mot de passe doit faire au moins 6 caractères.'; render(); return; }
    busy = true; error = ''; info = ''; render();
    const r = await (mode === 'up' ? signUp(email, password) : signIn(email, password));
    busy = false;
    if (!r.ok) error = r.error;
    else if (r.confirm) info = 'Compte créé : ouvre le lien reçu par e-mail, puis connecte-toi.';
    else if (r.choice) choice = r.choice;
    else toast(r.uploaded ? 'Compte créé : partie sauvegardée en ligne' : 'Connecté : partie synchronisée', '#5cffc4', 'ok');
    render();
  }

  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-keep]');
    if (k) {
      busy = true; choice = null; render();
      await resolveChoice(k.dataset.keep);
      busy = false; render();
      toast(k.dataset.keep === 'cloud' ? 'Partie du compte récupérée' : 'Partie de l’appareil sauvegardée en ligne', '#5cffc4', 'ok');
      return;
    }
    if (e.target.closest('[data-ac-out]')) { busy = true; render(); await signOut(); busy = false; render(); toast('Déconnecté', '#5cc8ff', 'info'); return; }
    if (e.target.closest('[data-ac-sync]')) { await syncNow(); render(); }
  });
  const off = onAccount(() => { if (!el.isConnected && el.dataset.mounted) { off(); return; } el.dataset.mounted = '1'; render(); });
  render();
  return el;
}
