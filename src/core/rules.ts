// El motor de reglas. Sin azar: el mismo estado y las mismas decisiones dan siempre lo mismo.
//
// Un turno de cartas (1 a 9):
// 1. Inicio: llegan a la mano las tres cartas del turno y, con mano, cada uno descarta una de ellas, en
//    secreto ('discard'). Evolucionan las que corresponda, se recarga el maná (y el escudo, si se renueva).
// 2. Elección: cada uno elige qué cartas de su mano juega, mientras sumen hasta el maná (el número del
//    turno; cada carta cuesta su turno), y dónde va cada unidad en su fila. Sin mano (`cards: 'turn'`),
//    una de las tres del turno. En simultánea (la regla por defecto), los dos a ciegas; en secuencial,
//    el atacante elige a la vista y el defensor responde.
// 3. Resolución: entran al tablero las unidades de los dos, y después se resuelven los efectos («al
//    invocar» y hechizos), en orden: primero las del atacante (o las de quien juegue algo Rápido) y si no,
//    según la configuración. Así el efecto de cada uno puede apuntarle a la carta que acaba de jugar el
//    otro. Si la carta tiene un objetivo a elección, el juego espera a que su dueño lo elija ('target').
// 4. Combate: solo ataca el atacante del turno, cada unidad una vez por punto de energía (o hasta
//    `maxAttacks` en total), a una unidad enemiga o al héroe rival. La que acaba de entrar no ataca ese
//    turno, salvo con Carga (`summonSick`). Atacar es opcional. El defensor no decide nada.
// 5. Tras el combate: se disparan los «tras el combate» de las que pelearon y siguen vivas.
// Vida (ver `Config.scoring`): por defecto, como en Hearthstone: una unidad que ataca al héroe rival le
// pega su daño a la vida (el héroe no devuelve el golpe), salvo que el rival tenga un Guardián. Después
// del turno 9 no hay más cartas nuevas y se sigue peleando hasta que alguien llega a 0 (con mano, se
// puede jugar lo que quedó); desde la ronda 10, cansancio: los dos pierden 1, después 2, 3… Gana el que
// queda con vida (o con más vida, si llegan a 0 a la vez).
// Héroes (ver heroes.ts): en su combate puede usar el poder, una vez, por 1 del maná que no gastó en
// cartas (con las reglas en prueba, con energía aparte). Sus cartas de clase son una tercera carta que
// le llega en cada turno.
import { card, unitCard } from './cards';
import { ENERGY_MAX, healOf, hero, HEROES, POWER_MIN, powerCost, TOTEMS } from './heroes';
import type {
  Config, Deck, Effect, GameEvent, HandCard, Keyword, LogEntry, PendingTarget, PlayerState, QueuedPlay, Side, State, TargetKind, TurnRecord, Trigger, Unit,
  UnitTag, Weapon,
} from './types';
import { emptyDamage, totalDamage, triadOf, triadOrder, WEAPON_ORDER, WEAPONS } from './weapons';

export const SUMMON_TURNS = 9;

export const DEFAULT_CONFIG: Config = {
  pickMode: 'simultaneous',
  firstAttacker: 0,
  firstToResolve: 'attacker',
  shieldRenews: false,
  shieldBreak: 'absorb',
  scoring: 'hero',
  faceValue: 'attack',
  extraRounds: 1,
  startingLife: 30,
  summonSick: true,
  maxAttacks: 0,
  powerMode: 'mana',
  priestHeal: 'plus1',
  cards: 'hand',
};

/** Quién causó un efecto: una unidad, o un hechizo (sin unidad). */
interface Source {
  owner: Side;
  name: string;
  unit: Unit | null;
}

interface Ctx {
  rival?: Unit;
  chosen?: number | null;
  /** Dónde estaba la que disparó el efecto (para que las fichas de un Último aliento salgan ahí). */
  at?: number;
}

// ───────────────────────── utilidades ─────────────────────────

const other = (j: Side): Side => (j === 0 ? 1 : 0);

function log(s: State, text: string, tone: LogEntry['tone'] = ''): void {
  if (!s.quiet) s.log.push({ turn: s.turn, text, tone });
}

function emit(s: State, e: GameEvent): void {
  if (!s.quiet) s.events.push(e);
}

/** Copia profunda para simular. La copia sale sin log ni eventos y en modo silencioso. */
export function clone(s: State): State {
  const { log: l, events: e } = s;
  s.log = [];
  s.events = [];
  const c = JSON.parse(JSON.stringify(s)) as State;
  s.log = l;
  s.events = e;
  c.quiet = true;
  return c;
}

/** Copia profunda completa, con log y eventos (para deshacer). */
export function snapshot(s: State): State {
  return JSON.parse(JSON.stringify(s)) as State;
}

function allUnits(s: State): Unit[] {
  const a = s.attacker;
  return [...s.players[a].board, ...s.players[other(a)].board];
}

export function unitById(s: State, uid: number): Unit | null {
  return allUnits(s).find((u) => u.uid === uid) ?? null;
}

function alive(s: State, u: Unit): boolean {
  return s.players[u.owner].board.includes(u);
}

/** El golpe final de un jugador si la partida terminara ahora: la suma de rangos de sus unidades. */
export function boardPower(s: State, j: Side): number {
  return s.players[j].board.reduce((a, u) => a + u.rank, 0);
}

export function isSummonTurn(s: State): boolean {
  return s.turn <= SUMMON_TURNS;
}

/** El último turno posible. Si se pelea hasta 0, el cansancio termina la partida antes de este tope. */
export function lastTurn(s: State): number {
  return s.cfg.scoring === 'final' ? SUMMON_TURNS + s.cfg.extraRounds : SUMMON_TURNS + 60;
}

/** Lo que una unidad le pega a la vida, y lo que cuenta en la mesa: su daño (todas sus armas) o su nivel. */
export function faceValue(s: State, u: Unit): number {
  return s.cfg.scoring !== 'final' && s.cfg.faceValue === 'rank' ? u.rank : totalDamage(u.dmg);
}

/** Lo que vale la mesa de un jugador para la regla de la diferencia. */
export function tablePower(s: State, j: Side): number {
  return s.players[j].board.reduce((a, u) => a + faceValue(s, u), 0);
}

/** El rival de `j` tiene un Guardián (sin Sigilo): frena los golpes a la vida. */
export function faceBlocked(s: State, j: Side): boolean {
  return s.players[other(j)].board.some((u) => u.guard && !u.stealth);
}

/**
 * Con la regla de antes (`scoring: 'face'`): las del que ataca que le pegarían a la vida si el combate
 * terminara ahora, con cuánto cada una.
 */
export function faceHits(s: State): { unit: Unit; amount: number }[] {
  if (s.cfg.scoring !== 'face' || s.phase !== 'combat' || faceBlocked(s, s.attacker)) return [];
  const out: { unit: Unit; amount: number }[] = [];
  for (const u of s.players[s.attacker].board) {
    if (u.energy <= 0 || u.frozen || (s.cfg.summonSick && u.summonedTurn === s.turn && !u.charge)) continue;
    const n = faceValue(s, u) * u.energy;
    if (n > 0) out.push({ unit: u, amount: n });
  }
  return out;
}

/** Lo que le pegarían a la vida las que todavía no atacaron. */
export function pendingFace(s: State): number {
  return faceHits(s).reduce((a, h) => a + h.amount, 0);
}

export function attackerOf(cfg: Config, turn: number): Side {
  return turn % 2 === 1 ? cfg.firstAttacker : other(cfg.firstAttacker);
}

function signed(n: number): string {
  return (n < 0 ? '−' : '+') + Math.abs(n);
}

// ───────────────────────── partida ─────────────────────────

