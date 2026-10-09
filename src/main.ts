// HortSton: juego de cartas sin azar, prototipo jugable en canvas.
// Este archivo une las piezas: el motor (core/), la mesa en canvas (game/), las pantallas en DOM (menu)
// y la entrada. La IA juega desde acá, de a un paso por vez y esperando que terminen las animaciones.
// ?bot en la URL saltea el menú y hace que la IA juegue los dos lados (para mirar o probar).
import { applyMove, bestMove, chooseDiscard, choosePendingTarget, choosePlay } from './core/ai';
import { card, DECKS } from './core/cards';
import { HEROES } from './core/heroes';
import {
  attack, attackTargets, canAttack, canUsePower, chooseTarget, cost, DEFAULT_CONFIG, discard, discarders, endCombat, freshCards, heroTarget, mana, newGame, options, pick,
  pickers, play, powerTargets, snapshot, unitById, usePower, waitingOn,
} from './core/rules';
import { setRulesText } from './core/text';
import type { GameEvent, Side, State } from './core/types';
import { Anim } from './game/anim';
import { loadArt } from './game/art';
import { Sound, type Sfx } from './game/sound';
import { View, type Hit, type UiState } from './game/view';
import { Input } from './input';
import { Menu, type Setup } from './menu';

declare global {
  interface Window {
    __hs: unknown;
  }
}

const params = new URLSearchParams(location.search);
const BOT = params.has('bot');
/** Cuántas acciones se pueden deshacer. */
const UNDO_MAX = 100;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const view = new View(canvas);
const anim = new Anim();
const menu = new Menu();
const sound = new Sound();
// el navegador no deja sonar nada hasta el primer click o tecla
for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, () => sound.unlock());

let setup: Setup = menu.read();
let game: State = makeGame(setup);
/** Hay una partida empezada (antes del primer «Jugar», la mesa de fondo es de adorno). */
let started = false;
let endShown = false;
/** Cuántos eventos del motor ya se pasaron a las animaciones. */
let seen = game.events.length;
let undoStack: State[] = [];
/** Desde cuándo puede jugar la IA (deja ver cada paso). */
let aiAt = 0;
/** El ataque que la IA ya marcó y va a hacer en el próximo paso. */
let aiAttack: { a: number; d: number } | null = null;
/**
 * El reloj del juego. Con la pestaña oculta el navegador frena requestAnimationFrame; `__hs.pump` lo
 * adelanta a mano (para pruebas y bots), y `skew` hace que el reloj nunca vaya para atrás.
 */
let skew = 0;
const clock = () => performance.now() + skew;

const ui: UiState = {
  selected: null,
  hover: null,
  view: 'board',
  aiMark: null,
  isAI: (side) => isAI(side),
  canUndo: false,
  aiTurn: false,
  placing: null,
  staged: null,
  pointer: null,
  aiming: null,
  sound: sound.mode,
};

function isAI(side: Side): boolean {
  return BOT || (setup.opponent === 'ai' && side === 1);
}

function makeGame(s: Setup): State {
  setRulesText({ ...DEFAULT_CONFIG, ...s.config });
  const names: [string, string] = s.opponent === 'ai' && !BOT ? ['Vos', 'IA'] : ['J1', 'J2'];
  return newGame({ decks: [DECKS[s.decks[0]], DECKS[s.decks[1]]], names, heroes: s.heroes, config: s.config });
}

function startMatch(s: Setup): void {
  setup = s;
  game = makeGame(setup);
  started = true;
  endShown = false;
  undoStack = [];
  seen = 0;
  aiAttack = null;
  ui.selected = null;
  ui.aiMark = null;
  ui.placing = null;
  ui.staged = null;
  ui.aiming = null;
  ui.view = 'board';
  anim.reset();
  menu.hide();
  menu.hideEnd();
  sync();
  menu.renderLog(game, true);
  aiAt = clock() + 500;
}

/** Después de cada cambio: animar lo nuevo, actualizar el historial y la selección. */
function sync(): void {
  const fresh = game.events.slice(seen);
  seen = game.events.length;
  anim.consume(fresh, (uid) => view.slot(game, uid), (side) => view.lifePos(side), view.centerPos(), (side) => view.powerPos(side), cueSound);
  menu.renderLog(game);
  if (ui.selected !== null && !canAttack(game, ui.selected)) ui.selected = null;
  if (ui.placing && !(game.phase === 'pick' && pickers(game).includes(ui.placing.side))) ui.placing = null;
  if (ui.staged && !(game.phase === 'pick' && pickers(game).includes(ui.staged.side))) ui.staged = null;
  if (ui.aiming !== null && !canUsePower(game, ui.aiming)) ui.aiming = null;
  ui.canUndo = undoStack.length > 0 && game.phase !== 'end';
}

