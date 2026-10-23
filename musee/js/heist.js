// Le casse : préparation (cible, équipe, gadgets), phases à choix, décrochage minute, fuite.
import { ART, RARITY, bindImg } from './catalog.js';
import { S, DEF, ROLES, GADGETS, ownerInfo, worksOf, addItem, removeItem, setOwner, log } from './state.js';
import { phaseChance, toast, emit } from './sim.js';
import { addRoute, clearRoutes } from './map.js';
import { esc, money, now, clamp, pick, randi, $, $$ } from './util.js';

const PHASES = [
  { k: 'locks', name: 'Entrée', role: 'cambrioleur', gadget: 'passe', def: d => d.locks,
    intro: 'Porte de service, 3 h 12. La serrure brille sous la lampe frontale.',
    ok: ['Un déclic discret. La porte s’ouvre sur un couloir sombre.', 'La serrure cède sans un bruit.'],
    ko: ['La goupille se coince, le pêne claque. Une lumière s’allume au loin.', 'Le crochet casse dans la serrure. Il faut forcer.'] },
  { k: 'cams', name: 'Caméras', role: 'hacker', gadget: 'brouilleur', def: d => d.cams,
    intro: 'Douze caméras couvrent la galerie principale. Le poste de sécurité est au sous-sol.',
    ok: ['Les écrans du poste de garde tournent en boucle sur une salle vide.', 'Les caméras pivotent toutes vers le plafond.'],
    ko: ['Une caméra vous a filmé trois secondes de trop.', 'Le pare-feu détecte l’intrusion et lève un drapeau.'] },
  { k: 'patrol', name: 'Rondes', role: 'grosbras', gadget: 'somnifere', def: d => Math.ceil((d.guards + d.dogs) / 2),
    intro: 'Des pas résonnent dans l’escalier. Un chien grogne derrière une porte.',
    ok: ['Le gardien s’endort sur sa chaise. Le chien aussi.', 'Vous passez derrière la ronde, collés au mur.'],
    ko: ['Le chien aboie. Le gardien saisit sa radio.', 'Un faisceau de torche balaie votre visage.'] },
  { k: 'lasers', name: 'Salle', role: 'acrobate', gadget: 'miroirs', def: d => d.lasers,
    intro: 'La salle des chefs-d’œuvre. Une grille de faisceaux rouges barre le passage.',
    ok: ['Souplesse, respiration lente : vous traversez la grille.', 'Les miroirs renvoient les faisceaux sur eux-mêmes.'],
    ko: ['Un talon effleure un faisceau. Un bip sec retentit.', 'La grille change de motif au pire moment.'] },
  { k: 'grab', name: 'Décrochage' },
  { k: 'escape', name: 'Fuite', role: 'chauffeur', gadget: 'fumigene', def: d => d.alarm,
    intro: 'L’œuvre est dans le tube. Il reste à rejoindre la camionnette.',
    ok: ['Le moteur rugit. Les gyrophares disparaissent dans le rétroviseur.', 'Ruelle, quai, autoroute : personne ne vous suit.'],
    ko: ['Barrage de police au bout de la rue.', 'La camionnette cale au feu rouge.'] },
];

let H = null;   // casse en cours
const root = () => $('#heist');

export function targetDef(o) { return o.kind === 'inst' ? S.inst[o.id].def : S.rivals.find(r => r.id === o.id).def; }
export const scoutCost = lvl => Math.round(900 * Math.pow(lvl, 1.6));
export const prepCost = lvl => Math.round(600 * Math.pow(lvl, 1.8));
export function scouted(id) {
  const ref = id.startsWith('i:') ? S.inst[id] : S.rivals.find(r => r.id === id);
  return (ref.scout ?? 0) > now();
}
export function scout(id) {
  const o = ownerInfo(id);
  const c = scoutCost(o.lvl);
  if (S.money < c) { toast('Pas assez d’argent pour le repérage.', 'bad'); return false; }
  S.money -= c;
  o.ref.scout = now() + 20 * 60e3;
  log(`Repérage de ${o.name} : plans et rondes relevés pour 20 minutes.`, 'info');
  return true;
}

