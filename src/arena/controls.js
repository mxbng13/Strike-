// Commandes de Map1.
// Ordinateur : ZQSD / WASD ou flèches pour se déplacer (touches physiques, quel que soit le clavier),
//              souris pour viser ; clic gauche maintenu = viser, relâcher = tirer. Espace : tir vers la souris.
// Mobile : deux joysticks transparents toujours affichés (compacts : ~23 % plus petits qu'avant, course du
//          bouton réduite dans la même proportion). Gauche : se déplacer. Droit (un peu plus grand) :
//          on vise en le tirant et le coup part QUAND ON LE LÂCHE (le ramener au centre annule le tir) ;
//          un simple appui tire vers l'ennemi visible. Les charges de l'arme reviennent toutes seules.
//          ULTI : le bouton ULTI est un troisième joystick. On le tire pour viser (direction et, pour les ultis
//          posés au sol, distance) ; l'ulti part au RELÂCHEMENT. Ramené au centre = annulé ; appui bref = ulti
//          vers l'ennemi visible le plus proche. Un seul lancer par geste ; perte de focus = geste annulé.
export function createControls(root, { touch, ultiEl = null }) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, has: false, down: false };
  const move = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
  const aim = { x: 0, y: 0, id: null, ox: 0, oy: 0, t0: 0, max: 0, active: false };
  const ult = { x: 0, y: 0, id: null, ox: 0, oy: 0, t0: 0, max: 0, active: false };
  let tapFire = false, ultiReq = null, shotReq = null;
  // course du bouton central (px), proportionnelle au diamètre du joystick (116 et 150 px, voir main.css) ;
  // la sortie est normalisée (−1..1) : même sensibilité et mêmes diagonales qu'avec les anciens joysticks
  const RANGE = { move: 43, aim: 55, ult: 40 };
  const TAP = 14;   // en dessous de ce glissement (px), un appui bref sur le joystick de tir = tir automatique

  const el = document.createElement('div');
  el.className = 'ar-touch';
  el.hidden = !touch;
  el.innerHTML = `
    <div class="ar-stick move" aria-label="Se déplacer"><i></i></div>
    <div class="ar-stick aim" aria-label="Viser et tirer"><i></i></div>`;
  root.append(el);
  const stickMove = el.querySelector('.ar-stick.move'), stickAim = el.querySelector('.ar-stick.aim');
  // le joystick vient se placer sous le doigt, puis revient à sa place au relâchement
  const place = (s, x, y) => {
    s.style.transform = '';
    const r = s.getBoundingClientRect();
    s.style.transform = `translate(${x - (r.left + r.width / 2)}px, ${y - (r.top + r.height / 2)}px)`;
    s.classList.add('on');
  };
  const knob = (s, dx, dy) => { s.firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const release = (s) => { s.classList.remove('on'); s.style.transform = ''; knob(s, 0, 0); };

  const ultiKnob = ultiEl?.querySelector('.ar-ulti-knob');
  const ultiKnobAt = (dx, dy) => { if (ultiKnob) ultiKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const ultiRelease = () => { ult.id = null; ult.x = ult.y = 0; ult.active = false; ult.max = 0; ultiEl?.classList.remove('aiming'); ultiKnobAt(0, 0); };
  // joystick d'ulti : contact sur le bouton ULTI (indépendant des deux autres joysticks)
  function onUltiDown(e) {
    e.stopPropagation(); e.preventDefault();
    if (e.pointerType === 'mouse') { ultiReq = { tap: true }; return; }   // souris : clic = ulti vers l'ennemi visible
    if (ult.id !== null) return;
    ult.id = e.pointerId; ult.ox = e.clientX; ult.oy = e.clientY; ult.x = ult.y = 0; ult.t0 = e.timeStamp; ult.max = 0; ult.active = false;
    ultiEl.classList.add('aiming');
  }
  ultiEl?.addEventListener('pointerdown', onUltiDown);

  function onDown(e) {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse') { mouse.down = e.button === 0; mouse.has = true; mouse.x = e.clientX; mouse.y = e.clientY; return; }
    const left = e.clientX < innerWidth / 2;
    const s = left ? move : aim;
    if (s.id !== null) return;
    s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
    if (!left) { aim.t0 = e.timeStamp; aim.max = 0; aim.active = false; }   // heure du contact (pas du traitement)
    place(left ? stickMove : stickAim, e.clientX, e.clientY);
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; return; }
    if (ult.id === e.pointerId) {
      let dx = e.clientX - ult.ox, dy = e.clientY - ult.oy;
      const d = Math.hypot(dx, dy), R = RANGE.ult;
      if (d > R) { dx *= R / d; dy *= R / d; }
      ult.x = dx / R; ult.y = dy / R;
      ult.max = Math.max(ult.max, d); ult.active = d > TAP;
      ultiKnobAt(dx, dy);
      return;
    }
    for (const [s, st] of [[move, stickMove], [aim, stickAim]]) {
      if (s.id !== e.pointerId) continue;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy), R = RANGE[s === move ? 'move' : 'aim'];
      if (d > R) { dx *= R / d; dy *= R / d; }
      s.x = dx / R; s.y = dy / R;
      knob(st, dx, dy);
      if (s === aim) { aim.max = Math.max(aim.max, d); aim.active = d > TAP; }
    }
  }
  function onUp(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && mouse.down) { mouse.down = false; if (!touch) shotReq = { pointer: true }; }
      return;
    }
    if (ult.id === e.pointerId) {
      // relâchement : l'ulti part dans la direction visée (pointercancel = geste interrompu : rien)
      if (e.type === 'pointerup') {
        if (ult.active) ultiReq = { x: ult.x, y: ult.y, mag: Math.min(1, Math.hypot(ult.x, ult.y)) };
        else if (ult.max < TAP && e.timeStamp - ult.t0 < 400) ultiReq = { tap: true };
        // ramené au centre après avoir visé : annulé
      }
      ultiRelease();
      return;
    }
    if (move.id === e.pointerId) { move.id = null; move.x = move.y = 0; release(stickMove); }
    if (aim.id === e.pointerId) {
      // appui bref sans glisser : tir automatique vers l'ennemi visible
      if (aim.max < TAP && e.timeStamp - aim.t0 < 300) tapFire = true;
      // joystick lâché en visant : le tir part dans la direction visée
      else if (aim.active) shotReq = { x: aim.x, y: aim.y };
      aim.id = null; aim.x = aim.y = 0; aim.active = false; release(stickAim);
    }
  }
  const onKey = (down) => (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'Space'].includes(e.code)) e.preventDefault();
    if (down) { keys.add(e.code); if (e.code === 'KeyE' && !e.repeat) ultiReq = mouse.has && !touch ? { pointer: true } : { tap: true }; if (e.code === 'Space' && !e.repeat) { if (mouse.has && !touch) shotReq = { pointer: true }; else tapFire = true; } }
    else keys.delete(e.code);
  };
  const kd = onKey(true), ku = onKey(false);
  // perte de focus / application en arrière-plan : tout geste en cours est annulé (aucun tir ni ulti)
  const blur = () => { keys.clear(); mouse.down = false; reset(); };
  const onVis = () => { if (document.hidden) blur(); };
  const noMenu = (e) => e.preventDefault();
  root.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);
  addEventListener('blur', blur);
  document.addEventListener('visibilitychange', onVis);
  root.addEventListener('contextmenu', noMenu);

  /** État des commandes pour cette image. Les déplacements sont en repère écran (x droite, y bas). */
  function read() {
    let mx = 0, my = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (mx || my) { const d = Math.hypot(mx, my); mx /= d; my /= d; } else { mx = move.x; my = move.y; }
    const out = {
      mx, my,
      pointer: mouse.has && !touch ? { x: mouse.x, y: mouse.y } : null,
      stick: aim.active ? { x: aim.x, y: aim.y } : null,
      aiming: (mouse.down && !touch) || aim.active,   // en train de viser (ligne de visée affichée)
      release: shotReq,                               // tir à cet instant : { x, y } (joystick) ou { pointer: true }
      tapFire,
      ulti: ultiReq,                                  // ulti à lancer : { x, y, mag } (joystick), { tap } ou { pointer }
      ultiAim: ult.active ? { x: ult.x, y: ult.y, mag: Math.min(1, Math.hypot(ult.x, ult.y)) } : null,   // visée en cours
    };
    tapFire = false; ultiReq = null; shotReq = null;
    return out;
  }
  function setTouch(on) { touch = on; el.hidden = !on || hiddenAll; }
  let hiddenAll = false;
  /** Cache les joysticks (fin de partie) ou les réaffiche. */
  function setHidden(h) { hiddenAll = h; el.hidden = !touch || h; if (h) reset(); }
  function reset() { keys.clear(); mouse.down = false; shotReq = null; tapFire = false; ultiReq = null; move.id = aim.id = null; move.x = move.y = aim.x = aim.y = 0; aim.active = false; release(stickMove); release(stickAim); ultiRelease(); }
  function dispose() {
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
    removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', onVis); ultiEl?.removeEventListener('pointerdown', onUltiDown);
    el.remove();
  }
  /** Haut des joysticks à leur place de repos (px depuis le haut de l'écran ; la position sous le doigt est ignorée). */
  const restTop = () => (el.hidden ? innerHeight : Math.min(stickMove.offsetTop, stickAim.offsetTop));
  return { read, reset, dispose, setTouch, setHidden, restTop, get touch() { return touch; } };
}