export function newGame(opts: { decks: [Deck, Deck]; names: [string, string]; heroes?: [string | null, string | null]; config?: Partial<Config> }): State {
  const cfg: Config = { ...DEFAULT_CONFIG, ...opts.config };
  const players = ([0, 1] as const).map((j) => {
    const h = opts.heroes?.[j] ?? null;
    if (h !== null) hero(h);
    return {
      name: opts.names[j],
      deck: opts.decks[j].name,
      turns: opts.decks[j].turns.map((ids) => [...ids]),
      hand: [],
      gone: [],
      board: [],
      graveyard: [],
      life: cfg.startingLife,
      hero: h,
      energy: 0,
      boost: 0,
      usedTurn: 0,
      totems: 0,
    };
  });
  const s: State = {
    cfg,
    turn: 0,
    phase: 'pick',
    attacker: cfg.firstAttacker,
    players: [players[0], players[1]],
    picks: [null, null],
    queue: null,
    chosen: [null, null],
    pending: null,
    discards: [null, null],
    history: [],
    record: [],
    attacksMade: 0,
    nextUid: 1,
    log: [],
    events: [],
    quiet: false,
    result: null,
  };
  startTurn(s);
  return s;
}

function startTurn(s: State): void {
  s.turn++;
  if (s.turn > lastTurn(s)) return finish(s);
  const final = s.cfg.scoring === 'final';
  if (final && !isSummonTurn(s) && (s.players[0].board.length === 0 || s.players[1].board.length === 0)) return finish(s);
  s.attacker = attackerOf(s.cfg, s.turn);
  const summon = isSummonTurn(s);
  log(s, summon ? `Turno ${s.turn}: ataca ${s.players[s.attacker].name}` : `Ronda ${s.turn} (sin cartas): ataca ${s.players[s.attacker].name}`, 'turn');
  if (!s.quiet) {
    const lifeStart: [number, number] = [s.players[0].life, s.players[1].life];
    s.record.push({ turn: s.turn, attacker: s.attacker, plays: [[], []], attacks: [], powers: [], units: null, power: null, lifeStart, life: null });
  }
  emit(s, { kind: 'turn', turn: s.turn, attacker: s.attacker, summon });
  if (!final && !summon) {
    // cansancio: sin cartas, los dos pierden cada vez más
    const k = s.turn - SUMMON_TURNS;
    for (const j of [0, 1] as const) {
      s.players[j].life -= k;
      emit(s, { kind: 'life', side: j, amount: -k });
    }
    log(s, `Cansancio: los dos pierden ${k} de vida (${s.players[0].life} y ${s.players[1].life})`, 'effect');
    checkLife(s);
    if (over(s)) return;
  }
  // las cartas del turno llegan a la mano (sin mano, son las únicas)
  for (const p of s.players) {
    const fresh: HandCard[] = summon ? turnOptions(p, s.turn).map((id) => ({ id, turn: s.turn })) : [];
    p.hand = s.cfg.cards === 'hand' ? [...p.hand, ...fresh] : fresh;
  }
  // el maná del turno (más lo que dieron las cartas el turno anterior); con las otras reglas, la energía
  // del poder: 1 por turno a cada uno, y se junta
  for (const p of s.players) {
    if (s.cfg.powerMode === 'mana') {
      p.energy = Math.min(s.turn, SUMMON_TURNS) + p.boost;
      p.boost = 0;
    } else if (p.hero) p.energy = Math.min(ENERGY_MAX, p.energy + 1);
  }
  for (const u of allUnits(s)) {
    if (u.evolves && u.evolves.turn === s.turn) evolve(s, u);
  }
  for (const u of allUnits(s)) {
    u.energy = u.maxEnergy;
    u.fought = false;
    if (s.cfg.shieldRenews && u.shield < u.maxShield) u.shield = u.maxShield;
  }
  s.picks = [null, null];
  s.queue = null;
  s.chosen = [null, null];
  s.pending = null;
  s.discards = [null, null];
  s.attacksMade = 0;
  // con mano, primero se descarta una de las que llegaron (si hay de dónde elegir)
  if (s.cfg.cards === 'hand' && summon) {
    for (const j of [0, 1] as const) s.discards[j] = freshCards(s, j).length >= 2 ? null : -1;
    if (s.discards[0] === null || s.discards[1] === null) {
      s.phase = 'discard';
      return;
    }
  }
  beginPick(s);
}

/** Empieza la elección. Después del T9, con mano, se elige si alguno puede jugar algo de lo que le quedó. */
function beginPick(s: State): void {
  const summon = isSummonTurn(s);
  s.discards = [null, null];
  const canPlay = ([0, 1] as const).map((j) => s.players[j].hand.some((c) => card(c.id).rank <= mana(s, j)));
  s.phase = summon || canPlay[0] || canPlay[1] ? 'pick' : 'combat';
  if (s.phase === 'pick') {
    for (const j of [0, 1] as const) if (!canPlay[j]) s.picks[j] = { cards: [], places: [] };
  }
}

function finish(s: State, early = false): void {
  if (s.phase === 'end') return;
  s.turn = Math.min(s.turn, lastTurn(s));
  s.phase = 'end';
  s.pending = null;
  const dmg: [number, number] = [0, 0];
  if (!early && s.cfg.scoring === 'final') {
    dmg[0] = boardPower(s, 0);
    dmg[1] = boardPower(s, 1);
    s.players[1].life -= dmg[0];
    s.players[0].life -= dmg[1];
    emit(s, { kind: 'final', damage: dmg });
    log(s, `Golpe final: ${s.players[0].name} inflige ${dmg[0]}, ${s.players[1].name} inflige ${dmg[1]}`, 'turn');
  }
  const life: [number, number] = [s.players[0].life, s.players[1].life];
  const rec = current(s);
  if (rec && !rec.life) rec.life = [...life];
  const winner: Side | null = life[0] > life[1] ? 0 : life[1] > life[0] ? 1 : null;
  s.result = { life, finalDamage: dmg, winner, early };
  log(s, `Fin. Vida: ${s.players[0].name} ${life[0]} · ${s.players[1].name} ${life[1]}. ${winner === null ? 'Empate' : `Gana ${s.players[winner].name}`}`, 'turn');
}

/** Una función y no `s.phase === 'end'` directo: los efectos pueden terminar la partida en el medio, y
 * TypeScript no se entera si antes ya había angostado `phase`. */
function over(s: State): boolean {
  return s.phase === 'end';
}

function checkLife(s: State): void {
  if (!over(s) && (s.players[0].life <= 0 || s.players[1].life <= 0)) finish(s, true);
}

// ───────────────────────── elección ─────────────────────────

/** Quiénes pueden elegir carta ahora. */
export function pickers(s: State): Side[] {
  if (s.phase !== 'pick') return [];
  const a = s.attacker, d = other(a);
  if (s.cfg.pickMode === 'sequential') {
    if (s.picks[a] === null) return [a];
    if (s.picks[d] === null) return [d];
    return [];
  }
  return ([0, 1] as const).filter((j) => s.picks[j] === null);
}

/** Las cartas de un jugador en el turno `turn` (1 a 9): las dos de su mazo y la de su clase. */
export function turnOptions(p: PlayerState, turn: number): string[] {
  const base = p.turns[turn - 1] ?? [];
  return p.hero ? [...base, HEROES[p.hero].cards[turn - 1]] : base;
}

/** Las cartas que puede jugar ahora un jugador: su mano (sin mano, las del turno). */
export function options(s: State, j: Side): string[] {
  return s.players[j].hand.map((c) => c.id);
}

/**
 * El maná de `j` para las cartas: cuánto pueden sumar las que juega (sin mano, no hay tope: una carta).
 * Con el poder que cuesta maná, es el que le queda (el del turno, más lo que le dieron las cartas).
 */
export function mana(s: State, j: Side): number {
  if (s.cfg.cards !== 'hand') return Infinity;
  return s.cfg.powerMode === 'mana' ? s.players[j].energy : Math.min(s.turn, SUMMON_TURNS);
}

/** Lo que cuestan esas cartas de la mano de `j`: la suma de sus turnos. */
export function cost(s: State, j: Side, cards: number[]): number {
  return cards.reduce((a, i) => a + card(s.players[j].hand[i].id).rank, 0);
}

/** Las nuevas de la mano de `j` (las que llegaron este turno), por índice. */
export function freshCards(s: State, j: Side): number[] {
  return s.players[j].hand.flatMap((c, i) => (c.turn === s.turn ? [i] : []));
}

