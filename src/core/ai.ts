// Una IA simple que juega con el mismo motor, simulando.
// - Ataques y poder del héroe: codiciosa. Hace la jugada (un ataque o usar el poder) que más mejora la
//   evaluación, hasta que ninguna la mejore. La energía vale algo, así que espera si el poder todavía no
//   rinde (por ejemplo, para que la Explosión de fuego mate en vez de lastimar).
// - Objetivos: prueba cada uno y se queda con el que deja mejor el turno.
// - Cartas: sin mano, minimax de dos turnos (este y el siguiente) sobre las 3×3 combinaciones. Con mano
//   hay muchas jugadas (cada grupo de cartas que entra en el maná): se queda con las 5 que mejor dejan la
//   mesa de cada lado y mira solo este turno, con lo que vale guardar cartas en la mano. De la mano del
//   rival no mira nada: supone que tiene todo lo que le llegó y no jugó.
// - Descarte: tira la nueva que menos le serviría: prueba cada una sola, con sus efectos, ahora y contra
//   la unidad más grande que el rival puede jugar el turno siguiente.
// - Lugar en la fila: si la carta tiene un efecto que depende de la posición, prueba cada lugar; si no,
//   la pone en la punta derecha.
// Sirve de rival de prueba y para el simulador, no para jugar bien de verdad.
import { card } from './cards';
import {
  attack, attackTargets, canAttack, candidates, canUsePower, chooseTarget, clone, discard, discarders, endCombat, faceValue, freshCards, mana, options, pendingFace, play,
  powerTargets, SUMMON_TURNS, summonUnit, turnOptions, usePower,
} from './rules';
import type { Play, Side, State, TargetKind, Unit } from './types';
import { emptyDamage, totalDamage } from './weapons';

const EMPTY = emptyDamage();

const POSITIONAL: TargetKind[] = ['adjacent', 'leftAllies', 'rightAllies', 'selfAtEdge'];

/** Cuánto vale cada punto de energía guardado (para no gastar el poder en algo que rinde poco). */
const ENERGY_VALUE = 0.5;

/** Cuánto vale tener una carta en la mano para después: menos que jugarla (el maná que no usás se pierde). */
const HAND_BASE = 0.4;
const HAND_RANK = 0.3;

/** Con mano, de cuántas jugadas por lado se queda para el minimax. */
const TOP_PLAYS = 5;

/** Si dónde entra la carta cambia lo que hace (un aura, un efecto a las de los costados). */
function positional(id: string): boolean {
  const c = card(id);
  return c.kind === 'unit' && (!!c.aura || (c.effects?.onSummon ?? []).some((e) => 'target' in e && POSITIONAL.includes(e.target)));
}

/** Dónde pone `me` la carta `index` de su mano: el lugar de la fila que deja mejor la mesa. */
export function choosePlace(s: State, me: Side, index: number): number {
  const id = options(s, me)[index];
  const n = s.players[me].board.length;
  if (!positional(id) || n === 0) return n;
  let best = n, bestV = -Infinity;
  for (let at = 0; at <= n; at++) {
    const t = clone(s);
    summonUnit(t, me, id, true, at);
    const v = evaluate(t, me);
    if (v > bestV) {
      bestV = v;
      best = at;
    }
  }
  return best;
}

const DEPTH = 2;

const other = (j: Side): Side => (j === 0 ? 1 : 0);

/**
 * Cuánto vale una unidad. Cuando se pelea hasta 0 (atacando al héroe, o con las que no atacan pegándole
 * solas), lo que pega pesa más: cada carta viva es daño a la vida en los turnos que vienen (y sacarle una
 * al rival es daño que no vas a recibir).
 */
