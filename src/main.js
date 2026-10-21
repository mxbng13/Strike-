// Point d'entrée : relie la sauvegarde, la scène 3D et l'interface.
import { createRenderer } from './render/environment.js';
import { createStage } from './render/stage.js';
import { createHud } from './ui/hud.js';
import { openCollection } from './ui/screens/collection.js';
import { openShop, setShopNavigation } from './ui/screens/shop.js';
import { openBox } from './ui/screens/box.js';
import { openFriends } from './ui/screens/friends.js';
import { openProfile } from './ui/screens/profile.js';
import { openTrophies } from './ui/screens/trophies.js';
import { openBattleMenu } from './ui/screens/battleMenu.js';
import { initArena, openArena } from './arena/arenaGame.js';
import { getCharacter } from './data/characters.js';
import { save } from './save/storage.js';
import { rankFor } from './game/ranks.js';
import { appearanceFor, appearanceKey } from './game/appearance.js';
import { openPass } from './ui/screens/pass.js';
import { openDaily } from './ui/screens/daily.js';
import { ensurePass } from './game/battlePass.js';
import { openFriendMatch } from './ui/screens/friendMatch.js';
import { initAccount } from './net/account.js';
import { registerPaymentProvider, paymentsAvailable } from './game/payments.js';

ensurePass(); // saison et missions du jour à jour dès le lancement
const renderer = createRenderer(document.getElementById('scene'));
const stage = createStage(renderer);
initArena({ renderer, stage });
setShopNavigation({ openBox: () => openBox() });

const hud = createHud(document.getElementById('hud'), {
  onShop: (tab) => openShop(tab),
  onFriends: () => openFriends(),
  onCollection: () => openCollection(),
  onBox: () => openBox(),
  onBattle: () => openBattleMenu(),
  onProfile: () => openProfile(),
  onTrophies: () => openTrophies(),
  onPass: () => openPass(),
  onDaily: () => openDaily(),
});

let shown = null;
function sync(state) {
  hud.render(state);
  // Le personnage central change s'il est remplacé OU s'il change de rang (nouvelle tenue).
  const look = appearanceFor(state.selected, state);
  const key = appearanceKey(state.selected, look);
  if (key !== shown) {
    shown = key;
    stage.setCharacter(getCharacter(state.selected), look);
  }
}
save.subscribe(sync);
sync(save.get());
stage.start();
initAccount(); // compte connecté sur cet appareil : sauvegarde en ligne reprise automatiquement

requestAnimationFrame(() => requestAnimationFrame(() => {
  const loader = document.getElementById('loader');
  loader.classList.add('hide');
  setTimeout(() => loader.remove(), 600);
  // lien d'invitation d'un ami (…/?join=CODE) : on rejoint directement sa salle de combat amical
  const join = new URLSearchParams(location.search).get('join');
  if (join) {
    history.replaceState(null, '', location.pathname + location.hash);
    openFriendMatch({ join });
  }
}));

// Point d'entrée des achats intégrés pour l'application native (StoreKit / Google Play Billing) :
// l'appli enregistre son « provider » au démarrage ; sans lui, aucun achat n'est possible ni simulé.
window.STRIKE_PAYMENTS = { registerPaymentProvider, paymentsAvailable };

// Accès de debug depuis la console : __game.save.reset()
window.__game = { save, stage, openBattleMenu, openArena, openPass, openFriendMatch };