/** El sonido de cada evento del motor, en el momento en que se anima. */
const SFX: Partial<Record<GameEvent['kind'], Sfx>> = {
  turn: 'turn', summon: 'summon', spell: 'spell', attack: 'attack', buff: 'buff', heal: 'heal', shield: 'shield', shieldBreak: 'block',
  silence: 'silence', lastStand: 'buff', evolve: 'buff', death: 'death', banish: 'death', face: 'face', energy: 'energy', freeze: 'freeze', final: 'face',
};

function cueSound(e: GameEvent, delay: number): void {
  if (e.kind === 'power') sound.power(HEROES[e.hero].power.kind, delay);
  else if (e.kind === 'damage') sound.play(e.blocked ? 'block' : 'hit', delay);
  else if (e.kind === 'life') sound.play(e.amount < 0 ? 'face' : 'heal', delay);
  else {
    const s = SFX[e.kind];
    if (s) sound.play(s, delay);
  }
}

/** Una acción del jugador: se guarda el estado para poder deshacerla. */
function act(fn: () => void): void {
  undoStack.push(snapshot(game));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  fn();
  sync();
}

function undo(): void {
  if (game.phase === 'end') return;
  const prev = undoStack.pop();
  if (!prev) return;
  game = prev;
  seen = game.events.length;
  aiAttack = null;
  ui.aiMark = null;
  ui.selected = null;
  ui.placing = null;
  ui.staged = null;
  ui.aiming = null;
  anim.reset();
  menu.renderLog(game, true);
  ui.canUndo = undoStack.length > 0;
  aiAt = clock() + 600;
}

function aiStep(now: number): void {
  if (!started || game.phase === 'end' || anim.busy() || now < aiAt || menu.open) return;
  if (aiAttack) {
    const m = aiAttack;
    aiAttack = null;
    ui.aiMark = null;
    attack(game, m.a, m.d);
    sync();
    aiAt = now + 250;
    return;
  }
  const w = waitingOn(game).find((x) => isAI(x.side));
  if (!w) return;
  if (w.what === 'pick') {
    const p = choosePlay(game, w.side);
    play(game, w.side, p.cards, p.places);
  } else if (w.what === 'discard') discard(game, w.side, chooseDiscard(game, w.side));
  else if (w.what === 'target') chooseTarget(game, w.side, choosePendingTarget(game));
  else {
    const m = bestMove(game);
    if (m?.kind === 'attack') {
      // primero se marca quién ataca a quién, y en el paso siguiente se ataca
      aiAttack = m;
      ui.aiMark = m;
      aiAt = now + 600;
      return;
    }
    if (m) applyMove(game, m);
    else endCombat(game);
  }
  sync();
  aiAt = now + 350;
}

function canPick(side: Side): boolean {
  return game.phase === 'pick' && pickers(game).includes(side) && !isAI(side);
}

function canDiscard(side: Side): boolean {
  return discarders(game).includes(side) && !isAI(side);
}

const withHand = () => game.cfg.cards === 'hand';

/**
 * Tocar la carta `index` de la mano. Descartando, la descarta (si es nueva). Con mano, la suma o la saca
 * de las que vas a jugar; sin mano, la juega. Un hechizo, o una unidad con la fila vacía, va directo; si
 * no, falta decir dónde va (la segunda vez que se toca la misma carta, va donde se estaba mostrando).
 */
function choose(side: Side, index: number): void {
  if (canDiscard(side)) {
    if (!freshCards(game, side).includes(index)) return;
    sound.play('pick');
    act(() => discard(game, side, index));
    return;
  }
  if (!canPick(side)) return;
  const st = withHand() ? staged(side) : null;
  if (st) {
    const k = st.cards.indexOf(index);
    if (k >= 0) {
      // ya estaba: se saca, y las que estaban a su derecha se corren
      const pos = st.places[k];
      st.cards.splice(k, 1);
      st.places.splice(k, 1);
      if (pos >= 0) st.places = st.places.map((x) => (x > pos ? x - 1 : x));
      ui.placing = null;
      sound.play('click');
      return;
    }
    if (cost(game, side, [...st.cards, index]) > mana(game, side)) {
      sound.play('block');
      return;
    }
  }
  sound.play('pick');
  const n = game.players[side].board.length + (st ? st.places.filter((x) => x >= 0).length : 0);
  const p = ui.placing;
  if (n === 0 || card(options(game, side)[index]).kind === 'spell') place(side, index, n);
  else if (p && p.side === side && p.index === index) place(side, index, p.pos);
  else ui.placing = { side, index, pos: p?.side === side ? Math.min(p.pos, n) : n };
}

/** Lo que está armando `side` para jugar (con mano). */
function staged(side: Side): { side: Side; cards: number[]; places: number[] } {
  if (ui.staged?.side !== side) ui.staged = { side, cards: [], places: [] };
  return ui.staged;
}

