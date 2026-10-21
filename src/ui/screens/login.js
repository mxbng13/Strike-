// CONNEXION : écran d'accueil du compte (nom de joueur + mot de passe). Proposé au lancement tant que le joueur
// n'est ni connecté ni passé par « Jouer sans compte » ; toujours accessible depuis Profil et Amis.
// Obligatoire pour jouer avec un ami (lien d'invitation, combat amical) : `then` est lancé une fois connecté.
import { accountCard } from '../accountCard.js';
import { save } from '../../save/storage.js';
import { showPanel, closePanel } from '../panel.js';
import { ICONS, friendsArt } from '../icons.js';

const REASONS = {
  join: ['TON AMI T’ATTEND !', 'Crée ton compte STRIKE (ou connecte-toi) pour rejoindre son combat.'],
  host: ['COMPTE STRIKE', 'Crée ton compte STRIKE (ou connecte-toi) pour jouer avec tes amis.'],
};

export function openLogin({ fromStart = false, reason = null, then = null } = {}) {
  const root = document.createElement('div');
  root.className = 'lg-screen';
  const [title, text] = REASONS[reason] ?? ['TON COMPTE STRIKE', 'Garde ta partie sur tous tes téléphones et joue avec tes amis.'];
  root.innerHTML = `
    <section class="lg-hero">
      <span class="lg-art">${friendsArt()}</span>
      <div><h3>${title}</h3><p>${text}</p></div>
    </section>
    <ul class="lg-perks">
      <li>${ICONS.shield}<span>Strikers, trophées, pièces et diamants sauvegardés en ligne</span></li>
      <li>${ICONS.friends}<span>Tes amis t’ajoutent avec ton ID joueur ou ton nom</span></li>
      <li>${ICONS.battle}<span>Défie-les en duel quand ils sont connectés</span></li>
    </ul>`;
  root.append(accountCard({ onDone: () => { closePanel(!!then); then?.(); } }));
  if (fromStart) {
    const skip = document.createElement('button');
    skip.className = 'lg-skip';
    skip.textContent = 'JOUER SANS COMPTE';
    skip.addEventListener('click', () => { save.update({ loginSkipped: true }); closePanel(); });
    root.append(skip);
  }
  showPanel({ title: 'COMPTE', icon: ICONS.user, accent: '#5cc8ff', content: root });
}