function unitValue(s: State, u: Unit): number {
  // lo que pega cuenta distinto según cuándo: la lanza pega antes y el arco sin respuesta
  const d = u.dmg;
  // lo de las Garras se va al terminar el turno (y lo que pega a la vida ya cuenta aparte)
  const hit = 0.9 * d.bow + 1.1 * d.spear + Math.max(0, d.attack - u.bonus) + d.sword + d.axe + d.mace + 0.9 * d.knife;
  const race = s.cfg.scoring === 'hero' || s.cfg.scoring === 'face';
  let v = (race ? 0.5 : 1) * u.rank + (race ? 1.1 : 0.4) * hit + 0.35 * u.hp;
  if (u.shield > 0) v += 0.8 + 0.4 * u.shield;
  v += 0.6 * u.armor;
  if (u.guard) v += 0.3;
  if (u.poison) v += 1.5;
  if (u.lifesteal) v += 0.4 * hit;
  // con Sigilo no la pueden atacar: lo que pega está a salvo hasta que ataca
  if (u.stealth) v += 0.6 + 0.15 * hit;
  if (u.rush) v += 0.2;
  if (u.frozen) v -= 0.5 * hit; // pierde un combate
  if (u.lastStand) v += 1;
  if (!u.silenced) {
    const c = card(u.card);
    const fx = c.effects;
    // el Necrófago muere solo al terminar el turno: no vale como carta en la mesa
    if (fx?.endTurn?.some((e) => e.type === 'destroy' && e.target === 'self')) return 0.2;
    if (fx?.endTurn) v += 2; // crece o invoca todos los turnos: hay que sacarla
    if (fx?.onDamaged) v += 0.5;
    // un Último aliento que invoca deja eso en la mesa
    const heirs = (fx?.onDeath ?? []).reduce((a, e) => {
      if (e.type !== 'summon') return a;
      const t = card(e.card);
      return a + (t.kind === 'unit' ? e.count * (totalDamage({ ...EMPTY, ...t.dmg }) + t.hp) : 0);
    }, 0);
    if (fx?.onDeath) v += Math.max(1, 0.5 * heirs);
    if (fx?.onFace || fx?.onAllyDeath || fx?.onPower) v += 0.8;
    if (c.kind === 'unit' && c.powerBonus) v += 1.2 * c.powerBonus;
    if (c.kind === 'unit' && c.powerPoison) v += 1.5;
    if (c.kind === 'unit' && c.aura) v += 0.5; // lo que da ya está en las de los costados
  }
  v += 0.3 * (u.maxEnergy - 1) * hit;
  if (u.evolves) v += 0.6 * (card(u.evolves.into).rank - u.rank);
  return v;
}

/** Qué tan bien está `me`. Al final, lo que cuenta es la diferencia de vida. */
export function evaluate(s: State, me: Side): number {
  const you = other(me);
  if (s.phase === 'end' && s.result) {
    const r = s.result;
    return 100 * (r.life[me] - r.life[you]) + (r.winner === me ? 1000 : r.winner === you ? -1000 : 0);
  }
  let v = s.players[me].life - s.players[you].life;
  // la energía es poder para después
  // (con el poder que cuesta maná, el maná que queda y el que dieron las cartas para el turno siguiente)
  const energy = (j: Side) => {
    const p = s.players[j];
    if (s.cfg.powerMode === 'mana') return p.energy + p.boost;
    return p.hero && s.cfg.powerMode !== 'off' ? p.energy : 0;
  };
  v += ENERGY_VALUE * (energy(me) - energy(you));
  // con mano, lo que queda para después
  if (s.cfg.cards === 'hand') v += handValue(s, me) - handValue(s, you);
  // en combate, lo que todavía le pegarían a la vida las que no atacaron cuenta como hecho
  if (s.phase === 'combat') v += (s.attacker === me ? 1 : -1) * pendingFace(s);
  // atacando al héroe a mano, lo que dura solo este turno (las Garras, el Necrófago) vale mientras
  // todavía pueda atacar; un poco menos que pegar, así después ataca
  if (s.phase === 'combat' && s.cfg.scoring === 'hero') v += (s.attacker === me ? 1 : -1) * TEMP_VALUE * pendingTemp(s);
  for (const u of s.players[me].board) v += unitValue(s, u);
  for (const u of s.players[you].board) v -= unitValue(s, u);
  return v;
}

/** Cuánto vale lo que dura solo este turno, por punto de daño, si todavía puede atacar. */
const TEMP_VALUE = 0.8;

/** Lo que el que ataca tiene solo por este turno en unidades que todavía pueden atacar: el daño de más y las que mueren al terminar. */
function pendingTemp(s: State): number {
  let n = 0;
  for (const u of s.players[s.attacker].board) {
    if (!canAttack(s, u.uid)) continue;
    n += u.bonus;
    if (!u.silenced && card(u.card).effects?.endTurn?.some((e) => e.type === 'destroy' && e.target === 'self')) n += faceValue(s, u);
  }
  return n;
}

function handValue(s: State, j: Side): number {
  return s.players[j].hand.reduce((a, c) => a + HAND_BASE + HAND_RANK * card(c.id).rank, 0);
}

/** Una jugada del combate: un ataque, o usar el poder del héroe (con su objetivo, si lo pide). */
export type Move = { kind: 'attack'; a: number; d: number } | { kind: 'power'; target: number | null };