/** La carta va al lugar `pos` de la fila: con mano, se suma a las que vas a jugar; sin mano, se juega. */
function place(side: Side, index: number, pos: number): void {
  ui.placing = null;
  if (!withHand()) {
    act(() => pick(game, side, index, pos));
    return;
  }
  const st = staged(side);
  if (card(options(game, side)[index]).kind === 'spell') {
    st.cards.push(index);
    st.places.push(-1);
    return;
  }
  st.places = st.places.map((x) => (x >= pos ? x + 1 : x));
  st.cards.push(index);
  st.places.push(pos);
}

/** Con mano: juega lo que armaste (o nada). */
function commit(side: Side): void {
  const st = ui.staged?.side === side ? ui.staged : { cards: [], places: [] };
  ui.staged = null;
  ui.placing = null;
  sound.play('pick');
  act(() => play(game, side, st.cards, st.places));
}

/** Tocar el poder: si no apunta, se usa; si apunta, falta elegir a quién (tocarlo otra vez lo cancela). */
function power(side: Side): void {
  if (isAI(side) || !canUsePower(game, side)) return;
  if (ui.aiming === side) {
    ui.aiming = null;
    return;
  }
  ui.selected = null;
  if (powerTargets(game, side) === null) act(() => usePower(game, side));
  else {
    sound.play('click');
    ui.aiming = side;
  }
}

/** Con el poder apuntando: usarlo contra `target` (una unidad o un héroe), si vale. */
function aimAt(target: number): void {
  const side = ui.aiming;
  if (side === null) return;
  ui.aiming = null;
  if ((powerTargets(game, side) ?? []).includes(target)) act(() => usePower(game, side, target));
}

function onClick(h: Hit | null): void {
  const pl = ui.placing;
  if (pl && ui.pointer && view.inRow(pl.side, ui.pointer)) {
    place(pl.side, pl.index, view.insertIndex(game, pl.side, ui.pointer.x));
    return;
  }
  if (!h) {
    ui.selected = null;
    ui.placing = null;
    return;
  }
  if (ui.aiming !== null) {
    if (h.kind === 'unit') aimAt(h.uid);
    else if (h.kind === 'hero') aimAt(heroTarget(h.side));
    else if (h.kind === 'power') power(h.side);
    else ui.aiming = null;
    return;
  }
  if (h.kind === 'power') {
    power(h.side);
    return;
  }
  if (h.kind === 'button') {
    sound.play('click');
    switch (h.id) {
      case 'end': events.endTurn(); break;
      case 'undo': undo(); break;
      case 'decks': events.decks(); break;
      case 'log': events.log(); break;
      case 'sound': events.sound(); break;
      case 'menu': menu.show(started && game.phase !== 'end'); break;
    }
    return;
  }
  if (h.kind === 'hand') {
    choose(h.side, h.index);
    return;
  }
  if (pl) {
    ui.placing = null;
    return;
  }
  if (h.kind === 'hero') {
    // la que elegiste ataca al héroe rival
    const a = ui.selected, t = heroTarget(h.side);
    if (canHitHero(h.side) && a !== null) act(() => attack(game, a, t));
    return;
  }
  if (h.kind !== 'unit') return;
  const p = game.pending;
  if (game.phase === 'target' && p && !isAI(p.player)) {
    if (p.options.includes(h.uid)) act(() => chooseTarget(game, p.player, h.uid));
    return;
  }
  if (game.phase !== 'combat' || isAI(game.attacker)) return;
  const u = unitById(game, h.uid);
  if (!u) return;
  if (u.owner === game.attacker) {
    ui.selected = ui.selected === u.uid || !canAttack(game, u.uid) ? null : u.uid;
  } else if (ui.selected !== null && attackTargets(game, ui.selected).includes(u.uid)) {
    const a = ui.selected;
    act(() => attack(game, a, u.uid));
  }
}

/** La unidad que elegiste puede atacar al héroe de `side`. */
function canHitHero(side: Side): boolean {
  return game.phase === 'combat' && !isAI(game.attacker) && ui.selected !== null && attackTargets(game, ui.selected).includes(heroTarget(side));
}