function skillFor(team, role) {
  const best = Math.max(0, ...team.filter(c => c.role === role).map(c => c.lvl));
  if (best) return best;
  return Math.max(0, ...team.map(c => c.lvl)) * 0.4;
}

export function openHeist(ownerId, aid = null) {
  if (!S.me.placed) { toast('Bâtissez d’abord votre musée sur la carte.', 'warn'); return; }
  const o = ownerInfo(ownerId);
  const works = worksOf(ownerId);
  if (!works.length) { toast(`${o.name} n’a plus rien à voler.`, 'warn'); return; }
  H = { o, aid: aid ?? works[0], team: S.crew.filter(c => !c.jail).slice(0, 4).map(c => c.id), step: 'prep', alarm: 0, phase: 0, loot: false, swap: false, used: {} };
  root().hidden = false;
  document.body.classList.add('heisting');
  renderPrep();
}
function close() {
  root().hidden = true; root().innerHTML = '';
  document.body.classList.remove('heisting');
  clearRoutes();
  H = null;
  emit('changed');
}

function header(title, sub) {
  return `<div class="hz-head"><div><p class="eyebrow">Opération ${esc(H.o.name)}</p><h2>${esc(title)}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
    <button class="icon-btn" data-x="close" aria-label="Fermer">✕</button></div>`;
}
function alarmLights() {
  return `<div class="alarm" title="Alarme"><span>Alarme</span>${[0, 1, 2].map(i => `<i class="${i < H.alarm ? 'on' : ''}"></i>`).join('')}</div>`;
}
function timeline() {
  return `<ol class="hz-steps">${PHASES.map((p, i) => `<li class="${i < H.phase ? 'done' : i === H.phase ? 'now' : ''}">${p.name}</li>`).join('')}</ol>`;
}