/** Lo que el rival sabe que `j` puede tener: lo que le llegó y no jugó (no sabe qué descartó). */
export function candidates(s: State, j: Side): HandCard[] {
  return [...s.players[j].hand, ...s.players[j].gone].sort((a, b) => a.turn - b.turn);
}

/** Las cartas que eligió `j` este turno (antes de que entren). */
export function pickedCards(s: State, j: Side): string[] {
  const p = s.picks[j];
  return p ? p.cards.map((i) => s.players[j].hand[i].id) : [];
}

/** La primera carta que eligió `j` (sin mano, la única), o null. */
export function pickedCard(s: State, j: Side): string | null {
  return pickedCards(s, j)[0] ?? null;
}

/**
 * Elige la carta `index` y, si es una unidad, el lugar donde entra en la fila: `place` es cuántas de
 * las suyas quedan a la izquierda (0 es la punta izquierda; sin decir, la punta derecha). Una sola carta.
 */
export function pick(s: State, j: Side, index: number, place?: number): void {
  play(s, j, [index], place === undefined ? [] : [place]);
}

/**
 * Juega esas cartas de la mano (por índice; sus efectos se resuelven en ese orden). `places` dice el
 * lugar final de cada unidad en la fila (0 es la punta izquierda; las que no digan van a la derecha). Con
 * mano, tienen que sumar hasta el maná, y se puede no jugar nada; sin mano, una carta.
 */
export function play(s: State, j: Side, cards: number[], places: number[] = []): void {
  if (!pickers(s).includes(j)) throw new Error(`${s.players[j].name} no puede elegir ahora`);
  const p = s.players[j];
  if (new Set(cards).size !== cards.length || cards.some((i) => !(Number.isInteger(i) && i >= 0 && i < p.hand.length))) throw new Error('índice inválido');
  if (s.cfg.cards === 'turn' ? cards.length !== 1 : cost(s, j, cards) > mana(s, j)) throw new Error('no alcanza el maná');
  // el lugar final de cada unidad: los que dicen, y las demás a la derecha, en orden
  const units = cards.map((i, k) => (card(p.hand[i].id).kind === 'unit' ? k : -1)).filter((k) => k >= 0);
  const size = p.board.length + units.length;
  const fin = cards.map(() => -1);
  for (const k of units) fin[k] = places[k] ?? -1;
  const used = new Set(fin.filter((x) => x >= 0));
  if (used.size !== fin.filter((x) => x >= 0).length || [...used].some((x) => !(Number.isInteger(x) && x < size))) throw new Error('lugar inválido');
  let free = size - 1;
  for (const k of [...units].reverse()) {
    if (fin[k] >= 0) continue;
    while (used.has(free)) free--;
    fin[k] = free;
    used.add(free);
  }
  s.picks[j] = { cards: [...cards], places: fin };
  const names = cards.map((i) => card(p.hand[i].id).name);
  if (s.cfg.pickMode === 'simultaneous') log(s, `${p.name} eligió (oculto)`);
  else log(s, `${p.name} ${names.length ? `juega ${names.join(', ')}` : 'no juega nada'}`);
  if (s.picks[0] !== null && s.picks[1] !== null) resolvePlays(s);
}

/** En qué orden se resuelven las cartas del turno: las de un jugador y después las del otro. */
export function resolveOrder(s: State): [Side, Side] {
  const a = s.attacker, d = other(a);
  const fast = (j: Side) => pickedCards(s, j).some((id) => !!card(id).fast);
  if (fast(a) !== fast(d)) return fast(a) ? [a, d] : [d, a];
  switch (s.cfg.firstToResolve) {
    case 'defender': return [d, a];
    case 'lowerLife': return s.players[d].life < s.players[a].life ? [d, a] : [a, d];
    default: return [a, d];
  }
}

function playEffects(id: string): Effect[] {
  const c = card(id);
  return (c.kind === 'unit' ? c.effects?.onSummon : c.effects?.onPlay) ?? [];
}

function choiceKind(effects: Effect[]): TargetKind | null {
  for (const e of effects) {
    if ('target' in e && e.target.startsWith('chosen')) return e.target;
  }
  return null;
}

function choiceOptions(s: State, j: Side, source: Unit | null, kind: TargetKind): number[] {
  // a las enemigas con Sigilo no se las puede elegir
  const mine = s.players[j].board, theirs = s.players[other(j)].board.filter((u) => !u.stealth);
  switch (kind) {
    case 'chosenEnemy': case 'chosenEnemyAndSides': return theirs.map((u) => u.uid);
    case 'chosenDamagedEnemy': return theirs.filter((u) => u.hp < u.maxHp).map((u) => u.uid);
    case 'chosenUndamagedEnemy': return theirs.filter((u) => u.hp >= u.maxHp).map((u) => u.uid);
    case 'chosenAlly': return mine.filter((u) => u !== source).map((u) => u.uid);
    default: return [...mine, ...theirs].filter((u) => u !== source).map((u) => u.uid);
  }
}

/**
 * Entran las cartas del turno: las unidades de cada uno a su lugar en la fila, los hechizos se muestran, y
 * salen de la mano. Los efectos quedan en fila para resolverse en orden.
 */
function enterPlays(s: State): void {
  const ids: [string[], string[]] = [pickedCards(s, 0), pickedCards(s, 1)];
  s.history.push({ turn: s.turn, plays: ids });
  const rec = current(s);
  if (rec) rec.plays = ids;
  const list = (j: Side) => (ids[j].length ? ids[j].map((id) => card(id).name).join(', ') : 'nada');
  if (s.cfg.pickMode === 'simultaneous') log(s, `Se revelan: ${s.players[0].name}, ${list(0)}; ${s.players[1].name}, ${list(1)}`);
  const queue: QueuedPlay[] = [];
  for (const j of resolveOrder(s)) {
    const p = s.players[j], chosen = s.picks[j]!;
    // las unidades entran de izquierda a derecha, cada una en su lugar final
    const uids = new Map<number, number>();
    const units = chosen.cards.map((i, k) => ({ k, id: p.hand[i].id, at: chosen.places[k] })).filter((x) => card(x.id).kind === 'unit');
    for (const u of units.sort((a, b) => a.at - b.at)) uids.set(u.k, summonUnit(s, j, u.id, false, u.at).uid);
    chosen.cards.forEach((i, k) => {
      const id = p.hand[i].id;
      if (card(id).kind === 'spell') {
        log(s, `${p.name} lanza ${card(id).name}`, 'summon');
        emit(s, { kind: 'spell', card: id, owner: j });
      }
      queue.push({ side: j, id, unit: uids.get(k) ?? null });
    });
    p.hand = p.hand.filter((_, i) => !chosen.cards.includes(i));
    // lo que costaron sale del maná del turno (lo que queda es para el poder)
    if (s.cfg.cards === 'hand' && s.cfg.powerMode === 'mana') p.energy -= ids[j].reduce((a, id) => a + card(id).rank, 0);
  }
  s.queue = queue;
}

/**
 * Resuelve las cartas del turno: primero entran todas y después se resuelven los efectos en orden,
 * hasta terminar o hasta que falte elegir un objetivo.
 */
function resolvePlays(s: State): void {
  if (!s.queue) enterPlays(s);
  const queue = s.queue!;
  while (queue.length) {
    const q = queue[0];
    const unit = q.unit !== null ? unitById(s, q.unit) : null;
    const effects = playEffects(q.id);
    const kind = choiceKind(effects);
    if (kind && s.chosen[q.side] === null) {
      const opts = choiceOptions(s, q.side, unit, kind);
      if (opts.length > 0) {
        s.pending = { player: q.side, card: q.id, source: unit?.uid ?? null, options: opts };
        s.phase = 'target';
        return;
      }
    }
    queue.shift();
    const chosen = s.chosen[q.side];
    s.chosen[q.side] = null;
    runEffects(s, { owner: q.side, name: card(q.id).name, unit }, effects, { chosen });
    if (over(s)) return;
  }
  s.queue = null;
  s.pending = null;
  s.phase = 'combat';
}

