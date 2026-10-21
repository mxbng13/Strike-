// CONNEXION : écran d'accueil du compte (nom de joueur + mot de passe). Proposé au lancement tant que le joueur
// n'est ni connecté ni passé par « Jouer sans compte » ; toujours accessible depuis Profil et Amis.
import { accountCard } from '../accountCard.js';
import { save } from '../../save/storage.js';
import { showPanel, closePanel } from '../panel.js';
import { ICONS, friendsArt } from '../icons.js';

export function openLogin({ fromStart = false } = {}) {
  const root = document.createElement('div');
  root.className = 'lg-screen';
  root.innerHTML = `
    <section class="lg-hero">
      <span class="lg-art">${friendsArt()}</span>
      <div><h3>TON COMPTE STRIKE</h3><p>Garde ta partie sur tous tes téléphones et joue avec tes amis.</p></div>
    </section>
    <ul class="lg-perks">
      <li>${ICONS.shield}<span>Strikers, trophées, pièces et diamants sauvegardés en ligne</span></li>
      <li>${ICONS.friends}<span>Tes amis t’ajoutent avec ton nom de joueur</span></li>
      <li>${ICONS.battle}<span>Défie-les en duel quand ils sont connectés</span></li>
    </ul>`;
  root.append(accountCard({ onDone: () => closePanel() }));
  if (fromStart) {
    const skip = document.createElement('button');
    skip.className = 'lg-skip';
    skip.textContent = 'JOUER SANS COMPTE';
    skip.addEventListener('click', () => { save.update({ loginSkipped: true }); closePanel(); });
    root.append(skip);
  }
  showPanel({ title: 'COMPTE', icon: ICONS.user, accent: '#5cc8ff', content: root });
}