// ---------- préparation ----------
function renderPrep() {
  const { o } = H;
  const def = targetDef(o), known = scouted(o.id);
  const works = worksOf(o.id);
  const a = ART[H.aid];
  const team = S.crew.filter(c => H.team.includes(c.id));
  const cost = prepCost(o.lvl);
  const rows = PHASES.filter(p => p.def).map(p => {
    const d = p.def(def), sk = skillFor(team, p.role);
    const ch = phaseChance(sk, d);
    return `<tr><td>${p.name}</td><td class="num">${known ? d : '?'}</td><td>${ROLES[p.role].skill} <b class="num">${Math.round(sk * 10) / 10}</b></td>
      <td class="num ${known ? (ch > 0.7 ? 'good' : ch > 0.45 ? 'warn' : 'bad') : ''}">${known ? Math.round(ch * 100) + ' %' : '?'}</td></tr>`;
  }).join('');
  const myCopy = S.items.find(x => x.aid === H.aid && x.copy);
  root().innerHTML = `<div class="hz">
    ${header('Plan du casse', `${esc(o.name)} · niveau ${o.lvl}${o.city ? ' · ' + esc(o.city) : ''}`)}
    <div class="hz-grid">
      <section class="hz-target">
        <div class="frame sm"><img></div>
        <div><p class="eyebrow" style="color:${RARITY[a.r].color}">${RARITY[a.r].name}</p><h3>${esc(a.t)}</h3><p class="muted">${esc(a.a)} · ${esc(a.d)}</p>
        <p>Valeur estimée <b class="num">${money(a.v)}</b></p>
        ${myCopy ? `<p class="good">Vous possédez une copie (qualité ${Math.round(myCopy.copy * 100)} %) : vous pourrez la laisser à la place de l’original.</p>` : ''}</div>
        <label class="field">Cible <select id="hz-aid">${works.slice(0, 200).map(id => `<option value="${id}" ${id === H.aid ? 'selected' : ''}>${esc(ART[id].t.slice(0, 60))} — ${money(ART[id].v)}</option>`).join('')}</select></label>
      </section>
      <section>
        <h4>Sécurité ${known ? '<span class="chip good">repérée</span>' : `<button class="btn sm" data-x="scout">Repérage · ${money(scoutCost(o.lvl))}</button>`}</h4>
        <table class="tbl"><thead><tr><th>Phase</th><th>Défense</th><th>Votre équipe</th><th>Chance</th></tr></thead><tbody>${rows}</tbody></table>
        <h4>Équipe <span class="muted">(4 au plus)</span></h4>
        <div class="crew-pick">${S.crew.map(c => `<button class="crew ${H.team.includes(c.id) ? 'on' : ''}" data-c="${c.id}" ${c.jail ? 'disabled' : ''}>
          <b>${esc(c.name)}</b><span>${ROLES[c.role].name} · niv. ${c.lvl}${c.jail ? ' · en prison' : ''}</span></button>`).join('')}</div>
        <h4>Gadgets</h4>
        <div class="gadgets">${Object.entries(GADGETS).map(([k, g]) => `<span class="chip">${g.name} ×${S.gadgets[k] ?? 0}</span>`).join('')}</div>
      </section>
    </div>
    <div class="hz-foot"><span class="muted">Matériel et véhicule : <b class="num">${money(cost)}</b></span>
      <button class="btn primary" data-x="go" ${team.length ? '' : 'disabled'}>Lancer le casse</button></div>
  </div>`;
  bindImg($('.hz-target img', root()), a, true);
  $('#hz-aid', root()).onchange = e => { H.aid = +e.target.value; renderPrep(); };
  $$('[data-c]', root()).forEach(b => b.onclick = () => {
    const id = b.dataset.c;
    if (H.team.includes(id)) H.team = H.team.filter(x => x !== id); else if (H.team.length < 4) H.team.push(id);
    renderPrep();
  });
  $('[data-x=close]', root()).onclick = close;
  const sc = $('[data-x=scout]', root()); if (sc) sc.onclick = () => { if (scout(o.id)) renderPrep(); };
  $('[data-x=go]', root()).onclick = () => {
    if (S.money < cost) { toast('Pas assez d’argent pour préparer le casse.', 'bad'); return; }
    S.money -= cost;
    S.stats.heists++;
    H.step = 'run'; H.phase = 0;
    addRoute('me', o.id, '#ff5b4a', 10 * 60e3);
    renderPhase();
  };
}