export function chooseTarget(s: State, j: Side, uid: number): void {
  const p = s.pending;
  if (s.phase !== 'target' || !p || p.player !== j) throw new Error(`${s.players[j].name} no está eligiendo objetivo`);
  if (!p.options.includes(uid)) throw new Error('objetivo inválido');
  s.chosen[j] = uid;
  s.pending = null;
  log(s, `${s.players[j].name} apunta ${card(p.card).name} a ${unitById(s, uid)!.name}`);
  resolvePlays(s);
}

// ───────────────────────── unidades ─────────────────────────

/**
 * Pone una unidad en el tablero, en el lugar `at` de la fila (sin decir, en la punta derecha).
 * `withEffects` dispara su «al invocar» (las fichas que invoca otra carta). `size` cambia el ataque o la
 * vida con que entra (las fichas de los poderes, que crecen con la energía).
 */
export function summonUnit(s: State, j: Side, id: string, withEffects = true, at?: number, size?: { attack?: number; hp?: number }): Unit {
  const c = unitCard(id);
  const dmg = { ...emptyDamage(), ...c.dmg };
  if (size?.attack !== undefined) dmg.attack = size.attack;
  const hp = size?.hp ?? c.hp;
  const u: Unit = {
    uid: s.nextUid++,
    card: id,
    owner: j,
    name: c.name,
    rank: c.rank,
    dmg,
    hp,
    maxHp: hp,
    shield: c.shield ?? 0,
    maxShield: c.shield ?? 0,
    armor: c.armor ?? 0,
    guard: !!c.guard,
    charge: !!c.charge,
    poison: !!c.poison,
    energy: c.energy ?? 1,
    maxEnergy: c.energy ?? 1,
    lastStand: !!c.lastStand,
    evolves: c.evolves ?? null,
    silenced: false,
    summonedTurn: s.turn,
    fought: false,
    hitInCombat: false,
    bonus: 0,
    lifesteal: !!c.lifesteal,
    rush: !!c.rush,
    stealth: !!c.stealth,
    frozen: false,
    aura: { dmg: 0, hp: 0 },
  };
  const board = s.players[j].board;
  board.splice(at === undefined ? board.length : Math.max(0, Math.min(board.length, at)), 0, u);
  refreshAuras(s);
  log(s, `${s.players[j].name} invoca ${u.name} (${statLine(u)})`, 'summon');
  emit(s, { kind: 'summon', uid: u.uid, owner: j });
  if (withEffects) runEffects(s, { owner: j, name: u.name, unit: u }, effectsOf(u, 'onSummon'), {});
  return u;
}

/** Las armas y la vida en corto, para el registro: «🔱2 🔪1 ❤3». */
export function statLine(u: Unit): string {
  const parts = WEAPON_ORDER.filter((w) => u.dmg[w] > 0).map((w) => `${WEAPONS[w].icon}${u.dmg[w]}`);
  parts.push(`❤${u.hp}`);
  return parts.join(' ');
}

function evolve(s: State, u: Unit): void {
  const from = unitCard(u.card), to = unitCard(u.evolves!.into);
  const before = u.name;
  for (const w of WEAPON_ORDER) {
    u.dmg[w] = Math.max(0, u.dmg[w] + (to.dmg[w] ?? 0) - (from.dmg[w] ?? 0));
  }
  u.maxHp += to.hp - from.hp;
  u.hp += to.hp - from.hp;
  u.armor = Math.max(0, u.armor + (to.armor ?? 0) - (from.armor ?? 0));
  u.maxShield = Math.max(0, u.maxShield + (to.shield ?? 0) - (from.shield ?? 0));
  u.shield = Math.max(u.shield, to.shield ?? 0);
  u.card = to.id;
  u.name = to.name;
  u.rank = to.rank;
  u.guard = !!to.guard;
  u.charge = !!to.charge;
  u.poison = !!to.poison;
  u.maxEnergy = to.energy ?? 1;
  u.lastStand = !!to.lastStand;
  u.evolves = to.evolves ?? null;
  u.lifesteal = !!to.lifesteal;
  u.rush = !!to.rush;
  u.stealth = !!to.stealth;
  refreshAuras(s);
  log(s, `${before} evoluciona a ${u.name} (${statLine(u)})`, 'effect');
  emit(s, { kind: 'evolve', uid: u.uid });
}

/**
 * Silencio: quita texto (habilidades, Guardián, Veneno, Aguante, evolución). Los números quedan: armas,
 * vida, escudo y armadura.
 */
function silence(u: Unit): void {
  u.silenced = true;
  u.guard = false;
  u.poison = false;
  u.lastStand = false;
  u.evolves = null;
  u.lifesteal = false;
  u.rush = false;
  u.stealth = false;
}

/**
 * Las auras («mientras esté viva, las de los costados tienen…»): pone a cada unidad lo que le dan las de
 * sus costados ahora. Al perder un aura pierde lo que le daba: el daño y la vida (si estaba herida, sigue
 * igual de herida), pero no se muere por eso: queda en 1. Hearthstone solo la baja hasta la vida máxima,
 * y entonces un aura que llega a una herida la cura para siempre.
 */
function refreshAuras(s: State): void {
  for (const side of [0, 1] as const) {
    const row = s.players[side].board;
    row.forEach((u, i) => {
      const want = { dmg: 0, hp: 0 };
      for (const n of [row[i - 1], row[i + 1]]) {
        const a = n && !n.silenced && n.hp > 0 ? unitCard(n.card).aura : undefined;
        if (a) {
          want.dmg += a.dmg;
          want.hp += a.hp;
        }
      }
      const dd = want.dmg - u.aura.dmg, dh = want.hp - u.aura.hp;
      if (dd) u.dmg.attack = Math.max(0, u.dmg.attack + dd);
      if (dh) {
        u.maxHp += dh;
        u.hp = dh > 0 || u.hp <= 0 ? u.hp + dh : Math.max(1, u.hp + dh);
      }
      u.aura = want;
    });
  }
}

function effectsOf(u: Unit, t: Trigger): Effect[] {
  if (u.silenced) return [];
  return card(u.card).effects?.[t] ?? [];
}

function trigger(s: State, u: Unit, t: Trigger, ctx: Ctx = {}): void {
  const list = effectsOf(u, t);
  if (list.length) runEffects(s, { owner: u.owner, name: u.name, unit: u }, list, ctx);
}

// ───────────────────────── efectos ─────────────────────────

/** La que más pega (suma de sus armas); si empatan, la de más vida; si no, la de más a la izquierda. */
function strongest(list: Unit[]): Unit[] {
  let m: Unit | null = null;
  for (const u of list) {
    const d = totalDamage(u.dmg), md = m ? totalDamage(m.dmg) : -1;
    if (!m || d > md || (d === md && u.hp > m.hp)) m = u;
  }
  return m ? [m] : [];
}

function weakest(list: Unit[]): Unit[] {
  let m: Unit | null = null;
  for (const u of list) if (!m || u.hp < m.hp || (u.hp === m.hp && totalDamage(u.dmg) < totalDamage(m.dmg))) m = u;
  return m ? [m] : [];
}

function targets(s: State, src: Source, kind: TargetKind, ctx: Ctx): Unit[] {
  const mine = s.players[src.owner].board, theirs = s.players[other(src.owner)].board;
  switch (kind) {
    case 'self': return src.unit && mine.includes(src.unit) ? [src.unit] : [];
    case 'otherAllies': return mine.filter((u) => u !== src.unit);
    case 'allAllies': return [...mine];
    case 'allEnemies': return [...theirs];
    case 'allUnits': return [...mine, ...theirs];
    case 'allOthers': return [...mine, ...theirs].filter((u) => u !== src.unit);
    case 'selfAtEdge': {
      const i = src.unit ? mine.indexOf(src.unit) : -1;
      return i >= 0 && (i === 0 || i === mine.length - 1) ? [src.unit!] : [];
    }
    case 'adjacent': case 'leftAllies': case 'rightAllies': {
      const i = src.unit ? mine.indexOf(src.unit) : -1;
      if (i < 0) return [];
      if (kind === 'leftAllies') return mine.slice(0, i);
      if (kind === 'rightAllies') return mine.slice(i + 1);
      return [mine[i - 1], mine[i + 1]].filter((u): u is Unit => !!u);
    }
    case 'strongestEnemy': return strongest(theirs);
    case 'weakestEnemy': return weakest(theirs);
    case 'newestEnemy': return theirs.length ? [theirs[theirs.length - 1]] : [];
    case 'rival': return ctx.rival && alive(s, ctx.rival) ? [ctx.rival] : [];
    case 'chosenEnemy': case 'chosenAlly': case 'chosenUnit': case 'chosenDamagedEnemy': case 'chosenUndamagedEnemy': {
      const u = ctx.chosen != null ? unitById(s, ctx.chosen) : null;
      return u ? [u] : [];
    }
    case 'chosenEnemyAndSides': {
      const u = ctx.chosen != null ? unitById(s, ctx.chosen) : null;
      if (!u) return [];
      const row = s.players[u.owner].board, i = row.indexOf(u);
      return [row[i - 1], u, row[i + 1]].filter((x): x is Unit => !!x);
    }
    case 'enemyPlayer': case 'ownPlayer': return [];
  }
}

