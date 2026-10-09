// Balance de mazos y héroes, IA contra IA:  npm run balance [-- clave=valor…] [--partes N] [--json archivo] [--cartas]
//
// Todas las combinaciones mazo + héroe contra todas, en los dos asientos (atacar en los turnos impares o
// en los pares): 400 partidas, más Salvajes contra Pradera sin héroes. Muestra si los mazos están
// parejos (sin héroes y con cualquier héroe), cuánto gana cada héroe con el mismo mazo de los dos lados
// y con mazos cruzados, quién le gana a quién y la ventaja del asiento. `clave=valor` cambia una regla en
// prueba (por ejemplo powerMode=off, sin poder). También cuánto de lo que juega cada héroe son cartas de
// clase (le llega 1 de clase y 2 del mazo por turno: un tercio es lo que le llega), cuántas de cada tipo
// descarta y cuántos turnos las guarda antes de jugarlas: si las de clase nunca se descartan y se juegan
// siempre en su turno, son mejores; si se guardan para el momento justo, son tácticas. Con --cartas, lo
// mismo carta por carta (las de clase de cada héroe y las de los mazos). Reparte las partidas
// en procesos (uno por núcleo, menos uno); con --json guarda cada partida. Sin azar: cada partida da
// siempre lo mismo.
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { playOut } from '../src/core/ai';
import { card, DECKS } from '../src/core/cards';
import { HERO_ORDER, HEROES } from '../src/core/heroes';
import { newGame } from '../src/core/rules';
import { cardStats } from '../src/core/text';
import type { Config } from '../src/core/types';