// ---------- phases ----------
function renderPhase(result) {
  const p = PHASES[H.phase];
  if (p.k === 'grab') return renderGrab();
  const team = S.crew.filter(c => H.team.includes(c.id));
  const def = targetDef(H.o);
  const d = p.def(def), sk = skillFor(team, p.role);
  let base = phaseChance(sk, d);
  if (p.k === 'escape') base = clamp(base - 0.12 * H.alarm, 0.05, 0.97);
  const g = S.gadgets[p.gadget] ?? 0;
  const known = scouted(H.o.id);
  const pct = v => known ? Math.round(clamp(v, 0, 0.99) * 100) + ' %' : '?';
  const who = team.filter(c => c.role === p.role).sort((a, b) => b.lvl - a.lvl)[0];
  root().innerHTML = `<div class="hz">
    ${header(p.name, `${who ? esc(who.name) + ' passe devant.' : 'Personne n’est spécialiste : vous improvisez.'}`)}
    ${timeline()}${alarmLights()}
    <div class="hz-story">
      <p class="lead">${p.intro}</p>
      ${result ? `<p class="${result.ok ? 'good' : 'bad'} story-res">${result.text}</p>` : ''}
    </div>
    <div class="hz-choices">
      <button class="choice" data-o="soft"><b>${p.k === 'escape' ? 'Itinéraire discret' : 'Méthode douce'}</b><span>${ROLES[p.role].skill} contre défense ${known ? d : '?'}</span><em>${pct(base)}</em></button>
      <button class="choice" data-o="gadget" ${g ? '' : 'disabled'}><b>${GADGETS[p.gadget].name}</b><span>${g ? `${g} en stock` : 'Aucun en stock (Planque)'}</span><em>${pct(base + 0.35)}</em></button>
      <button class="choice danger" data-o="force"><b>${p.k === 'escape' ? 'Foncer dans le tas' : 'En force'}</b><span>Plus sûr, mais déclenche l’alarme</span><em>${pct(base + 0.2)}</em></button>
    </div>
  </div>`;
  $('[data-x=close]', root()).onclick = () => { if (confirmAbort()) close(); };
  $$('[data-o]', root()).forEach(b => b.onclick = () => resolve(p, b.dataset.o, base));
}
function confirmAbort() {
  H.abortAsk = (H.abortAsk ?? 0) + 1;
  if (H.abortAsk < 2) { toast('Touchez encore ✕ pour abandonner le casse (sans rien emporter).', 'warn'); return false; }
  log(`Casse contre ${H.o.name} abandonné.`, 'warn');
  return true;
}
function resolve(p, opt, base) {
  let ch = base;
  if (opt === 'gadget') { ch += 0.35; S.gadgets[p.gadget]--; }
  if (opt === 'force') { ch += 0.2; H.alarm++; }
  ch = clamp(ch, 0.03, 0.98);
  $$('.choice', root()).forEach(b => b.disabled = true);
  const story = $('.hz-story', root());
  story.insertAdjacentHTML('beforeend', '<p class="suspense"><i></i><i></i><i></i></p>');
  setTimeout(() => {
    const ok = Math.random() < ch;
    if (!ok) H.alarm += opt === 'force' ? 1 : 1;
    const text = pick(ok ? p.ok : p.ko);
    if (p.k === 'escape') return finish(ok, text);
    if (H.alarm >= 3) { H.phase = PHASES.findIndex(x => x.k === 'escape'); H.panic = true; return renderPhase({ ok: false, text: text + ' Les sirènes hurlent : il faut fuir, maintenant !' }); }
    H.phase++;
    renderPhase({ ok, text });
  }, 1100);
}