export function applyMove(s: State, m: Move): void {
  if (m.kind === 'attack') attack(s, m.a, m.d);
  else usePower(s, s.attacker, m.target);
}

/**
 * La jugada que más mejora la evaluación del que ataca, o null si ninguna la mejora. Un poder que le da
 * algo a una unidad tuya (las Garras) se mide junto con el mejor ataque de esa unidad después: si no,
 * convendría atacar primero y el poder ya no serviría.
 */
export function bestMove(s: State): Move | null {
  if (s.phase !== 'combat') return null;
  const me = s.attacker;
  let best: Move | null = null;
  let bestV = evaluate(s, me) + 0.05;
  const consider = (m: Move) => {
    const c = clone(s);
    applyMove(c, m);
    let v = evaluate(c, me);
    if (m.kind === 'power' && m.target !== null && m.target > 0 && c.players[me].board.some((u) => u.uid === m.target)) {
      for (const d of attackTargets(c, m.target)) {
        const t = clone(c);
        attack(t, m.target, d);
        v = Math.max(v, evaluate(t, me));
      }
    }
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  };
  for (const u of s.players[me].board) {
    for (const d of attackTargets(s, u.uid)) consider({ kind: 'attack', a: u.uid, d });
  }
  if (canUsePower(s, me)) {
    for (const target of powerTargets(s, me) ?? [null]) consider({ kind: 'power', target });
  }
  return best;
}

/** Juega mientras convenga y termina el combate. */
export function playCombat(s: State): void {
  for (let m = bestMove(s); m; m = bestMove(s)) applyMove(s, m);
  if (s.phase === 'combat') endCombat(s);
}

/** Elige objetivo mirando solo cómo queda la mesa justo después (barato, para dentro de simulaciones). */
function quickTarget(s: State): number {
  const p = s.pending!;
  let best = p.options[0], bestV = -Infinity;
  for (const uid of p.options) {
    const c = clone(s);
    chooseTarget(c, p.player, uid);
    const v = evaluate(c, p.player);
    if (v > bestV) {
      bestV = v;
      best = uid;
    }
  }
  return best;
}

function resolvePending(s: State): void {
  while (s.phase === 'target' && s.pending) chooseTarget(s, s.pending.player, quickTarget(s));
}

/** Elige objetivo jugando el resto del turno con cada opción. */
export function choosePendingTarget(s: State): number {
  const p = s.pending!;
  let best = p.options[0], bestV = -Infinity;
  for (const uid of p.options) {
    const c = clone(s);
    chooseTarget(c, p.player, uid);
    resolvePending(c);
    if (c.phase === 'combat') playCombat(c);
    const v = evaluate(c, p.player);
    if (v > bestV) {
      bestV = v;
      best = uid;
    }
  }
  return best;
}

/** Las jugadas posibles de `j`: cada grupo de cartas de su mano que entra en el maná (sin mano, cada carta). */
function plays(s: State, j: Side): number[][] {
  const hand = s.players[j].hand;
  if (s.cfg.cards === 'turn') return hand.map((_, i) => [i]);
  const out: number[][] = [];
  const seen = new Set<string>();
  const walk = (i: number, cur: number[], left: number) => {
    if (i === hand.length) {
      // dos copias de la misma carta dan la misma jugada
      const key = cur.map((k) => hand[k].id).sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(cur);
      }
      return;
    }
    walk(i + 1, cur, left);
    const r = card(hand[i].id).rank;
    if (r <= left) walk(i + 1, [...cur, i], left - r);
  };
  walk(0, [], mana(s, j));
  // primero los efectos de las unidades y después los hechizos
  const spell = (i: number) => (card(hand[i].id).kind === 'spell' ? 1 : 0);
  return out.map((p) => [...p].sort((x, y) => spell(x) - spell(y)));
}

/** La jugada con el lugar de cada unidad: las que dependen de la posición, donde mejor quedan; las demás, a la derecha. */
function toPlay(s: State, j: Side, cards: number[], placeOf: (i: number) => number): Play {
  const row: number[] = s.players[j].board.map(() => -1);
  cards.forEach((i, k) => {
    const id = s.players[j].hand[i].id;
    if (card(id).kind !== 'unit') return;
    row.splice(positional(id) ? Math.min(placeOf(i), row.length) : row.length, 0, k);
  });
  return { cards, places: cards.map((_, k) => row.indexOf(k)) };
}