function playerTarget(src: Source, kind: TargetKind): Side | null {
  if (kind === 'enemyPlayer') return other(src.owner);
  if (kind === 'ownPlayer') return src.owner;
  return null;
}

/**
 * Un golpe a una unidad. El Escudo N frena entero un golpe menor que N; uno de N o más lo rompe, y ese
 * golpe se pierde (o, según la regla en prueba, entra entero o restándole N). Lo que entra, la armadura
 * lo achica. Con Escudo 1, el primer golpe lo rompe: es el escudo divino de Hearthstone.
 */
function hurt(s: State, t: Unit, n: number, from: string, weapon: Weapon | null): number {
  if (n <= 0) return 0;
  const icon = weapon ? `${WEAPONS[weapon].icon} ` : '✦ ';
  let broke = '';
  if (t.shield > 0) {
    const value = t.shield;
    if (n < value) {
      log(s, `  ${icon}${from} → ${t.name}: el escudo (${value}) frena ${n}`);
      emit(s, { kind: 'damage', uid: t.uid, amount: 0, blocked: true, weapon });
      return 0;
    }
    t.shield = 0;
    emit(s, { kind: 'shieldBreak', uid: t.uid });
    if (s.cfg.shieldBreak === 'absorb') {
      log(s, `  ${icon}${from} → ${t.name}: rompe el escudo (${value}) y el golpe se pierde`);
      emit(s, { kind: 'damage', uid: t.uid, amount: 0, blocked: true, weapon });
      return 0;
    }
    if (s.cfg.shieldBreak === 'mitigated') n -= value;
    broke = ` y le rompe el escudo (${value})`;
  }
  const d = Math.max(0, n - t.armor);
  t.hp -= d;
  log(s, `  ${icon}${from} → ${t.name}: ${d} de daño${t.armor && d < n ? ` (armadura −${n - d})` : ''}${broke}, queda en ${t.hp}`);
  emit(s, { kind: 'damage', uid: t.uid, amount: d, blocked: false, weapon });
  if (d > 0) damaged.push(t);
  return d;
}

/**
 * Las que recibieron daño y todavía no dispararon su «al recibir daño». Se disparan después de sacar a
 * los muertos, así en una pelea los dos golpes siguen siendo a la vez (el que se enoja pega más en la
 * próxima, no en esta).
 */
const damaged: Unit[] = [];

function flushDamaged(s: State): void {
  for (let guard = 0; guard < 200 && damaged.length; guard++) {
    const u = damaged.shift()!;
    if (alive(s, u) && !over(s)) trigger(s, u, 'onDamaged');
  }
  damaged.length = 0;
}

function runEffects(s: State, src: Source, effects: Effect[], ctx: Ctx): void {
  for (const e of effects) {
    if (s.phase === 'end') return;
    applyEffect(s, src, e, ctx);
  }
}

function applyEffect(s: State, src: Source, e: Effect, ctx: Ctx): void {
  if (e.type === 'summon') {
    // las fichas salen donde estaba la que murió, o a la derecha de la que las invoca
    const board = s.players[src.owner].board;
    const i = src.unit ? board.indexOf(src.unit) : -1;
    let at = ctx.at ?? (i >= 0 ? i + 1 : board.length);
    const count = e.per === 'enemy' ? s.players[other(src.owner)].board.length : e.count;
    for (let k = 0; k < count; k++) summonUnit(s, src.owner, e.card, true, at++);
    return;
  }
  if (e.type === 'energy') {
    gainEnergy(s, src.owner, e.n, src.name);
    return;
  }
  if (e.type === 'totem') {
    const board = s.players[src.owner].board;
    const i = src.unit ? board.indexOf(src.unit) : -1;
    summonTotem(s, src.owner, e.hp, i >= 0 ? i + 1 : undefined);
    return;
  }
  const side = playerTarget(src, e.target);
  if (side !== null) {
    const p = s.players[side];
    if (e.type === 'damage') {
      p.life -= e.n;
      log(s, `  ${src.name}: ${p.name} pierde ${e.n} de vida (queda en ${p.life})`, 'effect');
      emit(s, { kind: 'life', side, amount: -e.n });
    } else if (e.type === 'heal') {
      p.life += e.n;
      log(s, `  ${src.name}: ${p.name} gana ${e.n} de vida (queda en ${p.life})`, 'effect');
      emit(s, { kind: 'life', side, amount: e.n });
    }
    checkLife(s);
    return;
  }
  const list = targets(s, src, e.target, ctx);
  if (!list.length) return;
  const names = list.map((t) => t.name).join(', ');
  switch (e.type) {
    case 'damage':
      for (const t of list) hurt(s, t, e.n, src.name, null);
      break;
    case 'buff':
      for (const t of list) {
        // el daño se suma a cada arma que ya tiene (y nunca baja de 0)
        for (const w of WEAPON_ORDER) if (t.dmg[w] > 0) t.dmg[w] = Math.max(0, t.dmg[w] + e.dmg);
        t.maxHp += e.hp;
        t.hp += e.hp;
        emit(s, { kind: 'buff', uid: t.uid, dmg: e.dmg, hp: e.hp });
      }
      log(s, `  ${src.name}: ${names} ${signed(e.dmg)} daño, ${signed(e.hp)} vida`, 'effect');
      break;
    case 'heal':
      // curar es ganar vida: no hay tope, puede pasar de la que tenía la carta
      for (const t of list) {
        t.hp += e.n;
        t.maxHp = Math.max(t.maxHp, t.hp);
        emit(s, { kind: 'heal', uid: t.uid, amount: e.n });
      }
      log(s, `  ${src.name}: ${names} +${e.n} de vida`, 'effect');
      break;
    case 'shield':
      // no se acumula: lo deja en N si tenía menos
      for (const t of list) {
        if (t.shield >= e.n) continue;
        t.shield = e.n;
        emit(s, { kind: 'shield', uid: t.uid });
      }
      log(s, `  ${src.name}: ${names} con Escudo ${e.n}`, 'effect');
      break;
    case 'breakShield':
      for (const t of list) t.shield = 0;
      log(s, `  ${src.name} rompe el Escudo de ${names}`, 'effect');
      break;
    case 'armor':
      for (const t of list) t.armor += e.n;
      log(s, `  ${src.name} da Armadura +${e.n} a ${names}`, 'effect');
      break;
    case 'silence':
      for (const t of list) {
        silence(t);
        emit(s, { kind: 'silence', uid: t.uid });
      }
      log(s, `  ${src.name} silencia a ${names}`, 'effect');
      break;
    case 'banish':
      for (const t of list) {
        const b = s.players[t.owner].board;
        b.splice(b.indexOf(t), 1);
        emit(s, { kind: 'banish', unit: JSON.parse(JSON.stringify(t)) as Unit });
      }
      log(s, `  ${src.name} destierra a ${names} (no cuenta como muerte)`, 'death');
      break;
    case 'destroy':
      for (const t of list) t.hp = 0;
      break;
    case 'execute':
      for (const t of list) {
        if (t.hp < t.maxHp) {
          t.hp = 0;
          log(s, `  ${src.name} destruye a ${t.name} (estaba herida)`, 'death');
        } else hurt(s, t, e.n, src.name, null);
      }
      break;
    case 'grant':
      for (const t of list) grant(t, e.what);
      log(s, `  ${src.name}: ${names} gana ${KEYWORD_NAMES[e.what]}`, 'effect');
      break;
    case 'freeze':
      for (const t of list) {
        t.frozen = true;
        emit(s, { kind: 'freeze', uid: t.uid });
      }
      log(s, `  ${src.name} congela a ${names}`, 'effect');
      break;
    case 'double':
      for (const t of list) {
        const n = t.hp;
        t.hp += n;
        t.maxHp += n;
        emit(s, { kind: 'buff', uid: t.uid, dmg: 0, hp: n });
      }
      log(s, `  ${src.name}: ${names} duplica su vida`, 'effect');
      break;
    case 'steal':
      for (const t of list) {
        if (t.owner === src.owner) continue;
        const from = s.players[t.owner].board;
        from.splice(from.indexOf(t), 1);
        t.owner = src.owner;
        t.summonedTurn = s.turn;
        t.energy = t.maxEnergy;
        s.players[src.owner].board.push(t);
        emit(s, { kind: 'summon', uid: t.uid, owner: src.owner });
      }
      log(s, `  ${src.name}: ${s.players[src.owner].name} toma el control de ${names}`, 'effect');
      refreshAuras(s);
      break;
  }
  checkDeaths(s);
}