// ---------- décrochage (mini-jeu) ----------
function renderGrab() {
  const team = S.crew.filter(c => H.team.includes(c.id));
  const sk = Math.max(skillFor(team, 'acrobate'), skillFor(team, 'cambrioleur'));
  const zone = clamp(0.1 + 0.025 * sk, 0.1, 0.34);
  const speed = 0.55 + H.o.lvl * 0.09;
  const a = ART[H.aid];
  const copy = S.items.find(x => x.aid === H.aid && x.copy);
  root().innerHTML = `<div class="hz">
    ${header('Décrochage', 'Découpez la fixation quand l’aiguille passe dans la zone dorée.')}
    ${timeline()}${alarmLights()}
    <div class="grab">
      <div class="frame"><img></div>
      <p class="muted">${esc(a.t)} · ${esc(a.a)}</p>
      <div class="gauge"><div class="zone" style="left:${(0.5 - zone / 2) * 100}%;width:${zone * 100}%"></div><div class="needle"></div></div>
      ${copy ? `<label class="swap"><input type="checkbox" id="hz-swap"> Laisser ma copie à la place (qualité ${Math.round(copy.copy * 100)} %). Sans alarme, personne ne remarquera rien.</label>` : ''}
      <button class="btn primary big" data-x="cut">Découper</button>
    </div>
  </div>`;
  bindImg($('.grab img', root()), a, true);
  $('[data-x=close]', root()).onclick = () => { if (confirmAbort()) close(); };
  const needle = $('.needle', root());
  let x = 0, dir = 1, last = performance.now(), live = true;
  const step = t => {
    if (!live) return;
    x += dir * speed * (t - last) / 1000; last = t;
    if (x > 1) { x = 1; dir = -1; } if (x < 0) { x = 0; dir = 1; }
    needle.style.left = (x * 100) + '%';
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  $('[data-x=cut]', root()).onclick = () => {
    live = false;
    const ok = Math.abs(x - 0.5) <= zone / 2;
    H.swap = !!$('#hz-swap', root())?.checked;
    H.loot = true;
    if (!ok) H.alarm++;
    H.phase++;
    if (H.alarm >= 3) H.panic = true;
    renderPhase({ ok, text: ok ? 'Coupe nette. La toile glisse dans le tube sans un pli.' : 'La lame ripe, le cadre tombe avec fracas. L’alarme s’emballe.' });
  };
}

// ---------- dénouement ----------
function finish(escaped, text) {
  const { o } = H;
  const a = ART[H.aid];
  const team = S.crew.filter(c => H.team.includes(c.id));
  let html;
  if (escaped && H.loot) {
    const copy = H.swap ? S.items.find(x => x.aid === H.aid && x.copy) : null;
    const discreet = copy && H.alarm === 0;
    addItem(H.aid, { from: o.id, at: now() });
    if (copy) {
      removeItem(copy);
      if (o.kind === 'rival') { setOwner(H.aid, o.id); o.ref.fakes[H.aid] = copy.copy; }
      else setOwner(H.aid, o.id);
      // la copie reste chez la victime : l’original n’est plus « à elle » mais elle ne le sait pas
      S.owners[H.aid] = o.id;
    }
    S.heat = clamp(S.heat + (discreet ? 2 : 8 + o.lvl * 3 + H.alarm * 6), 0, 100);
    S.stats.wins++; S.stats.stolen += a.v;
    if (o.kind === 'rival' && !discreet) { o.ref.grudge = 1; S.nextRaid = Math.min(S.nextRaid, now() + randi(90, 200) * 1000); }
    if (o.kind === 'inst') { const k = pick(DEF).k; o.ref.def[k] = Math.min(10, o.ref.def[k] + 1); }
    for (const c of team) { c.xp = (c.xp ?? 0) + 1; if (c.xp >= c.lvl * 2 && c.lvl < 10) { c.xp = 0; c.lvl++; toast(`${c.name} passe niveau ${c.lvl} !`, 'good'); } }
    log(`Casse réussi chez ${o.name} : « ${a.t} » (${money(a.v)})${discreet ? ', remplacé par votre copie' : ''}.`, 'good');
    html = `<div class="result win"><div class="frame"><img></div><div class="stamp">Volé</div>
      <h2>${esc(a.t)}</h2><p class="muted">${esc(a.a)} · ${money(a.v)}</p><p>${esc(text)}</p>
      <p class="${discreet ? 'good' : 'warn'}">${discreet ? 'Substitution parfaite : la victime ne se doute de rien.' : `L’œuvre est « brûlante » pendant 20 minutes : gardez-la en réserve, Interpol enquête.`}</p></div>`;
  } else if (escaped) {
    log(`Casse avorté chez ${o.name} : l’équipe s’est enfuie les mains vides.`, 'warn');
    S.heat = clamp(S.heat + 6, 0, 100);
    html = `<div class="result"><h2>Repli</h2><p>${esc(text)}</p><p class="muted">Toute l’équipe est rentrée, mais sans l’œuvre.</p></div>`;
  } else {
    const caught = pick(team);
    caught.jail = now() + 8 * 60e3;
    S.heat = clamp(S.heat + 20, 0, 100);
    if (o.kind === 'rival') o.ref.grudge = 1;
    log(`Casse raté chez ${o.name} : ${caught.name} est arrêté.`, 'bad');
    html = `<div class="result lose"><h2>Arrêtés</h2><p>${esc(text)}</p><p class="bad">${esc(caught.name)} passe 8 minutes en garde à vue. L’œuvre reste chez ${esc(o.name)}.</p></div>`;
  }
  root().innerHTML = `<div class="hz">${header(escaped && H.loot ? 'Casse réussi' : 'Fin de l’opération')}${html}
    <div class="hz-foot"><span></span><button class="btn primary" data-x="close">Retour à la carte</button></div></div>`;
  const img = $('.result img', root()); if (img) bindImg(img, a, true);
  $$('[data-x=close]', root()).forEach(b => b.onclick = close);
  emit('changed');
}