/** Cómo queda la mesa de `j` justo después de jugar eso (el otro no juega nada): para descartar jugadas malas. */
function quickValue(s: State, j: Side, p: Play): number {
  const c = clone(s);
  c.picks[j] = null;
  c.picks[other(j)] = { cards: [], places: [] };
  play(c, j, p.cards, p.places);
  resolvePending(c);
  return evaluate(c, j);
}

/** Las jugadas de `j` que se prueban: sin mano, todas; con mano, las que mejor dejan la mesa. */
function movesFor(s: State, j: Side): Play[] {
  const places = new Map<number, number>();
  const placeOf = (i: number) => {
    if (!places.has(i)) places.set(i, choosePlace(s, j, i));
    return places.get(i)!;
  };
  const all = plays(s, j).map((cards) => toPlay(s, j, cards, placeOf));
  if (s.cfg.cards === 'turn') return all;
  // ordenadas aunque sean pocas: si después empatan (la partida ya está decidida), gana la que mejor deja la mesa
  return all.map((p) => ({ p, v: quickValue(s, j, p) })).sort((x, y) => y.v - x.v).slice(0, TOP_PLAYS).map((x) => x.p);
}

/**
 * Lo que vale una carta para guardarla, barato (para dentro de las simulaciones): una unidad, lo que
 * valdría en la mesa sin sus efectos; un hechizo, según su turno.
 */
function quickKeep(s: State, j: Side, id: string): number {
  if (card(id).kind === 'spell') return 1 + 1.6 * card(id).rank;
  const c = clone(s);
  return unitValue(c, summonUnit(c, j, id, false));
}

/** Lo que ganaría `j` jugando ahora sola la carta `index` de su mano, con sus efectos y el mejor objetivo. */
function playGain(s: State, j: Side, index: number): number {
  const c = clone(s);
  c.phase = 'pick';
  c.discards = [null, null];
  c.picks = [null, null];
  c.picks[other(j)] = { cards: [], places: [] };
  const id = c.players[j].hand[index].id;
  c.players[j].energy = Math.max(c.players[j].energy, card(id).rank);
  const places = card(id).kind === 'unit' ? [choosePlace(c, j, index)] : [];
  const before = evaluate(c, j);
  play(c, j, [index], places);
  resolvePending(c);
  // si ataca este turno, también lo que hace atacando (la Carga, la Embestida)
  if ((c as State).phase === 'combat' && c.attacker === j) playCombat(c);
  return evaluate(c, j) - before;
}

/** Cuánto vale la amenaza que se supone (lo que pueda jugar el rival) frente a jugar ahora. */
const THREAT_WEIGHT = 1;

/**
 * Lo que vale una carta para guardarla: lo que ganaría jugándola ahora o, si es mejor, después de que el
 * rival juegue la unidad más grande que puede tener para su turno siguiente (una remoción se guarda para
 * eso). Las nuevas son todas del mismo turno (cuestan lo mismo), así que se comparan bien.
 */
function keepValue(s: State, j: Side, index: number): number {
  const now = playGain(s, j, index);
  const you = other(j), reach = Math.min(s.turn + 1, SUMMON_TURNS);
  // lo que puede tener (lo que le llegó y no jugó) y lo que le llega el turno siguiente (los mazos se ven)
  const pool = [...candidates(s, you).map((c) => c.id), ...(s.turn < SUMMON_TURNS ? turnOptions(s.players[you], s.turn + 1) : [])];
  let threat: string | null = null;
  for (const id of pool) {
    const k = card(id);
    if (k.kind !== 'unit' || k.rank > reach) continue;
    if (!threat || k.rank > card(threat).rank) threat = id;
  }
  if (!threat) return now;
  const t = clone(s);
  summonUnit(t, you, threat, false);
  return Math.max(now, THREAT_WEIGHT * playGain(t, j, index));
}

/** Qué nueva descarta `j`: la que menos le serviría jugada ahora. */
export function chooseDiscard(s: State, j: Side): number {
  return pickDiscard(s, j, (i) => keepValue(s, j, i));
}