const args = process.argv.slice(2);
const config: Record<string, string | number | boolean> = {};
for (const a of args.filter((x) => x.includes('=') && !x.startsWith('--'))) {
  const [k, v] = a.split('=');
  config[k] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const DECK_IDS = ['salvajes', 'pradera'] as const;
interface Build { deck: string; hero: string | null }
interface Game { i: number; b: [Build, Build] }
interface Result {
  i: number;
  winner: 0 | 1 | null;
  life: [number, number];
  uses: [number, number];
  /** Cartas jugadas de cada lado: de clase y del mazo, en cantidad y en maná (su turno). */
  cls: [number, number];
  base: [number, number];
  clsMana: [number, number];
  baseMana: [number, number];
  /** Las que descartó de cada tipo, y cuántos turnos esperaron en la mano las que jugó. */
  clsGone: [number, number];
  baseGone: [number, number];
  clsWait: [number, number];
  baseWait: [number, number];
  /** Qué pasó con cada carta que le llegó a cada uno: la jugó (y cuántos turnos esperó), la descartó o le quedó. */
  fates: { id: string; side: 0 | 1; fate: 'play' | 'gone' | 'kept'; wait: number }[];
}

// las partidas: todas las combinaciones (en los dos asientos) y los mazos solos
const builds: Build[] = DECK_IDS.flatMap((deck) => HERO_ORDER.map((hero) => ({ deck, hero })));
const games: Game[] = [];
for (const a of builds) for (const b of builds) games.push({ i: games.length, b: [a, b] });
for (const d0 of DECK_IDS) for (const d1 of DECK_IDS) games.push({ i: games.length, b: [{ deck: d0, hero: null }, { deck: d1, hero: null }] });

function play(g: Game): Result {
  const s = newGame({
    decks: [DECKS[g.b[0].deck], DECKS[g.b[1].deck]], names: ['J1', 'J2'], heroes: [g.b[0].hero, g.b[1].hero], config: config as Partial<Config>,
  });
  playOut(s);
  const uses = ([0, 1] as const).map((j) => s.record.reduce((a, t) => a + t.powers.filter((p) => p.side === j).length, 0)) as [number, number];
  const r: Result = {
    i: g.i, winner: s.result!.winner, life: s.result!.life, uses,
    cls: [0, 0], base: [0, 0], clsMana: [0, 0], baseMana: [0, 0], clsGone: [0, 0], baseGone: [0, 0], clsWait: [0, 0], baseWait: [0, 0], fates: [],
  };
  for (const t of s.record) {
    for (const j of [0, 1] as const) {
      for (const id of t.plays[j]) {
        // cada carta llega en el turno que dice su número
        const c = card(id), wait = t.turn - c.rank;
        r.fates.push({ id, side: j, fate: 'play', wait });
        if (c.hero) {
          r.cls[j]++;
          r.clsMana[j] += c.rank;
          r.clsWait[j] += wait;
        } else {
          r.base[j]++;
          r.baseMana[j] += c.rank;
          r.baseWait[j] += wait;
        }
      }
    }
  }
  for (const j of [0, 1] as const) {
    for (const h of s.players[j].gone) {
      r.fates.push({ id: h.id, side: j, fate: 'gone', wait: 0 });
      if (card(h.id).hero) r.clsGone[j]++;
      else r.baseGone[j]++;
    }
    for (const h of s.players[j].hand) r.fates.push({ id: h.id, side: j, fate: 'kept', wait: 0 });
  }
  return r;
}

const part = process.env.HS_PART;
if (part !== undefined) {
  // un proceso hijo: juega las suyas y las manda de a una
  const n = Number(process.env.HS_PARTS);
  for (const g of games) if (g.i % n === Number(part)) process.send!(play(g));
  process.exit(0);
}

const parts = Number(opt('--partes') ?? Math.max(1, cpus().length - 1));
const t0 = Date.now();
const results: Result[] = [];
console.log(`${games.length} partidas en ${parts} procesos${Object.keys(config).length ? `, reglas: ${JSON.stringify(config)}` : ''}…`);
await Promise.all(Array.from({ length: parts }, (_, k) => new Promise<void>((resolve, reject) => {
  const child = fork(import.meta.filename, args, { env: { ...process.env, HS_PART: String(k), HS_PARTS: String(parts) } });
  child.on('message', (r: Result) => {
    results.push(r);
    if (results.length % 50 === 0) console.log(`  ${results.length}/${games.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`el proceso ${k} terminó con ${code}`))));
})));
const byIndex = new Map(results.map((r) => [r.i, r]));
const json = opt('--json');
if (json) writeFileSync(json, JSON.stringify(games.map((g) => ({ ...g, ...byIndex.get(g.i)! }))));

/** Lo que sacó el asiento `seat`: 1 si ganó, ½ si empataron. */
const pts = (r: Result, seat: 0 | 1) => (r.winner === seat ? 1 : r.winner === null ? 0.5 : 0);
const name = (h: string | null) => (h ? HEROES[h].name : 'sin héroe');
const pad = (s: string | number, n: number) => String(s).padStart(n);
const all = games.map((g) => ({ g, r: byIndex.get(g.i)! }));

// ── los mazos
console.log('\nMAZOS');
for (const { g, r } of all.filter(({ g }) => !g.b[0].hero)) {
  const w = r.winner === null ? 'empate' : `gana ${DECKS[g.b[r.winner].deck].name} (${r.winner === 0 ? 'J1' : 'J2'})`;
  console.log(`  sin héroes: ${DECKS[g.b[0].deck].name} (J1, ataca en los impares) contra ${DECKS[g.b[1].deck].name} (J2): ${w}, vidas ${r.life.join(' a ')}`);
}
const cross = all.filter(({ g }) => g.b[0].hero && g.b[0].deck !== g.b[1].deck);
const salvajes = cross.reduce((a, { g, r }) => a + pts(r, g.b[0].deck === 'salvajes' ? 0 : 1), 0);
console.log(`  con héroes (cualquiera contra cualquiera): Salvajes gana ${salvajes} de ${cross.length} contra Pradera (${Math.round((100 * salvajes) / cross.length)} %)`);

// ── el asiento
const heroGames = all.filter(({ g }) => g.b[0].hero);
const j1 = heroGames.reduce((a, { r }) => a + pts(r, 0), 0);
console.log(`\nASIENTO: J1 (ataca en los impares) gana ${j1} de ${heroGames.length} (${Math.round((100 * j1) / heroGames.length)} %)`);

// ── los héroes: contra los otros nueve, con el mismo mazo y con mazos cruzados
console.log('\nHÉROES (contra los otros nueve, en los dos asientos)');
console.log(`${'héroe'.padEnd(24)}${pad('mismo mazo', 12)}${pad('Salvajes vs P', 15)}${pad('Pradera vs S', 14)}${pad('total', 9)}${pad('poder', 7)}${pad('clase', 7)}${pad('maná', 6)}${pad('descarta', 11)}${pad('espera', 10)}`);
const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, a + b))} %`;
const rows = HERO_ORDER.map((h) => {
  let same = 0, sv = 0, pv = 0, uses = 0, n = 0, cls = 0, base = 0, clsMana = 0, baseMana = 0, clsGone = 0, baseGone = 0, clsWait = 0, baseWait = 0, all = 0;
  for (const { g, r } of heroGames) {
    for (const seat of [0, 1] as const) {
      const me = g.b[seat], you = g.b[seat === 0 ? 1 : 0];
      if (me.hero !== h) continue;
      // lo que juega cuenta también en el espejo; los puntos, solo contra los otros
      cls += r.cls[seat];
      base += r.base[seat];
      clsMana += r.clsMana[seat];
      baseMana += r.baseMana[seat];
      clsGone += r.clsGone[seat];
      baseGone += r.baseGone[seat];
      clsWait += r.clsWait[seat];
      baseWait += r.baseWait[seat];
      all++;
      if (you.hero === h) continue;
      uses += r.uses[seat];
      n++;
      const p = pts(r, seat);
      if (me.deck === you.deck) same += p;
      else if (me.deck === 'salvajes') sv += p;
      else pv += p;
    }
  }
  // de cada tipo le llegan 9 de clase y 18 del mazo por partida
  const gone = `${Math.round((100 * clsGone) / (9 * all))}/${Math.round((100 * baseGone) / (18 * all))} %`;
  const wait = `${(clsWait / Math.max(1, cls)).toFixed(1)}/${(baseWait / Math.max(1, base)).toFixed(1)}`;
  return { h, same, sv, pv, total: same + sv + pv, uses: uses / n, cls: pct(cls, base), mana: pct(clsMana, baseMana), gone, wait };
}).sort((a, b) => b.total - a.total);
for (const x of rows) {
  console.log(`${name(x.h).padEnd(24)}${pad(`${x.same}/36`, 12)}${pad(`${x.sv}/18`, 15)}${pad(`${x.pv}/18`, 14)}${pad(`${x.total}/72`, 9)}${pad(x.uses.toFixed(1), 7)}${pad(x.cls, 7)}${pad(x.mana, 6)}${pad(x.gone, 11)}${pad(x.wait, 10)}`);
}
const sum = (k: 'cls' | 'base' | 'clsMana' | 'baseMana') => heroGames.reduce((a, { r }) => a + r[k][0] + r[k][1], 0);
console.log('poder: veces que lo usó por partida · clase: de las cartas que jugó, cuántas eran de clase (le llega 1 de 3) · maná: lo mismo,');
console.log('por maná · descarta: de las de clase / de las del mazo, cuántas descartó · espera: turnos en la mano antes de jugarla (clase/mazo)');
console.log(`todos: ${pct(sum('cls'), sum('base'))} de las cartas jugadas son de clase (${pct(sum('clsMana'), sum('baseMana'))} del maná)`);

// ── carta por carta: de las que le llegaron, cuántas jugó, descartó o le quedaron en la mano
if (args.includes('--cartas')) {
  const stats = new Map<string, { play: number; gone: number; kept: number; wait: number }>();
  for (const { r } of heroGames) {
    for (const f of r.fates) {
      const x = stats.get(f.id) ?? { play: 0, gone: 0, kept: 0, wait: 0 };
      x[f.fate]++;
      x.wait += f.wait;
      stats.set(f.id, x);
    }
  }
  const line = (id: string) => {
    const x = stats.get(id) ?? { play: 0, gone: 0, kept: 0, wait: 0 };
    const n = Math.max(1, x.play + x.gone + x.kept);
    const c = card(id);
    const what = c.kind === 'spell' ? 'hechizo' : cardStats(c);
    return `  T${c.rank} ${c.name.padEnd(26)}${pad(`${Math.round((100 * x.play) / n)} %`, 7)}${pad(`${Math.round((100 * x.gone) / n)} %`, 7)}${pad(`${Math.round((100 * x.kept) / n)} %`, 7)}${pad((x.wait / Math.max(1, x.play)).toFixed(1), 7)}   ${what}`;
  };
  console.log(`\nCARTA POR CARTA: de las veces que le llegó, jugada · descartada · le quedó · turnos que esperó (lo parejo: un tercio descartadas)`);
  for (const h of HERO_ORDER) {
    console.log(`${name(h)}`);
    for (const id of HEROES[h].cards) console.log(line(id));
  }
  for (const d of DECK_IDS) {
    console.log(`${DECKS[d].name}`);
    for (const ids of DECKS[d].turns) for (const id of ids) console.log(line(id));
  }
}

// ── quién le gana a quién: partidas de 8 (los dos mazos de cada uno, los dos asientos)
console.log('\nCADA HÉROE (fila) CONTRA CADA OTRO (columna): ganadas de 8\n');
const abbr = (h: string) => HEROES[h].name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase().padStart(4);
console.log(`${''.padEnd(24)}${HERO_ORDER.map(abbr).join('')}`);
for (const a of HERO_ORDER) {
  const cells = HERO_ORDER.map((b) => {
    if (a === b) return '   ·';
    let w = 0;
    for (const { g, r } of heroGames) {
      for (const seat of [0, 1] as const) if (g.b[seat].hero === a && g.b[seat === 0 ? 1 : 0].hero === b) w += pts(r, seat);
    }
    return pad(w, 4);
  });
  console.log(`${name(a).padEnd(24)}${cells.join('')}`);
}
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s)`);
