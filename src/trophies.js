// Sala de trofeos: cada pieza abatida se guarda con su ficha y se clasifica por medalla,
// con una puntuación al estilo de las homologaciones (puntos CIC).
const KEY = 'sierra.trophies';

// base/spread: rango de puntos CIC del animal adulto medio; medals: [bronce, plata, oro].
const TROPHY = {
  ciervo: { measure: 'puntos CIC', base: 165, perClass: 22, spread: 10, medals: [170, 180, 190], kg: [110, 190], tines: [[6, 8], [10, 12], [13, 16]] },
  gamo: { measure: 'puntos CIC', base: 158, perClass: 14, spread: 7, medals: [160, 170, 180], kg: [60, 95], tines: [[6, 8], [9, 12], [12, 16]] },
  corzo: { measure: 'puntos CIC', base: 100, perClass: 12, spread: 6, medals: [105, 115, 130], kg: [20, 30], tines: [[2, 4], [6, 6], [6, 8]] },
  jabali: { measure: 'puntos CIC', base: 100, perClass: 0, spread: 9, medals: [105, 110, 115], kg: [65, 130] },
  muflon: { measure: 'puntos CIC', base: 180, perClass: 18, spread: 8, medals: [185, 195, 205], kg: [30, 50] },
  cabra: { measure: 'puntos CIC', base: 205, perClass: 24, spread: 10, medals: [205, 225, 245], kg: [60, 95] },
  zorro: { measure: 'puntos CIC', base: 23.2, perClass: 0, spread: 1.1, medals: [23.5, 24.5, 25.5], kg: [5, 9], decimals: 2 },
  cierva: { kg: [70, 100] },
  gama: { kg: [35, 55] },
  cabra_h: { kg: [30, 45] },
  liebre: { kg: [3, 5] },
  lobo: { kg: [30, 45] },
  perdiz: { kg: [0.38, 0.53], small: true },
  tortola: { kg: [0.13, 0.17], small: true },
  zorzal: { kg: [0.06, 0.1], small: true },
  agachadiza: { kg: [0.09, 0.13], small: true },
  pato: { kg: [0.9, 1.4], small: true },
  ciguena: { kg: [2.3, 4.4], small: true },
  flamenco: { kg: [2.5, 4], small: true },
  bufalo: { measure: 'puntos SCI', base: 100, perClass: 8, spread: 6, medals: [100, 108, 116], kg: [500, 850] },
  gorila: { kg: [120, 200] },
};

export const MEDALS = { oro: 'Oro', plata: 'Plata', bronce: 'Bronce' };

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-600)));
  } catch {
    /* sin almacenamiento: el catálogo vive solo en esta partida */
  }
}

let cache = load();

export function all() {
  return cache;
}

export function clearAll() {
  cache = [];
  save(cache);
}

// Crea y guarda la ficha de una pieza. `size` va de ~0.9 a ~1.1 (tamaño del individuo);
// `cls` es la clase de edad (0 joven, 1 adulto, 2 viejo) para cuernas y cuernos.
export function record({ key, name, size = 1, cls = 1, dist, zone, weapon, flying, note, penalty }) {
  const T = TROPHY[key] || { kg: [1, 2] };
  const t = Math.min(1, Math.max(0, (size - 0.88) / 0.3));
  const kg = T.kg[0] + (T.kg[1] - T.kg[0]) * (0.25 + t * 0.6 + Math.random() * 0.15) * (T.small ? 1 : 0.85 + cls * 0.1);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    key, name, date: new Date().toISOString(),
    kg: +kg.toFixed(T.small ? 2 : 1),
    dist: Math.round(dist || 0), zone: zone || '', weapon: weapon || '', flying: !!flying, note: note || '',
    penalty: !!penalty,
    small: !!T.small,
  };
  if (T.measure && !penalty) {
    let score = T.base + (cls - 1) * T.perClass + (size - 1) * T.spread * 4 + (Math.random() - 0.5) * T.spread;
    score = Math.max(T.base * 0.6, score);
    entry.score = +score.toFixed(T.decimals ?? 1);
    entry.measure = T.measure;
    entry.medal = score >= T.medals[2] ? 'oro' : score >= T.medals[1] ? 'plata' : score >= T.medals[0] ? 'bronce' : '';
    if (T.tines) {
      const [a, b] = T.tines[cls];
      entry.tines = a + Math.round(Math.random() * (b - a) / 2) * 2;
    }
  }
  cache.push(entry);
  save(cache);
  return entry;
}

const fmt = (n, d = 1) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
export const describe = (e) => {
  const bits = [];
  if (e.tines) bits.push(`${e.tines} puntas`);
  if (e.score !== undefined) bits.push(`${fmt(e.score, e.score < 50 ? 2 : 1)} ${e.measure}`);
  bits.push(`${fmt(e.kg, e.small ? 2 : 1)} kg`);
  return bits.join(' · ');
};

// ---------- Interfaz del catálogo ----------

let filter = 'todas';

export function renderCatalog(root) {
  const list = all();
  const pick = {
    todas: () => true,
    oro: (e) => e.medal === 'oro',
    plata: (e) => e.medal === 'plata',
    bronce: (e) => e.medal === 'bronce',
    mayor: (e) => !e.small,
    menor: (e) => e.small,
  }[filter];
  const shown = list.filter(pick).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.date.localeCompare(a.date));
  const count = (f) => list.filter(f).length;
  const tabs = [
    ['todas', 'Todas', list.length], ['oro', 'Oro', count((e) => e.medal === 'oro')], ['plata', 'Plata', count((e) => e.medal === 'plata')],
    ['bronce', 'Bronce', count((e) => e.medal === 'bronce')], ['mayor', 'Caza mayor', count((e) => !e.small)], ['menor', 'Caza menor', count((e) => e.small)],
  ];
  // Resumen por especie: número de piezas y mejor ejemplar.
  const bySpecies = {};
  for (const e of list) {
    const s = (bySpecies[e.name] ||= { n: 0, best: null });
    s.n++;
    if (e.score !== undefined && (!s.best || e.score > s.best.score)) s.best = e;
  }
  const summary = Object.entries(bySpecies).sort((a, b) => b[1].n - a[1].n).map(([name, s]) => `
    <div class="t-species"><b>${name}</b><span>${s.n} ${s.n === 1 ? 'pieza' : 'piezas'}</span>
    ${s.best ? `<em class="m-${s.best.medal || 'none'}">Mejor: ${fmt(s.best.score, s.best.score < 50 ? 2 : 1)}</em>` : ''}</div>`).join('');

  root.querySelector('.t-tabs').innerHTML = tabs.map(([k, label, n]) =>
    `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${label} <small>${n}</small></button>`).join('');
  root.querySelector('.t-summary').innerHTML = summary || '';
  root.querySelector('.t-list').innerHTML = shown.length ? shown.map((e) => `
    <li class="t-card ${e.penalty ? 'bad' : ''}">
      <div class="t-medal m-${e.medal || 'none'}">${e.medal ? MEDALS[e.medal] : e.small ? 'Menor' : e.penalty ? 'Multa' : '—'}</div>
      <div class="t-main">
        <b>${e.name}</b>
        <span>${describe(e)}</span>
        <small>${[e.flying ? 'A vuelo' : '', e.zone, `${e.dist} m`, e.weapon].filter(Boolean).join(' · ')}</small>
      </div>
      <time>${new Date(e.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}<br>${new Date(e.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</time>
    </li>`).join('') : '<li class="t-empty">Aún no hay piezas en esta categoría. ¡Al monte!</li>';
  root.querySelectorAll('.t-tabs button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    renderCatalog(root);
  }));
}
