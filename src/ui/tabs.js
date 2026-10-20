// Onglets simples : chaque onglet reconstruit son contenu à l'affichage (données toujours à jour).
export function tabs(list, initial = 0) {
  const el = document.createElement('div');
  el.className = 'tabs';
  el.innerHTML = `<div class="tab-bar" role="tablist">${list.map((t, i) => `<button role="tab" data-i="${i}">${t.label}</button>`).join('')}</div><div class="tab-body"></div>`;
  const body = el.querySelector('.tab-body');
  const show = (i) => {
    el.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === i)));
    body.replaceChildren(list[i].render());
  };
  el.querySelector('.tab-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) show(+b.dataset.i); });
  show(initial);
  el.show = show;
  return el;
}