/** Saca a los muertos (y dispara su Último aliento). Aguante los deja en 1 la primera vez. */
function checkDeaths(s: State): void {
  for (let guard = 0; guard < 200; guard++) {
    const m = allUnits(s).find((u) => u.hp <= 0);
    if (!m || s.phase === 'end') break;
    if (m.lastStand) {
      m.lastStand = false;
      m.hp = 1;
      log(s, `  ¡Aguante! ${m.name} queda en 1 de vida`, 'effect');
      emit(s, { kind: 'lastStand', uid: m.uid });
      trigger(s, m, 'lastStand');
      continue;
    }
    const inCombat = m.hitInCombat;
    const p = s.players[m.owner];
    const at = p.board.indexOf(m);
    p.board.splice(at, 1);
    p.graveyard.push(m.card);
    log(s, `  ✝ ${m.name} muere`, 'death');
    emit(s, { kind: 'death', unit: JSON.parse(JSON.stringify(m)) as Unit });
    trigger(s, m, 'onDeath', { at });
    if (inCombat) trigger(s, m, 'onCombatDeath', { at });
    for (const u of [...p.board]) if (alive(s, u) && !over(s)) trigger(s, u, 'onAllyDeath');
  }
  refreshAuras(s);
  flushDamaged(s);
}

// ───────────────────────── combate ─────────────────────────

/**
 * A quiénes puede atacar una unidad ahora: unidades por uid y, con `scoring: 'hero'`, el héroe rival con
 * `heroTarget`. Si el rival tiene Guardián, solo a sus guardianes.
 */
export function attackTargets(s: State, uid: number): number[] {
  if (s.phase !== 'combat') return [];
  const a = unitById(s, uid);
  if (!a || a.owner !== s.attacker || a.energy <= 0 || totalDamage(a.dmg) <= 0) return [];
  const fresh = s.cfg.summonSick && a.summonedTurn === s.turn && !a.charge;
  if (a.frozen || (fresh && !a.rush)) return [];
  if (s.cfg.maxAttacks > 0 && s.attacksMade >= s.cfg.maxAttacks) return [];
  // a las de Sigilo no se las puede atacar (y un Guardián con Sigilo no obliga)
  const enemies = s.players[other(a.owner)].board.filter((u) => !u.stealth);
  const guards = enemies.filter((u) => u.guard);
  if (guards.length) return guards.map((u) => u.uid);
  // con Embestida, el turno en que entra ataca solo unidades
  const hero = s.cfg.scoring === 'hero' && !fresh ? [heroTarget(other(a.owner))] : [];
  return [...enemies.map((u) => u.uid), ...hero];
}

export function canAttack(s: State, uid: number): boolean {
  return attackTargets(s, uid).length > 0;
}

export function anyAttack(s: State): boolean {
  return s.phase === 'combat' && s.players[s.attacker].board.some((u) => canAttack(s, u.uid));
}

/** Un golpe con un arma. No pasa nada si no la tiene. */
function strike(s: State, from: Unit, to: Unit, w: Weapon): void {
  const n = from.dmg[w];
  if (n <= 0) return;
  to.hitInCombat = true;
  const d = hurt(s, to, n, from.name, w);
  if (from.poison && d > 0 && to.hp > 0) {
    to.hp = 0;
    log(s, `  🧪 Veneno: ${to.name} queda en 0`);
  }
  if (from.lifesteal && d > 0) changeLife(s, from.owner, d, `Robo de vida de ${from.name}`);
}

/** `aUid` ataca a `dUid`: una unidad, o el héroe rival (`heroTarget`). */
export function attack(s: State, aUid: number, dUid: number): void {
  if (!attackTargets(s, aUid).includes(dUid)) throw new Error('ataque ilegal');
  if (dUid < 0) return attackHero(s, unitById(s, aUid)!);
  const a = unitById(s, aUid)!, d = unitById(s, dUid)!;
  a.energy--;
  a.stealth = false;
  s.attacksMade++;
  const rec = current(s);
  const before = rec ? allUnits(s).filter((u) => u !== a && u !== d) : [];
  const from = s.log.length;
  const [ta, td] = [tag(a), tag(d)];
  fight(s, a, d);
  rec?.attacks.push({
    a: ta,
    d: td,
    aHp: alive(s, a) ? a.hp : null,
    dHp: alive(s, d) ? d.hp : null,
    also: before.filter((u) => !alive(s, u)).map((u) => u.name),
    steps: s.log.slice(from + 1).map((l) => l.text.trim()),
  });
}

/**
 * Una unidad ataca al héroe rival: le pega su daño a la vida y el héroe no devuelve el golpe. Pierde el
 * Sigilo como en cualquier ataque. No es una pelea: no dispara «antes/después de pelear»; dispara «al
 * pegarle al rival».
 */
function attackHero(s: State, a: Unit): void {
  const d = other(a.owner), p = s.players[d];
  a.energy--;
  a.stealth = false;
  s.attacksMade++;
  const rec = current(s);
  const from = s.log.length;
  const n = faceValue(s, a);
  log(s, `⚔ ${a.name} ataca a ${p.name}`, 'attack');
  p.life -= n;
  emit(s, { kind: 'face', uid: a.uid, side: d, amount: n });
  log(s, `  ${a.name} le pega ${n} a ${p.name} (queda en ${p.life})`);
  if (a.lifesteal && n > 0) changeLife(s, a.owner, n, `Robo de vida de ${a.name}`);
  rec?.attacks.push({ a: tag(a), d: heroTag(s, d), aHp: a.hp, dHp: p.life, also: [], steps: s.log.slice(from + 1).map((l) => l.text.trim()) });
  checkLife(s);
  if (!over(s) && n > 0) trigger(s, a, 'onFace');
}

function tag(u: Unit): UnitTag {
  return { side: u.owner, name: u.name, card: u.card };
}

/** Un jugador como objetivo, para el historial: su nombre y el dibujo de su héroe (o de su mazo). */
function heroTag(s: State, j: Side): UnitTag {
  const p = s.players[j];
  return { side: j, name: p.name, card: p.hero ? `heroe_${p.hero}` : '', hero: true };
}

/** El turno en curso en el historial (null en las simulaciones). */
function current(s: State): TurnRecord | null {
  if (s.quiet) return null;
  const r = s.record[s.record.length - 1];
  return r && r.turn === s.turn ? r : null;
}

/**
 * Una pelea. Si el que ataca tiene arco, ataca solo con el arco: le responde únicamente otro arquero, a
 * la vez. Si no, cuerpo a cuerpo por fases: lanzas, arma principal, cuchillos (el arco no pega).
 */
