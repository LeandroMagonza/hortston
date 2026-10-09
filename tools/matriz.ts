// La matriz de cada turno:  npm run matriz [-- salvajes pradera 4 [mago cazador]]
//
// Cada turno de cartas es un juego simultáneo de 3×3: los dos eligen a la vez una de sus tres cartas (4
// en el turno de la carta de clase, si juegan con héroe). Es el modelo sin mano: juega con `cards: 'turn'`.
// Para cada par (i, j) se juega el resto de la partida con la IA (IA contra IA, sin azar) y se anota el
// resultado para J1: diferencia de vida al final, ±100 por ganar o perder. Con esa tabla se calcula la
// estrategia mixta óptima de cada uno (el equilibrio de un juego de suma cero): con qué probabilidad
// conviene elegir cada carta si el otro también juega lo mejor posible.
//
// Una carta con 0% es una carta que, en esa posición, nunca conviene: o le gana otra en todos los casos,
// o no le gana a nada que el otro quiera jugar. El objetivo de diseño es que en cada turno las tres
// tengan peso. Ojo: la tabla depende de la mesa con la que se llega a ese turno (se sigue la partida que
// juega la IA) y de cómo juega la IA, que no es perfecta.
import { applyMove, bestMove, choosePendingTarget, choosePick, choosePlace, playOut } from '../src/core/ai';
import { card, DECKS } from '../src/core/cards';
import { chooseTarget, clone, endCombat, newGame, options, pick } from '../src/core/rules';
import type { State } from '../src/core/types';

const [d0 = 'salvajes', d1 = 'pradera', upTo = '4', h0 = '', h1 = ''] = process.argv.slice(2);
const TURNS = Number(upTo);

function payoff(s: State): number {
  const r = s.result!;
  return r.life[0] - r.life[1] + (r.winner === 0 ? 100 : r.winner === 1 ? -100 : 0);
}

/** Lo que pasa si este turno J1 juega `i` y J2 juega `j`, y después juegan los dos con la IA. */
function outcome(s: State, i: number, j: number): number {
  const c = clone(s);
  pick(c, 0, i, choosePlace(c, 0, i));
  pick(c, 1, j, choosePlace(c, 1, j));
  playOut(c);
  return payoff(c);
}

/** Todas las mezclas de `n` cartas con probabilidades de a `1/steps`. */
function* mixes(n: number, steps: number, left = steps): Generator<number[]> {
  if (n === 1) {
    yield [left / steps];
    return;
  }
  for (let k = 0; k <= left; k++) for (const rest of mixes(n - 1, steps, left - k)) yield [k / steps, ...rest];
}

/** La estrategia mixta que maximiza lo peor que le puede pasar a quien elige filas (búsqueda en grilla). */
function maximin(m: number[][]): { p: number[]; v: number } {
  let best = { p: m.map((_, i): number => (i === 0 ? 1 : 0)), v: -Infinity };
  for (const p of mixes(m.length, m.length > 3 ? 20 : 50)) {
    const v = Math.min(...m[0].map((_, k) => p.reduce((a, q, i) => a + q * m[i][k], 0)));
    if (v > best.v + 1e-9) best = { p, v };
  }
  return best;
}

/** Juega con la IA lo que falta del turno (objetivos y combate). */
function finishTurn(g: State): void {
  const turn = g.turn;
  for (let k = 0; k < 200 && g.phase !== 'end' && g.turn === turn; k++) {
    if (g.phase === 'target') chooseTarget(g, g.pending!.player, choosePendingTarget(g));
    else if (g.phase === 'combat') {
      for (let m = bestMove(g); m; m = bestMove(g)) applyMove(g, m);
      if (g.phase === 'combat') endCombat(g);
    } else break;
  }
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
const name = (id: string) => card(id).name;

const s = newGame({ decks: [DECKS[d0], DECKS[d1]], names: ['J1', 'J2'], heroes: [h0 || null, h1 || null], config: { cards: 'turn' } });
s.quiet = true;
const t0 = Date.now();
const who = (d: string, h: string) => `${d}${h ? ` con ${h}` : ''}`;
console.log(`J1 ${who(d0, h0)} (ataca en los impares) contra J2 ${who(d1, h1)}. Resultado para J1: diferencia de vida, ±100 por ganar.\n`);
while (s.phase === 'pick' && s.turn <= TURNS) {
  const rows = options(s, 0), cols = options(s, 1);
  const m = rows.map((_, i) => cols.map((__, j) => outcome(s, i, j)));
  const row = maximin(m);
  const col = maximin(m[0].map((_, j) => m.map((r) => -r[j])));
  const w = Math.max(...cols.map((id) => name(id).length), 6) + 2;
  console.log(`== Turno ${s.turn} · ataca ${s.attacker === 0 ? 'J1' : 'J2'} ==`);
  console.log(`${'J1 \\ J2'.padEnd(14)}${cols.map((id) => name(id).padStart(w)).join('')}   J1 la juega`);
  m.forEach((r, i) => console.log(`${name(rows[i]).padEnd(14)}${r.map((v) => String(v).padStart(w)).join('')}   ${pct(row.p[i]).padStart(4)}`));
  console.log(`${'J2 la juega'.padEnd(14)}${col.p.map((x) => pct(x).padStart(w)).join('')}`);
  console.log(`valor del turno para J1: ${Math.round(row.v)}\n`);
  // la partida sigue con lo que eligen las IA
  const a = choosePick(s, 0), b = choosePick(s, 1);
  pick(s, 0, a, choosePlace(s, 0, a));
  pick(s, 1, b, choosePlace(s, 1, b));
  finishTurn(s);
}
console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