function pickDiscard(s: State, j: Side, value: (index: number) => number): number {
  const fresh = freshCards(s, j);
  let best = fresh[0], bestV = Infinity;
  for (const i of fresh) {
    const v = value(i);
    if (v < bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

/** Descartan los que falten: con `quick`, barato (dentro de las simulaciones, donde casi no cambia nada). */
function discardAll(s: State, quick = true): void {
  while (s.phase === 'discard') {
    for (const j of discarders(s)) discard(s, j, quick ? pickDiscard(s, j, (i) => quickKeep(s, j, s.players[j].hand[i].id)) : chooseDiscard(s, j));
  }
}

/** Juega el turno actual con esas jugadas (null: ya eligió) y devuelve cómo arranca el siguiente. */
function simulateTurn(s: State, a: Play | null, d: Play | null): State {
  const c = clone(s);
  const A = c.attacker, D = other(A);
  if (c.phase === 'pick') {
    if (c.picks[A] === null && a) play(c, A, a.cards, a.places);
    if (c.phase === 'pick' && c.picks[D] === null && d) play(c, D, d.cards, d.places);
  }
  resolvePending(c);
  if (c.phase === 'combat') playCombat(c);
  discardAll(c);
  return c;
}

function grid(s: State, me: Side, depth: number): { a: Play | null; row: { d: Play | null; v: number }[] }[] {
  const A = s.attacker, D = other(A);
  const optsA: (Play | null)[] = s.picks[A] !== null ? [null] : movesFor(s, A);
  const optsD: (Play | null)[] = s.picks[D] !== null ? [null] : movesFor(s, D);
  return optsA.map((a) => ({ a, row: optsD.map((d) => ({ d, v: valueOf(simulateTurn(s, a, d), me, depth - 1) })) }));
}

/** Cuánto vale una posición al inicio de un turno para `me`, si los dos juegan bien. */
function valueOf(s: State, me: Side, depth: number): number {
  if (s.phase === 'end' || depth === 0) return evaluate(s, me);
  if (s.phase === 'combat') {
    const c = clone(s);
    playCombat(c);
    discardAll(c);
    return valueOf(c, me, depth - 1);
  }
  const rows = grid(s, me, depth);
  const A = s.attacker;
  const minD = rows.map((r) => Math.min(...r.row.map((x) => x.v)));
  if (A === me) return Math.max(...minD);
  if (s.cfg.pickMode === 'sequential') return Math.min(...rows.map((r) => Math.max(...r.row.map((x) => x.v))));
  const cols = rows[0].row.map((_, k) => Math.min(...rows.map((r) => r.row[k].v)));
  return Math.max(...cols);
}

/** Qué juega `me` este turno: qué cartas de su mano y dónde va cada unidad. */
export function choosePlay(s: State, me: Side): Play {
  const you = other(me);
  let base = s;
  if (s.cfg.pickMode === 'simultaneous' || s.picks[you] === null) {
    // no mirar lo que eligió el otro, ni su mano: solo lo que sabe (lo que le llegó y no jugó)
    base = clone(s);
    base.picks[you] = null;
    if (s.cfg.cards === 'hand') {
      base.players[you].hand = candidates(s, you);
      base.players[you].gone = [];
    }
  }
  // sin mano se mira también el turno siguiente; con mano son demasiadas jugadas
  const rows = grid(base, me, s.cfg.cards === 'turn' ? DEPTH : 1);
  let best: Play | null = null, bestV = -Infinity;
  const consider = (p: Play | null, v: number) => {
    if (p && v > bestV) {
      bestV = v;
      best = p;
    }
  };
  if (base.attacker === me) {
    // ataco: el mejor peor caso (el defensor responde, o elige a ciegas)
    for (const r of rows) consider(r.a, Math.min(...r.row.map((x) => x.v)));
  } else if (base.cfg.pickMode === 'sequential') {
    for (const x of rows[0].row) consider(x.d, x.v);
  } else {
    for (let k = 0; k < rows[0].row.length; k++) consider(rows[0].row[k].d, Math.min(...rows.map((r) => r.row[k].v)));
  }
  return best ?? { cards: [], places: [] };
}

/** Sin mano: qué carta (0, 1 o 2) juega `me` este turno. */
export function choosePick(s: State, me: Side): number {
  return choosePlay(s, me).cards[0] ?? 0;
}

/** Juega una partida entera IA contra IA (para el simulador y los tests). */
export function playOut(s: State): void {
  for (let guard = 0; guard < 1000 && s.phase !== 'end'; guard++) {
    if (s.phase === 'pick') {
      const A = s.attacker, D = other(A);
      const j = s.picks[A] === null ? A : D;
      const p = choosePlay(s, j);
      play(s, j, p.cards, p.places);
    } else if (s.phase === 'discard') {
      discardAll(s, false);
    } else if (s.phase === 'target') {
      chooseTarget(s, s.pending!.player, choosePendingTarget(s));
    } else if (s.phase === 'combat') {
      playCombat(s);
    }
  }
}