function fight(s: State, a: Unit, d: Unit): void {
  const ranged = a.dmg.bow > 0;
  const duel = ranged && d.dmg.bow > 0;
  log(s, `⚔ ${a.name} ataca a ${d.name}${duel ? ' (duelo de arcos)' : ranged ? ' (de lejos, sin respuesta)' : ''}`, 'attack');
  emit(s, { kind: 'attack', a: a.uid, d: d.uid });

  trigger(s, a, 'beforeFight', { rival: d });
  if (alive(s, a) && alive(s, d)) trigger(s, d, 'beforeFight', { rival: a });
  const both = () => alive(s, a) && alive(s, d) && !over(s);

  if (ranged) {
    // de lejos: un tiro; si el otro también tiene arco, le contesta a la vez
    if (both()) {
      strike(s, a, d, 'bow');
      strike(s, d, a, 'bow');
      checkDeaths(s);
    }
  } else {
    // 1. lanzas, a la vez
    if (both()) {
      strike(s, a, d, 'spear');
      strike(s, d, a, 'spear');
      checkDeaths(s);
    }
    // 2. arma principal: en el triángulo, el que gana pega primero; si no (o con ataque simple), a la vez
    if (both()) {
      const ta = triadOf(a.dmg), td = triadOf(d.dmg);
      const order = triadOrder(ta, td);
      if (order === 'both') {
        if (ta) strike(s, a, d, ta);
        strike(s, a, d, 'attack');
        if (td) strike(s, d, a, td);
        strike(s, d, a, 'attack');
        checkDeaths(s);
      } else {
        const [p, q, wp, wq] = order === 'attacker' ? [a, d, ta!, td!] : [d, a, td!, ta!];
        strike(s, p, q, wp);
        checkDeaths(s);
        if (both()) {
          strike(s, q, p, wq);
          checkDeaths(s);
        }
      }
    }
    // 3. cuchillos, a la vez
    if (both()) {
      strike(s, a, d, 'knife');
      strike(s, d, a, 'knife');
      checkDeaths(s);
    }
  }

  for (const [u, rival] of [[a, d], [d, a]] as const) {
    u.hitInCombat = false;
    if (alive(s, u) && !over(s)) {
      u.fought = true;
      trigger(s, u, 'afterFight', { rival });
    }
  }
}

export function endCombat(s: State): void {
  if (s.phase !== 'combat') throw new Error('no estamos en combate');
  const a = s.attacker, d = other(a);
  // las que no atacaron le pegan a la vida del rival
  const hits = faceHits(s);
  for (const h of hits) {
    s.players[d].life -= h.amount;
    emit(s, { kind: 'face', uid: h.unit.uid, side: d, amount: h.amount });
    log(s, `  ${h.unit.name} le pega ${h.amount} a ${s.players[d].name} (queda en ${s.players[d].life})`, 'attack');
  }
  if (s.cfg.scoring === 'face' && !hits.length && faceBlocked(s, a) && s.players[a].board.length) {
    log(s, `  El Guardián de ${s.players[d].name} frena los golpes a la vida`);
  }
  for (const h of hits) if (h.unit.lifesteal) changeLife(s, a, h.amount, `Robo de vida de ${h.unit.name}`);
  checkLife(s);
  if (over(s)) return;
  // las congeladas del que atacó ya pasaron su combate sin atacar: se descongelan
  for (const u of s.players[a].board) u.frozen = false;
  for (const h of hits) if (alive(s, h.unit) && !over(s)) trigger(s, h.unit, 'onFace');
  for (const j of [a, other(a)]) {
    for (const u of [...s.players[j].board]) {
      if (u.fought && alive(s, u) && !over(s)) trigger(s, u, 'afterCombat');
    }
  }
  // fin del turno: todas, hayan peleado o no
  for (const j of [a, other(a)]) {
    for (const u of [...s.players[j].board]) {
      if (alive(s, u) && !over(s)) trigger(s, u, 'endTurn');
    }
  }
  // lo que daban las Garras dura hasta el fin del turno
  for (const u of allUnits(s)) {
    if (u.bonus) {
      u.dmg.attack = Math.max(0, u.dmg.attack - u.bonus);
      u.bonus = 0;
    }
  }
  if (s.cfg.scoring === 'difference' && !over(s)) {
    // el que tiene menos en la mesa pierde la diferencia
    const p: [number, number] = [tablePower(s, 0), tablePower(s, 1)];
    const behind: Side | null = p[0] < p[1] ? 0 : p[1] < p[0] ? 1 : null;
    if (behind !== null) {
      const n = Math.abs(p[0] - p[1]);
      s.players[behind].life -= n;
      emit(s, { kind: 'life', side: behind, amount: -n });
      log(s, `Mesa ${p[0]} a ${p[1]}: ${s.players[behind].name} pierde ${n} (queda en ${s.players[behind].life})`, 'effect');
      checkLife(s);
    }
  }
  const rec = current(s);
  if (rec) {
    rec.units = [s.players[0].board.length, s.players[1].board.length];
    rec.power = s.cfg.scoring === 'final' ? [boardPower(s, 0), boardPower(s, 1)] : [tablePower(s, 0), tablePower(s, 1)];
    rec.life = [s.players[0].life, s.players[1].life];
  }
  if (!over(s)) endTurn(s);
}

function endTurn(s: State): void {
  startTurn(s);
}

/** Quiénes tienen que elegir qué descartar. */
export function discarders(s: State): Side[] {
  return s.phase === 'discard' ? ([0, 1] as const).filter((j) => s.discards[j] === null) : [];
}

/** `j` descarta la carta `index` de su mano (una de las que le acaban de llegar). */
export function discard(s: State, j: Side, index: number): void {
  if (!discarders(s).includes(j)) throw new Error(`${s.players[j].name} no descarta ahora`);
  if (!freshCards(s, j).includes(index)) throw new Error('se descarta una de las nuevas');
  s.discards[j] = index;
  log(s, `${s.players[j].name} descarta una carta (oculta)`);
  if (s.discards[0] !== null && s.discards[1] !== null) {
    applyDiscards(s);
    beginPick(s);
  }
}

function applyDiscards(s: State): void {
  for (const j of [0, 1] as const) {
    const i = s.discards[j];
    if (i === null || i < 0) continue;
    const p = s.players[j];
    p.gone.push(...p.hand.splice(i, 1));
  }
  s.discards = [null, null];
}

const KEYWORD_NAMES: Record<Keyword, string> = {
  charge: 'Carga', rush: 'Embestida', stealth: 'Sigilo', lifesteal: 'Robo de vida', guard: 'Guardián', poison: 'Veneno',
};

function grant(u: Unit, k: Keyword): void {
  if (k === 'charge') u.charge = true;
  else if (k === 'rush') u.rush = true;
  else if (k === 'stealth') u.stealth = true;
  else if (k === 'lifesteal') u.lifesteal = true;
  else if (k === 'guard') u.guard = true;
  else u.poison = true;
}

// ───────────────────────── poder del héroe ─────────────────────────

/** Un héroe como objetivo del poder: −1 es J1 y −2 es J2 (las unidades tienen uid positivo). */
export function heroTarget(j: Side): number {
  return -1 - j;
}

/** El héroe al que apunta un objetivo, o null si es una unidad. */
export function targetSide(t: number): Side | null {
  return t < 0 ? ((-1 - t) as Side) : null;
}

function gainEnergy(s: State, j: Side, n: number, from: string): void {
  const p = s.players[j];
  if (s.cfg.powerMode === 'mana') {
    // maná para su turno siguiente
    p.boost += n;
    log(s, `  ${from}: ${p.name} va a tener ${n} de maná de más en su turno siguiente`, 'effect');
    emit(s, { kind: 'energy', side: j, amount: n });
    return;
  }
  const before = p.energy;
  p.energy = Math.min(ENERGY_MAX, p.energy + n);
  if (p.energy === before) return;
  log(s, `  ${from}: ${p.name} gana ${p.energy - before} de energía (tiene ${p.energy})`, 'effect');
  emit(s, { kind: 'energy', side: j, amount: p.energy - before });
}

function changeLife(s: State, j: Side, n: number, why: string): void {
  if (!n) return;
  const p = s.players[j];
  p.life += n;
  log(s, `  ${why}: ${p.name} ${n > 0 ? 'gana' : 'pierde'} ${Math.abs(n)} de vida (queda en ${p.life})`, 'effect');
  emit(s, { kind: 'life', side: j, amount: n });
}