function clickable(h: Hit | null): boolean {
  if (!h) return false;
  if (ui.aiming !== null) {
    const t = powerTargets(game, ui.aiming) ?? [];
    return h.kind === 'power' || (h.kind === 'unit' && t.includes(h.uid)) || (h.kind === 'hero' && t.includes(heroTarget(h.side)));
  }
  if (h.kind === 'power') return canUsePower(game, h.side) && !isAI(h.side);
  if (h.kind === 'hero') return canHitHero(h.side);
  if (h.kind === 'button') return true;
  if (h.kind === 'hand') return canDiscard(h.side) ? freshCards(game, h.side).includes(h.index) : canPick(h.side);
  if (h.kind !== 'unit') return false;
  if (game.phase === 'target') return !!game.pending && !isAI(game.pending.player) && game.pending.options.includes(h.uid);
  if (game.phase !== 'combat' || isAI(game.attacker)) return false;
  const u = unitById(game, h.uid);
  if (!u) return false;
  return u.owner === game.attacker ? canAttack(game, u.uid) : ui.selected !== null && attackTargets(game, ui.selected).includes(u.uid);
}

const events = {
  move(x: number, y: number) {
    if (menu.open) return;
    const p = view.toLogical(x, y);
    ui.pointer = p;
    ui.hover = view.hitAt(p);
    const pl = ui.placing;
    const onRow = !!pl && view.inRow(pl.side, p);
    if (pl && onRow) pl.pos = view.insertIndex(game, pl.side, p.x);
    canvas.style.cursor = onRow || clickable(ui.hover) ? 'pointer' : 'default';
  },
  click(x: number, y: number) {
    if (menu.open || !started) return;
    onClick(view.hitAt(view.toLogical(x, y)));
  },
  pickKey(i: number) {
    const j = [...pickers(game), ...discarders(game)].find((side) => !isAI(side));
    if (started && j !== undefined && i < options(game, j).length) choose(j, i);
  },
  nudge(d: number) {
    const pl = ui.placing;
    const st = ui.staged?.side === pl?.side ? ui.staged : null;
    if (pl) pl.pos = Math.max(0, Math.min(game.players[pl.side].board.length + (st ? st.places.filter((x) => x >= 0).length : 0), pl.pos + d));
  },
  endTurn() {
    const pl = ui.placing;
    if (pl) {
      place(pl.side, pl.index, pl.pos);
      return;
    }
    if (started && withHand() && game.phase === 'pick') {
      const j = ui.staged && canPick(ui.staged.side) ? ui.staged.side : pickers(game).find((side) => !isAI(side));
      if (j !== undefined) commit(j);
      return;
    }
    if (started && game.phase === 'combat' && !isAI(game.attacker)) {
      ui.selected = null;
      act(() => endCombat(game));
    }
  },
  cancel() {
    if (menu.open) {
      if (started && game.phase !== 'end') menu.hide();
    } else if (ui.aiming !== null) ui.aiming = null;
    else if (ui.placing) ui.placing = null;
    else if (ui.staged?.cards.length) ui.staged = null;
    else if (ui.view === 'decks') ui.view = 'board';
    else if (ui.selected !== null) ui.selected = null;
    else menu.show(started && game.phase !== 'end');
  },
  power() {
    if (started && game.phase === 'combat') power(game.attacker);
  },
  sound() {
    ui.sound = sound.cycle();
  },
  undo,
  decks() {
    ui.view = ui.view === 'decks' ? 'board' : 'decks';
    ui.hover = null;
  },
  log() {
    menu.toggleLog();
  },
  rules() {
    menu.showRules();
  },
  newGame() {
    startMatch(setup);
  },
};
new Input(events, canvas, () => menu.open);
menu.onPlay = startMatch;
menu.onResume = () => menu.hide();
menu.onRematch = () => startMatch(setup);

function fit(): void {
  view.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
}
addEventListener('resize', fit);
fit();

function step(t: number): void {
  const dt = anim.tick(t);
  ui.aiTurn = started && waitingOn(game).some((x) => isAI(x.side));
  aiStep(t);
  view.draw(game, ui, anim, dt);
  // el cartel del final, cuando terminan las animaciones del golpe final
  if (started && game.phase === 'end' && !endShown && !anim.busy()) {
    endShown = true;
    const r = game.result;
    sound.play(r && r.winner !== null && (setup.opponent !== 'ai' || r.winner === 0) ? 'win' : 'lose');
    menu.showEnd(game, setup.opponent === 'ai' && !BOT);
  }
}

function frame(): void {
  step(clock());
  requestAnimationFrame(frame);
}

void loadArt();
if (BOT) startMatch(setup);
else menu.show(false);
requestAnimationFrame(frame);

// para las pruebas desde la consola o con Playwright
window.__hs = {
  get game() {
    return game;
  },
  get busy() {
    return anim.busy() || ui.aiTurn;
  },
  ui,
  sound,
  start: (s?: Partial<Setup>) => startMatch({ ...setup, ...s }),
  act: (fn: (s: State) => void) => act(() => fn(game)),
  /** Adelanta el reloj `ms` milisegundos, de a cuadros de 16 ms. */
  pump(ms: number) {
    const end = skew + ms;
    while (skew < end) {
      skew += 16;
      step(clock());
    }
  },
};