function summonTotem(s: State, j: Side, hp: number, at?: number): void {
  const p = s.players[j];
  const id = TOTEMS[p.totems % TOTEMS.length];
  p.totems++;
  summonUnit(s, j, id, true, at, { hp });
}

/** Lo que suman a la energía del poder las cartas vivas de un jugador («Poder +1»). */
function powerBonus(s: State, j: Side): number {
  return s.players[j].board.reduce((a, u) => a + (u.silenced ? 0 : unitCard(u.card).powerBonus ?? 0), 0);
}

/** La X del poder si se usara ahora: 1 (2 con energía, o toda, con `powerMode: 'all'`), más lo que sumen las cartas. */
export function powerX(s: State, j: Side): number {
  const base = s.cfg.powerMode === 'mana' ? 1 : s.cfg.powerMode === 'all' ? s.players[j].energy : POWER_MIN;
  return base + powerBonus(s, j);
}

/** A qué puede apuntar el poder ahora (unidades por uid, héroes con `heroTarget`); null: no se elige. */
export function powerTargets(s: State, j: Side): number[] | null {
  const h = s.players[j].hero;
  if (!h) return [];
  const mine = s.players[j].board, theirs = s.players[other(j)].board.filter((u) => !u.stealth);
  const guards = theirs.filter((u) => u.guard);
  const melee = (guards.length ? guards : theirs).map((u) => u.uid);
  switch (HEROES[h].power.aim) {
    case 'none': return null;
    case 'enemy': return [...theirs.map((u) => u.uid), heroTarget(other(j))];
    case 'ally': return [...mine.map((u) => u.uid), heroTarget(j)];
    case 'allyUnit': return mine.map((u) => u.uid);
    case 'strike': return melee;
    case 'strikeOrFace': return guards.length ? melee : [...melee, heroTarget(other(j))];
  }
}

/** Si `j` puede usar el poder ahora: en su combate, con energía suficiente. */
export function canUsePower(s: State, j: Side): boolean {
  const p = s.players[j];
  if (!p.hero || s.cfg.powerMode === 'off' || s.phase !== 'combat' || s.attacker !== j) return false;
  if (p.energy < powerCost(s.cfg)) return false;
  // con maná, una vez por turno
  if (s.cfg.powerMode === 'mana' && p.usedTurn === s.turn) return false;
  const t = powerTargets(s, j);
  return t === null || t.length > 0;
}

/** Tu héroe ataca a una unidad: le pega `n` (con Veneno, si lo tiene) y recibe el daño de ella. */
function heroStrike(s: State, j: Side, t: Unit, n: number, name: string): void {
  const back = totalDamage(t.dmg);
  const poison = s.players[j].board.some((u) => !u.silenced && unitCard(u.card).powerPoison);
  const d = hurt(s, t, n, name, null);
  if (poison && d > 0 && t.hp > 0) {
    t.hp = 0;
    log(s, `  🧪 Veneno: ${t.name} queda en 0`);
  }
  changeLife(s, j, -back, `${t.name} devuelve el golpe`);
  checkDeaths(s);
}

/**
 * Usa el poder del héroe de `j` contra `target` (una unidad por uid o un héroe con `heroTarget`; null
 * si el poder no apunta). Cuesta 2 de energía y X es 2 (con `powerMode: 'all'`, gasta toda y X es la
 * energía), más lo que sumen las cartas.
 */
export function usePower(s: State, j: Side, target: number | null = null): void {
  if (!canUsePower(s, j)) throw new Error(`${s.players[j].name} no puede usar el poder ahora`);
  const opts = powerTargets(s, j);
  if (opts !== null && (target === null || !opts.includes(target))) throw new Error('objetivo inválido');
  if (opts === null) target = null;
  const p = s.players[j], h = hero(p.hero!);
  const x = powerX(s, j);
  const spent = s.cfg.powerMode === 'all' ? p.energy : powerCost(s.cfg);
  p.energy -= spent;
  p.usedTurn = s.turn;
  const unit = target !== null && target > 0 ? unitById(s, target) : null;
  const side = target !== null ? targetSide(target) : null;
  const to = unit ? ` a ${unit.name}` : side !== null ? ` a ${side === j ? 'sí mismo' : s.players[side].name}` : '';
  log(s, `${p.name} usa ${h.power.name}${s.cfg.powerMode === 'all' || x !== (s.cfg.powerMode === 'mana' ? 1 : POWER_MIN) ? ` (X = ${x})` : ''}${to}`, 'effect');
  emit(s, { kind: 'power', side: j, hero: h.id, target, x, cost: spent });
  current(s)?.powers.push({ side: j, text: `${h.power.name} (${x})${to}` });
  const name = h.power.name;
  switch (h.power.kind) {
    case 'fireblast':
      if (unit) hurt(s, unit, x, name, null);
      else changeLife(s, other(j), -x, name);
      break;
    case 'heal': {
      const n = healOf(s.cfg, x);
      if (unit) {
        unit.hp += n;
        unit.maxHp = Math.max(unit.maxHp, unit.hp);
        emit(s, { kind: 'heal', uid: unit.uid, amount: n });
        log(s, `  ${name}: ${unit.name} +${n} de vida`, 'effect');
      } else changeLife(s, j, n, name);
      break;
    }
    case 'steadyShot':
      changeLife(s, other(j), -(x + 1), name);
      break;
    case 'armor':
      changeLife(s, j, x + 1, name);
      break;
    case 'reinforce':
      summonUnit(s, j, 'h_recluta', true, undefined, { attack: x, hp: x });
      break;
    case 'dagger':
      if (unit) heroStrike(s, j, unit, x + 1, name);
      break;
    case 'totem':
      summonTotem(s, j, x);
      break;
    case 'shapeshift':
      changeLife(s, j, x, name);
      if (unit) heroStrike(s, j, unit, Math.max(1, x - 1), name);
      else if (side !== null) changeLife(s, side, -Math.max(1, x - 1), name);
      break;
    case 'claws':
      if (unit) {
        unit.dmg.attack += x;
        unit.bonus += x;
        emit(s, { kind: 'buff', uid: unit.uid, dmg: x, hp: 0 });
        log(s, `  ${name}: ${unit.name} +${x} de daño hasta el fin del turno`, 'effect');
      }
      break;
    case 'ghoul':
      summonUnit(s, j, 'h_necrofago', true, undefined, { attack: x });
      break;
  }
  checkDeaths(s);
  checkLife(s);
  if (over(s)) return;
  for (const u of [...p.board]) if (alive(s, u) && !over(s)) trigger(s, u, 'onPower');
}

export interface Preview {
  attacker: Unit | null;
  /** La atacada como queda (null si muere, o si se ataca al héroe). */
  defender: Unit | null;
  /** La vida de los dos jugadores después. */
  life: [number, number];
  /** Todas las que mueren o se destierran, incluidas las de efectos encadenados. */
  gone: string[];
  /** Golpe por golpe, como en el registro. */
  steps: string[];
}

/** Simula un ataque sin tocar el estado real. */
export function preview(s: State, aUid: number, dUid: number): Preview {
  const c = clone(s);
  c.quiet = false;
  const before = allUnits(c).map((u) => ({ uid: u.uid, name: u.name }));
  attack(c, aUid, dUid);
  return {
    attacker: unitById(c, aUid),
    defender: dUid > 0 ? unitById(c, dUid) : null,
    life: [c.players[0].life, c.players[1].life],
    gone: before.filter((x) => !unitById(c, x.uid)).map((x) => x.name),
    steps: c.log.slice(1).map((l) => l.text.trim()),
  };
}

/** Lo que está esperando el juego, para saber a quién le toca. */
export function waitingOn(s: State): { side: Side; what: 'pick' | 'target' | 'combat' | 'discard' }[] {
  if (s.phase === 'pick') return pickers(s).map((side) => ({ side, what: 'pick' as const }));
  if (s.phase === 'discard') return discarders(s).map((side) => ({ side, what: 'discard' as const }));
  if (s.phase === 'target' && s.pending) return [{ side: s.pending.player, what: 'target' }];
  if (s.phase === 'combat') return [{ side: s.attacker, what: 'combat' }];
  return [];
}

export type { PendingTarget };
