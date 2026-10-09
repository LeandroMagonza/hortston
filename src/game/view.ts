// La mesa: dónde va cada cosa, cómo se dibuja y qué hay bajo el mouse.
// Todo se dibuja en una pantalla lógica de 1280×720 que se escala al tamaño de la ventana.
// Abajo siempre está J1 y arriba J2 (la IA, si se juega contra la IA). Como en Hearthstone, el héroe
// rival (retrato y vida) está detrás de sus cartas, arriba al medio: se lo ataca tocándolo. El tuyo,
// abajo a la izquierda, al lado de tu mano.
//
//  ┌            ┐   mano de J2  (héroe de J2)   línea de turnos
//  │  carta     │   ── tablero de J2 ──             (poder de J2)
//  │  ampliada  │   ══ mensaje ══                 (Terminar turno)
//  │  y detalle │   ── tablero de J1 ──             (poder de J1)
//  └            ┘   (héroe de J1)  tu mano          botones
//                    tu maná
import { card, DECKS, OLD_DECKS, unitCard } from '../core/cards';
import { energyRule, HEROES, POWER_MIN, powerCost, powerText } from '../core/heroes';
import {
  attackerOf, attackTargets, candidates, canAttack, canUsePower, cost, discarders, faceBlocked, faceHits, freshCards, heroTarget, isSummonTurn,
  lastTurn, mana, options, pendingFace, pickedCard, pickers, powerTargets, powerX, preview, targetSide, turnOptions, unitById,
} from '../core/rules';
import type { Side, State, Unit } from '../core/types';
import { WEAPONS } from '../core/weapons';
import type { Anim, Point } from './anim';
import { artImage, drawCover } from './art';
import { drawIcon } from './icon';
import {
  BH, BOARD_SCALE, BW, C, CARD_H, CARD_W, drawCard, drawDetails, faceOfCard, faceOfUnit, font, gem, H, heart, outlined, rrect, W, wrap, type CardLook, type Face,
} from './draw';

export type ButtonId = 'end' | 'undo' | 'decks' | 'log' | 'sound' | 'menu';

export type Hit =
  | { kind: 'hand'; side: Side; index: number }
  | { kind: 'unit'; uid: number }
  | { kind: 'deck'; id: string }
  | { kind: 'button'; id: ButtonId }
  /** El botón del poder del héroe de ese lado. */
  | { kind: 'power'; side: Side }
  /** La placa de ese jugador (es el objetivo cuando un poder apunta a un héroe). */
  | { kind: 'hero'; side: Side };

export interface UiState {
  selected: number | null;
  hover: Hit | null;
  view: 'board' | 'decks';
  aiMark: { a: number; d: number } | null;
  isAI: (side: Side) => boolean;
  canUndo: boolean;
  aiTurn: boolean;
  /**
   * Elegiste una unidad y falta decir dónde va en tu fila: `pos` es el lugar entre las que se ven (las
   * tuyas y las que ya estás jugando; 0, la punta izquierda).
   */
  placing: { side: Side; index: number; pos: number } | null;
  /** Con mano: las cartas que vas a jugar (índices de la mano) y el lugar final de cada unidad (−1 los hechizos). */
  staged: { side: Side; cards: number[]; places: number[] } | null;
  /** Dónde está el mouse, en la pantalla lógica. */
  pointer: Point | null;
  /** Tocaste el poder de tu héroe y falta elegir a quién (el lado del héroe). */
  aiming: Side | null;
  /** Qué suena: todo, solo efectos o nada. */
  sound: 'all' | 'sfx' | 'off';
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  hit: Hit;
}

const MAIN_X0 = 262;
const MAIN_X1 = 1150;
const MAIN_CX = (MAIN_X0 + MAIN_X1) / 2;
const RIGHT_CX = 1216;
const HAND_SCALE = 0.92;
const OPP_SCALE = 0.6;
const ROW = { opp: 6, board1: 124, ribbon: 308, board0: 344, hand0: 524 };
const BOARD_Y: Record<Side, number> = { 0: ROW.board0, 1: ROW.board1 };
/** El retrato de cada héroe (el centro): el rival detrás de sus cartas; el tuyo, a la izquierda de tu mano. */
const HERO: Record<Side, Point> = { 0: { x: MAIN_X0 + 46, y: 566 }, 1: { x: MAIN_CX, y: 54 } };
const HERO_R = 40;
/** Tu mano empieza a la derecha de tu héroe. */
const HAND_X0 = MAIN_X0 + 96;
const END_BTN = { x: RIGHT_CX, y: ROW.ribbon, r: 46 };
/** El poder del héroe de cada uno, a la derecha de su fila. */
const POWER: Record<Side, Point> = { 0: { x: RIGHT_CX, y: 440 }, 1: { x: RIGHT_CX, y: 178 } };
const POWER_R = 31;

const other = (j: Side): Side => (j === 0 ? 1 : 0);

/** Una unidad por entrar en una fila: elegida y esperando, la que estás jugando, o la que estás ubicando. */
interface Ghost {
  id: string;
  pos: number;
  kind: 'waiting' | 'staged' | 'placing';
  /** Su lugar en la mano. */
  index: number;
}

type HandMode = 'pick' | 'discard' | 'idle';

export class View {
  private regions: Region[] = [];
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  /** El último estado de la interfaz que se dibujó (para saber quién es la IA fuera de `draw`). */
  private ui: UiState | null = null;
  readonly ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sin canvas 2D');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = Math.min(w / W, h / H);
    this.ox = (w - W * this.scale) / 2;
    this.oy = (h - H * this.scale) / 2;
  }

  /** De coordenadas de la página a la pantalla lógica. */
  toLogical(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }

  hitAt(p: Point): Hit | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.hit;
    }
    return null;
  }

  /** El lugar de una unidad viva en su fila (esquina de la carta, a escala de tablero). */
  slot(s: State, uid: number): Point | null {
    for (const side of [0, 1] as const) {
      const i = s.players[side].board.findIndex((u) => u.uid === uid);
      if (i >= 0) return this.rowSlot(s, side, i);
    }
    return null;
  }

  /** El lugar de la unidad `i` de una fila; si hay cartas por entrar, les hace lugar y corre a las demás. */
  private rowSlot(s: State, side: Side, i: number): Point {
    const ghosts = this.ghosts(s, side);
    const taken = new Set(ghosts.map((g) => g.pos));
    const n = s.players[side].board.length + ghosts.length;
    let k = 0;
    for (let pos = 0; pos < n; pos++) {
      if (taken.has(pos)) continue;
      if (k === i) return slotAt(side, n, pos);
      k++;
    }
    return slotAt(side, n, i);
  }

  /**
   * Las unidades por entrar en una fila, con su lugar final: las que eligió y esperan al otro, las que
   * estás jugando y (si `placing`) la que estás ubicando.
   */
  private ghosts(s: State, side: Side, placing = true): Ghost[] {
    if (s.phase !== 'pick') return [];
    const hand = s.players[side].hand;
    const units = (cards: number[], places: number[], kind: Ghost['kind']): Ghost[] =>
      cards.flatMap((index, k) => (places[k] >= 0 ? [{ id: hand[index].id, pos: places[k], kind, index }] : []));
    const picked = s.picks[side];
    if (picked) return this.secret(s, side) ? [] : units(picked.cards, picked.places, 'waiting');
    const st = this.ui?.staged;
    let out = st && st.side === side ? units(st.cards, st.places, 'staged') : [];
    const p = this.ui?.placing;
    if (placing && p && p.side === side) {
      const n = s.players[side].board.length + out.length;
      const pos = Math.min(p.pos, n);
      out = out.map((g) => (g.pos >= pos ? { ...g, pos: g.pos + 1 } : g));
      out.push({ id: hand[p.index].id, pos, kind: 'placing', index: p.index });
    }
    return out;
  }

  /** Si el punto está sobre la fila de `side` (para elegir dónde va la carta). */
  inRow(side: Side, p: Point): boolean {
    return p.x >= MAIN_X0 && p.x <= MAIN_X1 && p.y >= BOARD_Y[side] - 14 && p.y <= BOARD_Y[side] + BH + 14;
  }

  /** En qué lugar de la fila cae una carta soltada en `x`: cuántas de las que se ven quedan a la izquierda. */
  insertIndex(s: State, side: Side, x: number): number {
    const n = s.players[side].board.length + this.ghosts(s, side, false).length;
    let k = 0;
    while (k < n && slotAt(side, n, k).x + BW / 2 < x) k++;
    return k;
  }

  /** La elección de `side` todavía no se puede mostrar. */
  private secret(s: State, side: Side): boolean {
    return s.cfg.pickMode === 'simultaneous' && s.phase === 'pick' && !this.ui?.isAI(other(side));
  }

  lifePos(side: Side): Point {
    return HERO[side];
  }

  powerPos(side: Side): Point {
    return POWER[side];
  }

  centerPos(): Point {
    return { x: MAIN_CX - BW / 2, y: ROW.ribbon - BH / 2 };
  }

  // ───────────────────────── dibujo ─────────────────────────

  draw(s: State, ui: UiState, anim: Anim, dt: number): void {
    const ctx = this.ctx;
    this.regions = [];
    this.ui = ui;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a0f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);

    this.drawTable();
    if (ui.view === 'decks') this.drawDecks(s);
    else {
      this.drawOppOptions(s, ui);
      this.drawRibbon(s, ui);
      for (const side of [1, 0] as const) this.drawBoard(s, ui, anim, side, dt);
      for (const side of [1, 0] as const) this.drawHero(s, ui, anim, side);
      this.drawHand(s, ui, anim);
      this.drawArrow(s, ui, anim);
      this.drawEffects(anim);
    }
    this.drawTimeline(s);
    this.drawEndButton(s, ui, anim);
    for (const side of [1, 0] as const) this.drawPower(s, ui, anim, side);
    this.drawButtons(ui);
    this.drawLeft(s, ui);
  }

  private region(x: number, y: number, w: number, h: number, hit: Hit): void {
    this.regions.push({ x, y, w, h, hit });
  }

  private drawTable(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(MAIN_CX, ROW.ribbon, 60, MAIN_CX, ROW.ribbon, 760);
    g.addColorStop(0, '#24384d');
    g.addColorStop(0.55, '#152230');
    g.addColorStop(1, '#090e15');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // las dos mitades de la mesa, apenas teñidas con el color de cada uno
    for (const side of [0, 1] as const) {
      const y0 = BOARD_Y[side] - 6;
      const lg = ctx.createLinearGradient(0, y0, 0, y0 + BH + 12);
      lg.addColorStop(0, 'rgba(0,0,0,0)');
      lg.addColorStop(0.5, side === 0 ? 'rgba(63,210,181,.06)' : 'rgba(255,154,82,.06)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(MAIN_X0, y0, MAIN_X1 - MAIN_X0, BH + 12);
    }
    // la columna de la izquierda
    const lg = ctx.createLinearGradient(0, 0, 252, 0);
    lg.addColorStop(0, 'rgba(5,8,12,.85)');
    lg.addColorStop(1, 'rgba(5,8,12,.55)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, 252, H);
  }

  // ───────────────────────── placas, mensaje, botones ─────────────────────────

  /**
   * El héroe de un jugador: el retrato, la vida (abajo a la derecha, como en Hearthstone) y si ataca. Es
   * el objetivo cuando una unidad ataca al rival y cuando un poder apunta a un héroe.
   */
  private drawHero(s: State, ui: UiState, anim: Anim, side: Side): void {
    const ctx = this.ctx;
    const p = s.players[side];
    const { x, y } = HERO[side];
    const r = HERO_R;
    const hero = p.hero ? HEROES[p.hero] : null;
    const target = heroTarget(side);
    const attacking = s.phase !== 'end' && s.attacker === side;
    const hovered = ui.hover?.kind === 'hero' && ui.hover.side === side;
    const attackable = ui.selected !== null && s.phase === 'combat' && !ui.isAI(s.attacker) && attackTargets(s, ui.selected).includes(target);
    const aimed = aimTargets(s, ui).includes(target);
    const marked = ui.aiMark?.d === target;
    const pulse = 0.5 + 0.5 * Math.sin(anim.now / 220);
    const ring = attackable || marked ? C.red : aimed ? C.blue : attacking ? C.side[side] : 'rgba(255,255,255,.2)';
    ctx.save();
    if (attackable || aimed || marked || attacking) {
      ctx.shadowColor = ring;
      ctx.shadowBlur = attackable || aimed ? 12 + 10 * pulse : 16;
    }
    const g = ctx.createRadialGradient(x - 4, y - 6, 4, x, y, r);
    g.addColorStop(0, C.side[side]);
    g.addColorStop(1, '#0d141d');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    const portrait = hero ? artImage(`heroe_${hero.id}`) : null;
    if (portrait) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, portrait, x - r, y - r, 2 * r, 2 * r);
      ctx.restore();
    } else {
      const deck = [...Object.values(DECKS), ...Object.values(OLD_DECKS)].find((d) => d.name === p.deck);
      drawIcon(ctx, hero ? `heroe_${hero.id}` : `mazo_${deck?.id}`, x, y - 2, r * 1.3, ['#ffffff', '#d9cfb8'], 'rgba(0,0,0,.8)');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = attackable || aimed || marked ? 4 : 3;
    ctx.strokeStyle = ring;
    if ((attackable || aimed) && !hovered) ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    // la vida
    const life = anim.shown(`life${side}`, p.life);
    heart(ctx, x + r * 0.8, y + r * 0.62, 21, life, life < s.cfg.startingLife ? -1 : 0);
    // abajo, el nombre y qué hace este turno
    const picked = s.cfg.pickMode === 'simultaneous' && s.phase === 'pick' && s.picks[side] !== null;
    const what = s.phase === 'end' ? '' : picked ? '✓ ELIGIÓ' : attacking ? 'ATACA' : 'DEFIENDE';
    const label = what ? `${p.name.toUpperCase()} · ${what}` : p.name.toUpperCase();
    const lit = attacking && !picked;
    font(ctx, 10, '800');
    const w = ctx.measureText(label).width + 16;
    rrect(ctx, x - w / 2, y + r + 3, w, 17, 8.5);
    ctx.fillStyle = lit ? C.side[side] : 'rgba(10,16,24,.92)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = lit ? '#0b1118' : picked ? C.green : C.side[side];
    ctx.fillText(label, x, y + r + 15.5);
    ctx.textAlign = 'left';
    this.region(x - r, y - r, 2 * r, 2 * r, { kind: 'hero', side });
  }

  private drawRibbon(s: State, ui: UiState): void {
    const ctx = this.ctx;
    const y = ROW.ribbon;
    const g = ctx.createLinearGradient(MAIN_X0, 0, MAIN_X1, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.15, 'rgba(0,0,0,.45)');
    g.addColorStop(0.85, 'rgba(0,0,0,.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(MAIN_X0, y - 28, MAIN_X1 - MAIN_X0, 56);
    const { main, sub } = this.message(s, ui);
    ctx.textAlign = 'center';
    font(ctx, 18, '800');
    outlined(ctx, main, MAIN_CX, y - 2, C.text, 'rgba(0,0,0,.9)', 4);
    if (sub) {
      font(ctx, 12.5, 'bold');
      outlined(ctx, wrap(ctx, sub, MAIN_X1 - MAIN_X0 - 60, 1)[0], MAIN_CX, y + 18, C.gold, 'rgba(0,0,0,.9)', 3);
    }
    ctx.textAlign = 'left';
  }

  private message(s: State, ui: UiState): { main: string; sub: string } {
    const name = (j: Side) => s.players[j].name;
    // contra la IA se le habla de vos al que juega («atacás»); entre dos, en tercera («J1 ataca»)
    const says = (j: Side, you: string, they: string) => (s.players[j].name === 'Vos' ? you : `${name(j)} ${they}`);
    const A = s.attacker, D = other(A);
    if (s.phase === 'end' && s.result) {
      const r = s.result;
      return { main: r.winner === null ? 'Empate' : `Gana ${name(r.winner)}`, sub: r.early ? 'Alguien llegó a 0 de vida.' : `Golpe final: ${name(0)} ${r.finalDamage[0]}, ${name(1)} ${r.finalDamage[1]}` };
    }
    if (s.phase === 'pick' && ui.placing) {
      return { main: `¿Dónde va ${card(options(s, ui.placing.side)[ui.placing.index]).name}?`, sub: 'Mové el mouse sobre tu fila y hacé click (o ← → y Enter) · Esc cancela' };
    }
    const hand = s.cfg.cards === 'hand';
    if (s.phase === 'discard') {
      const people = discarders(s).filter((j) => !ui.isAI(j));
      if (!people.length) return { main: `${discarders(s).map(name).join(' y ')} está descartando…`, sub: '' };
      return { main: 'Descartá una de las nuevas', sub: `Tocá una de las marcadas en rojo; las otras te quedan en la mano · ${people.length > 1 ? 'en secreto' : 'el rival no ve cuál'}` };
    }
    if (s.phase === 'pick') {
      const who = pickers(s);
      if (s.cfg.pickMode === 'simultaneous') {
        const attacks = capital(says(A, 'atacás vos', 'ataca'));
        const people = who.filter((j) => !ui.isAI(j));
        if (!people.length) return { main: `${who.map(name).join(' y ')} está eligiendo…`, sub: attacks };
        const rival = other(people[0]);
        const round = isSummonTurn(s) ? `Turno ${s.turn}` : `Ronda ${s.turn}`;
        if (hand) {
          const st = ui.staged?.side === people[0] ? ui.staged : null;
          const me = people[0];
          const left = mana(s, me) - (st ? cost(s, me, st.cards) : 0);
          const what = st?.cards.length ? `te queda${left === 1 ? '' : 'n'} ${left} de maná · JUGAR (Espacio)` : 'tocá las que vas a jugar y después JUGAR (Espacio)';
          // el poder se paga con lo que no gastes, en tu ataque
          const power = s.cfg.powerMode === 'mana' && s.players[me].hero && A === me ? ' · el poder cuesta 1 de lo que te sobre' : '';
          return { main: `${round}: jugá de tu mano (maná ${mana(s, me)})`, sub: `${capital(what)}${power} · ${people.length === 1 && ui.isAI(rival) ? `${name(rival)} elige a la vez` : 'en secreto'} · ${attacks}` };
        }
        if (people.length === 1 && ui.isAI(rival)) {
          const done = s.picks[rival] !== null;
          return { main: `${round}: elegí tu carta`, sub: `${name(rival)} ${done ? 'ya eligió' : 'elige a la vez'}, sin ver la tuya · ${attacks}` };
        }
        return { main: `${round}: elijan en secreto`, sub: `Falta ${who.map(name).join(' y ')} · ${attacks}` };
      }
      if (who[0] === A) {
        return ui.isAI(A)
          ? { main: `${name(A)} está eligiendo…`, sub: `Ataca ${name(A)}: elige primero y ${name(D)} responde` }
          : { main: `Turno ${s.turn}: ${says(A, 'atacás y elegís primero', 'ataca y elige primero')}`, sub: `${name(D)} va a ver la carta antes de responder` };
      }
      const first = pickedCard(s, A);
      const c = first ? card(first) : null;
      const what = c ? c.name : 'que no jugó nada';
      return ui.isAI(D)
        ? { main: `${name(D)} está respondiendo…`, sub: `a ${what}` }
        : { main: `${capital(says(D, 'defendés', 'defiende'))}: respondé a ${what}`, sub: c?.fast ? `${c.name} es Rápida: se resuelve antes que la tuya` : orderRule(s) };
    }
    if (s.phase === 'target' && s.pending) {
      const p = s.pending;
      return ui.isAI(p.player)
        ? { main: `${name(p.player)} apunta ${card(p.card).name}…`, sub: '' }
        : { main: `Elegí el objetivo de ${card(p.card).name}`, sub: 'Tocá una de las cartas marcadas en celeste' };
    }
    if (s.phase === 'combat' && ui.aiming !== null && s.players[ui.aiming].hero) {
      const p = s.players[ui.aiming], h = HEROES[p.hero!];
      return { main: `${h.power.name}: elegí el objetivo`, sub: `${capital(powerText(h.id, powerX(s, ui.aiming), p.totems, s.cfg))} · Esc cancela` };
    }
    if (s.phase === 'combat') {
      const round = isSummonTurn(s) ? '' : ' · ronda sin cartas';
      if (ui.isAI(A)) return { main: `${name(A)} ataca${round}`, sub: '' };
      const power = canUsePower(s, A) ? ' · tu poder está listo (P)' : '';
      if (!anyHumanAttack(s)) {
        const asleep = s.players[A].board.some((u) => sleeping(s, u));
        const face = faceNote(s);
        return { main: `No quedan ataques${round}`, sub: `${asleep ? '💤 La que entró ataca el turno que viene · ' : ''}Terminá el turno (Espacio)${face ? `: ${face}` : ''}${power}` };
      }
      const t = hoverTarget(ui);
      if (ui.selected !== null && t !== null && attackTargets(s, ui.selected).includes(t)) {
        return { main: `${capital(says(A, 'atacás', 'ataca'))}${round}`, sub: shortPreview(s, ui.selected, t) };
      }
      const left = s.cfg.maxAttacks > 0 ? s.cfg.maxAttacks - s.attacksMade : 0;
      let budget = (left === 1 ? ' · te queda 1 ataque' : left > 1 ? ` · te quedan ${left} ataques` : '') + power;
      if (s.players[A].board.some((u) => sleeping(s, u))) budget += ' · 💤 la que entró ataca el turno que viene';
      const face = faceNote(s);
      return {
        main: `${capital(says(A, 'atacás', 'ataca'))}${round}`,
        sub: ui.selected !== null ? `Elegí a quién (marcados en rojo)${s.cfg.scoring === 'hero' && !faceBlocked(s, A) ? ': una enemiga o el héroe rival' : ''}`
          : face ? `Tocá una tuya y un enemigo, o terminá: ${face}${budget}`
          : `Tocá una carta tuya y después a quién atacar${s.cfg.scoring === 'hero' ? ' (una enemiga o el héroe)' : ''}${budget} · es opcional`,
      };
    }
    return { main: '', sub: '' };
  }

  private drawEndButton(s: State, ui: UiState, anim: Anim): void {
    const ctx = this.ctx;
    const { x, y, r } = END_BTN;
    // con mano, mientras elegís, es el botón para jugar lo que armaste (o pasar)
    const playing = s.cfg.cards === 'hand' && s.phase === 'pick' && pickers(s).some((j) => !ui.isAI(j));
    const mine = playing || (s.phase === 'combat' && !ui.isAI(s.attacker));
    const ready = playing || (mine && !anyHumanAttack(s) && !canUsePower(s, s.attacker));
    const hover = ui.hover?.kind === 'button' && ui.hover.id === 'end';
    ctx.save();
    if (ready) {
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16 + 10 * Math.sin(anim.now / 260);
    }
    const g = ctx.createRadialGradient(x - 12, y - 14, 4, x, y, r);
    if (mine) {
      g.addColorStop(0, hover || ready ? '#9dffb0' : '#6fd986');
      g.addColorStop(1, '#1f7a36');
    } else {
      g.addColorStop(0, '#3a4556');
      g.addColorStop(1, '#161d27');
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.stroke();
    font(ctx, 12.5, '800');
    ctx.textAlign = 'center';
    ctx.fillStyle = mine ? '#0b2412' : 'rgba(255,255,255,.35)';
    const yourPick = (s.phase === 'pick' && pickers(s).some((j) => !ui.isAI(j))) || (s.phase === 'target' && !!s.pending && !ui.isAI(s.pending.player));
    const yourDiscard = discarders(s).some((j) => !ui.isAI(j));
    if (playing) {
      ctx.fillText(ui.staged?.cards.length ? 'JUGAR' : 'PASAR', x, y + 4);
    } else {
      ctx.fillText(mine ? 'TERMINAR' : s.phase === 'end' ? 'FIN' : yourDiscard ? 'DESCARTÁ' : yourPick ? 'ELEGÍ' : 'ESPERÁ', x, y + (mine ? -2 : 4));
      if (mine) ctx.fillText('TURNO', x, y + 13);
    }
    ctx.textAlign = 'left';
    if (mine) this.region(x - r, y - r, 2 * r, 2 * r, { kind: 'button', id: 'end' });
  }

  /** El poder del héroe: el dibujo del poder, la energía y en qué está (listo, usado, falta energía). */
  private drawPower(s: State, ui: UiState, anim: Anim, side: Side): void {
    const p = s.players[side];
    if (!p.hero) return;
    const h = HEROES[p.hero];
    const ctx = this.ctx;
    const { x, y } = POWER[side];
    const r = POWER_R;
    const ready = canUsePower(s, side);
    const yours = ready && !ui.isAI(side);
    const aiming = ui.aiming === side;
    const hover = ui.hover?.kind === 'power' && ui.hover.side === side;
    const fixed = s.cfg.powerMode !== 'all';
    const price = powerCost(s.cfg);
    const used = s.cfg.powerMode === 'mana' && p.usedTurn === s.turn && s.phase === 'combat' && s.attacker === side;
    font(ctx, 9.5, '800');
    ctx.textAlign = 'center';
    ctx.fillStyle = C.side[side];
    ctx.fillText(p.name === 'Vos' ? 'TU PODER' : `PODER DE ${p.name.toUpperCase()}`, x, y - r - 9);
    ctx.save();
    if (aiming || yours) {
      ctx.shadowColor = aiming ? C.gold : C.green;
      ctx.shadowBlur = 14 + 8 * Math.sin(anim.now / 260);
    }
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, r);
    g.addColorStop(0, hover && yours ? '#6a5a9a' : '#4a3d72');
    g.addColorStop(1, '#171126');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = aiming ? C.gold : ready ? C.green : 'rgba(0,0,0,.75)';
    ctx.stroke();
    ctx.globalAlpha = p.energy >= price && !used ? 1 : 0.4;
    drawIcon(ctx, `poder_${h.power.kind}`, x, y - 1, 34, ['#fff6dc', '#e0b25a'], 'rgba(0,0,0,.8)');
    ctx.globalAlpha = 1;
    // la energía, en una piedra azul abajo a la derecha
    gem(ctx, x + r * 0.78, y + r * 0.72, 12, { value: p.energy, color: '#2f6fd6', icon: null });
    ctx.textAlign = 'center';
    font(ctx, 10, 'bold');
    ctx.fillStyle = C.text;
    let ly = y + r + 16;
    for (const l of wrap(ctx, h.power.name, 108, 2)) {
      ctx.fillText(l, x, ly);
      ly += 12;
    }
    const bonus = powerX(s, side) - (s.cfg.powerMode === 'mana' ? 1 : fixed ? POWER_MIN : p.energy);
    const key = ui.isAI(side) ? '' : ' · P';
    const unit = s.cfg.powerMode === 'mana' ? 'de maná' : 'de energía';
    const state = s.cfg.powerMode === 'off' ? 'apagado (reglas en prueba)'
      : used ? 'ya lo usó este turno'
      : s.cfg.powerMode === 'mana' && !(s.phase === 'combat' && s.attacker === side) ? `cuesta ${price} · al atacar`
      : p.energy < price ? (s.cfg.powerMode === 'mana' ? 'sin maná (gastaste todo)' : `necesita ${price} ${unit}`)
      : fixed ? (ready ? `listo · cuesta ${price}${key}` : `cuesta ${price} · en su ataque`)
      : ready ? `listo · X = ${powerX(s, side)}${key}`
      : `X = ${powerX(s, side)} · en su ataque`;
    font(ctx, 9.5, bonus > 0 ? 'bold' : '');
    ctx.fillStyle = ready ? C.green : C.dim;
    ctx.fillText(bonus > 0 ? `${state} (+${bonus})` : state, x, ly);
    ctx.textAlign = 'left';
    this.region(x - r, y - r, 2 * r, 2 * r, { kind: 'power', side });
  }

  private drawButtons(ui: UiState): void {
    const items: { id: ButtonId; label: string; disabled?: boolean }[] = [
      { id: 'decks', label: ui.view === 'decks' ? 'Mesa (M)' : 'Mazos (M)' },
      { id: 'undo', label: 'Deshacer (Z)', disabled: !ui.canUndo },
      { id: 'log', label: 'Historial (H)' },
      { id: 'sound', label: ui.sound === 'all' ? '🔊 Sonido (S)' : ui.sound === 'sfx' ? '🔉 Sin música (S)' : '🔇 Sin sonido (S)' },
      { id: 'menu', label: 'Menú (Esc)' },
    ];
    const ctx = this.ctx;
    items.forEach((b, i) => {
      const x = RIGHT_CX - 52, y = 524 + i * 38, w = 104, h = 30;
      const hover = ui.hover?.kind === 'button' && ui.hover.id === b.id && !b.disabled;
      ctx.globalAlpha = b.disabled ? 0.35 : 1;
      rrect(ctx, x, y, w, h, 15);
      ctx.fillStyle = hover ? 'rgba(255,214,107,.22)' : 'rgba(10,16,24,.85)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hover ? C.gold : 'rgba(255,255,255,.18)';
      ctx.stroke();
      font(ctx, 11.5, 'bold');
      ctx.fillStyle = hover ? C.gold : C.text;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, x + w / 2, y + 19);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      if (!b.disabled) this.region(x, y, w, h, { kind: 'button', id: b.id });
    });
  }

  private drawTimeline(s: State): void {
    const ctx = this.ctx;
    // peleando hasta 0 no hay último turno fijo: se muestran los que van (los últimos 13)
    const last = s.cfg.scoring === 'final' ? lastTurn(s) : Math.max(10, s.turn);
    const first = Math.max(1, last - 12);
    const x0 = 866, y = 30, step = 29;
    font(ctx, 9.5, '800');
    ctx.fillStyle = C.dim;
    ctx.fillText('TURNOS', x0 - 12, 11);
    for (let t = first; t <= last; t++) {
      const x = x0 + (t - first) * step;
      const at = attackerOf(s.cfg, t);
      const current = t === s.turn && s.phase !== 'end';
      const past = t < s.turn || s.phase === 'end';
      const r = current ? 13 : 10.5;
      const noCards = t > 9;
      ctx.save();
      ctx.globalAlpha = past ? 0.32 : 1;
      if (current) {
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = noCards ? 'rgba(10,16,24,.9)' : C.side[at];
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = current ? 2.5 : 1.5;
      ctx.strokeStyle = current ? C.gold : noCards ? C.side[at] : 'rgba(0,0,0,.7)';
      if (noCards) ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      font(ctx, current ? 13 : 11, '800');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = noCards ? C.side[at] : '#0b1118';
      ctx.fillText(String(t), x, y + 1);
      ctx.restore();
    }
    font(ctx, 9.5);
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`color: quién ataca${last > 9 ? ` · punteados: sin cartas${s.cfg.scoring === 'final' ? '' : ' (cansancio)'}` : ''}`, x0 - 12, y + 28);
  }

  // ───────────────────────── cartas ─────────────────────────

  /** Cómo se ve la carta `i` de la mano de `side`, y cuánto se levanta. */
  private handLook(s: State, ui: UiState, side: Side, i: number, mode: HandMode): { look: CardLook; lift: number } {
    const hovered = ui.hover?.kind === 'hand' && ui.hover.side === side && ui.hover.index === i;
    const look: CardLook = { frame: C.side[side] };
    const st = ui.staged?.side === side ? ui.staged : null;
    const picked = s.phase === 'pick' ? s.picks[side]?.cards ?? [] : [];
    if (ui.placing?.side === side && ui.placing.index === i) {
      look.glow = C.gold;
      look.ring = C.gold;
      return { look, lift: -18 };
    }
    if (mode === 'discard') {
      if (!freshCards(s, side).includes(i)) return { look: { ...look, dim: true }, lift: 0 };
      look.glow = hovered ? C.red : 'rgba(255,91,91,.6)';
      look.ring = C.red;
      look.ringDashed = !hovered;
      return { look, lift: hovered ? -14 : -4 };
    }
    if (st?.cards.includes(i) || (picked.includes(i) && !this.secret(s, side))) {
      look.ring = C.gold;
      look.glow = 'rgba(255,214,107,.5)';
      return { look, lift: -22 };
    }
    if (mode === 'pick') {
      const left = mana(s, side) - (st ? cost(s, side, st.cards) : 0);
      if (s.cfg.cards === 'hand' && card(s.players[side].hand[i].id).rank > left) return { look: { ...look, dim: true }, lift: 0 };
      look.glow = hovered ? C.gold : 'rgba(255,214,107,.55)';
      return { look, lift: hovered ? -14 : -4 };
    }
    if (picked.length && !this.secret(s, side)) look.dim = true;
    return { look, lift: 0 };
  }

  /** En qué anda la mano de `side`: eligiendo, descartando o mirando. */
  private handMode(s: State, ui: UiState, side: Side): HandMode {
    if (ui.isAI(side)) return 'idle';
    if (s.phase === 'pick' && pickers(s).includes(side)) return 'pick';
    if (discarders(s).includes(side)) return 'discard';
    return 'idle';
  }

  /** Arriba: la mano del rival. Si es la IA, lo que sabés: lo que le llegó y no jugó (no sabés qué descartó). */
  private drawOppOptions(s: State, ui: UiState): void {
    const ctx = this.ctx;
    const side: Side = 1;
    const hand = s.cfg.cards === 'hand';
    const secretHand = hand && ui.isAI(side);
    const cards = secretHand ? candidates(s, side) : s.players[side].hand;
    const sc = hand ? 0.5 : OPP_SCALE;
    const cw = CARD_W * sc, gap = 8;
    // a la izquierda de su héroe (el cartel va en la columna de la izquierda)
    const minX = MAIN_X0, maxX = HERO[side].x - HERO_R - 26;
    const step = cards.length > 1 ? Math.min(cw + gap, (maxX - minX - cw) / (cards.length - 1)) : 0;
    const total = cards.length > 1 ? (cards.length - 1) * step + cw : cw;
    const x0 = Math.max(minX, (minX + maxX) / 2 - total / 2);
    const name = s.players[side].name.toUpperCase();
    const lx = MAIN_X0 - 12;
    font(ctx, 9.5, '800');
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'right';
    ctx.fillText(hand ? `MANO DE ${name}` : `OPCIONES DE ${name}`, lx, 30);
    font(ctx, 9.5);
    const n = s.players[side].hand.length;
    const note = !hand ? (cards.length ? `turno ${s.turn}` : '') : secretHand && cards.length > n ? `tiene ${n} de estas ${cards.length}` : `tiene ${n}`;
    ctx.fillText(note, lx, 44);
    if (hand) ctx.fillText(`maná ${mana(s, side)}`, lx, 58);
    ctx.textAlign = 'left';
    const mode = this.handMode(s, ui, side);
    cards.forEach((c, i) => {
      const x = x0 + i * step, y = ROW.opp;
      const { look, lift } = secretHand ? { look: { frame: C.side[side] } as CardLook, lift: 0 } : this.handLook(s, ui, side, i, mode);
      ctx.save();
      ctx.translate(x, y + Math.max(0, lift / 3));
      ctx.scale(sc, sc);
      drawCard(ctx, faceOfCard(c.id), look);
      ctx.restore();
      // las de la IA se pueden mirar pero no tocar (y no dicen cuál tiene)
      const w = i < cards.length - 1 ? step : cw;
      this.region(x, y, w, CARD_H * sc, secretHand ? { kind: 'deck', id: c.id } : { kind: 'hand', side, index: i });
    });
  }

  private drawHand(s: State, ui: UiState, anim: Anim): void {
    const ctx = this.ctx;
    const side: Side = 0;
    const ids = options(s, side);
    const hand = s.cfg.cards === 'hand';
    if (hand && s.phase === 'pick') this.drawMana(s, ui, side);
    if (!ids.length) {
      if (s.phase !== 'end') {
        font(ctx, 14, 'bold');
        ctx.textAlign = 'center';
        outlined(ctx, hand ? 'Sin cartas en la mano' : 'Ronda sin cartas: solo combate', (HAND_X0 + MAIN_X1) / 2, ROW.hand0 + 70, C.dim);
        ctx.textAlign = 'left';
      }
      return;
    }
    const cw = CARD_W * HAND_SCALE, ch = CARD_H * HAND_SCALE, gap = 22;
    // con mano puede haber muchas: se pisan un poco para entrar
    const left = HAND_X0, right = MAIN_X1 - 6;
    const step = ids.length > 1 ? Math.min(cw + gap, (right - left - cw) / (ids.length - 1)) : 0;
    const x0 = (left + right) / 2 - ((ids.length - 1) * step + cw) / 2;
    const mode = this.handMode(s, ui, side);
    const busy = ui.placing?.side === side || (ui.staged?.side === side && ui.staged.cards.length > 0);
    if (mode !== 'idle' && !busy) {
      font(ctx, 13, '800');
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(anim.now / 300);
      const title = mode === 'discard' ? 'D E S C A R T Á   U N A   N U E V A' : hand ? 'E L E G Í   Q U É   J U G A R' : 'E L E G Í   U N A';
      outlined(ctx, title, (left + right) / 2, ROW.hand0 - 18, mode === 'discard' ? '#ff9a9a' : C.gold, C.goldDeep, 4);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    const hidden = this.secret(s, side);
    const picked = s.phase === 'pick' ? s.picks[side] : null;
    const hoverAt = ui.hover?.kind === 'hand' && ui.hover.side === side ? ui.hover.index : -1;
    // la que tiene el mouse se dibuja última, arriba de las que pisa
    const order = ids.map((_, i) => i).filter((i) => i !== hoverAt);
    if (hoverAt >= 0 && hoverAt < ids.length) order.push(hoverAt);
    for (const i of order) {
      const id = ids[i];
      // sin mano, la elegida ya se ve en la fila (o en grande, si es un hechizo)
      if (!hand && picked?.cards.includes(i) && !hidden) continue;
      const x = x0 + i * step;
      const { look, lift } = this.handLook(s, ui, side, i, mode);
      const y = ROW.hand0 + lift;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(HAND_SCALE, HAND_SCALE);
      drawCard(ctx, faceOfCard(id), look);
      ctx.restore();
      if (hand && s.players[side].hand[i].turn === s.turn && isSummonTurn(s)) {
        // las que llegaron este turno (de esas se descarta una)
        font(ctx, 8.5, '800');
        rrect(ctx, x + cw / 2 - 20, y - 8, 40, 13, 6);
        ctx.fillStyle = '#ffd66b';
        ctx.fill();
        ctx.fillStyle = '#2a1d05';
        ctx.textAlign = 'center';
        ctx.fillText('NUEVA', x + cw / 2, y + 2);
        ctx.textAlign = 'left';
      }
      if (mode !== 'idle' && i < 9) {
        font(ctx, 11, '800');
        ctx.textAlign = 'center';
        outlined(ctx, `[${i + 1}]`, x + Math.min(cw, step) / 2, ROW.hand0 + ch + 14, C.gold);
        ctx.textAlign = 'left';
      }
    }
    ids.forEach((_, i) => {
      const x = x0 + i * step;
      this.region(x, ROW.hand0 - 22, i < ids.length - 1 ? step : cw, ch + 22, { kind: 'hand', side, index: i });
    });
    if (hoverAt >= 0 && hoverAt < ids.length) this.region(x0 + hoverAt * step, ROW.hand0 - 22, cw, ch + 22, { kind: 'hand', side, index: hoverAt });
  }

  /** El maná del turno y cuánto te queda con lo que estás jugando. */
  private drawMana(s: State, ui: UiState, side: Side): void {
    const ctx = this.ctx;
    const total = mana(s, side);
    const st = ui.staged?.side === side ? ui.staged : null;
    const used = st ? cost(s, side, st.cards) : 0;
    // debajo de tu héroe
    const x = HERO[side].x, y = 659;
    gem(ctx, x, y, 21, { value: total - used, color: '#2f6fd6', icon: null, delta: used ? -1 : 0 });
    font(ctx, 11, '800');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8fb8ff';
    ctx.fillText('MANÁ', x, y + 35);
    font(ctx, 10);
    ctx.fillStyle = C.dim;
    const turn = Math.min(s.turn, 9);
    ctx.fillText(used ? `de ${total}` : total > turn ? `${turn} + ${total - turn} extra` : `turno ${turn}`, x, y + 48);
    ctx.textAlign = 'left';
  }

  private drawBoard(s: State, ui: UiState, anim: Anim, side: Side, dt: number): void {
    const ctx = this.ctx;
    const board = s.players[side].board;
    const humanAttacking = s.phase === 'combat' && !ui.isAI(s.attacker);
    const legal = ui.selected !== null && humanAttacking ? attackTargets(s, ui.selected) : [];
    const choosing = [...(s.phase === 'target' && s.pending && !ui.isAI(s.pending.player) ? s.pending.options : []), ...aimTargets(s, ui)];
    const pulse = 0.5 + 0.5 * Math.sin(anim.now / 220);
    if (!board.length) {
      font(ctx, 13, 'bold');
      ctx.fillStyle = 'rgba(169,177,194,.35)';
      ctx.textAlign = 'center';
      ctx.fillText('sin unidades', MAIN_CX, BOARD_Y[side] + BH / 2);
      ctx.textAlign = 'left';
    }
    for (const u of board) {
      const target = this.slot(s, u.uid)!;
      const p = anim.place(u.uid, target, dt);
      if (p.alpha <= 0) continue;
      const hovered = ui.hover?.kind === 'unit' && ui.hover.uid === u.uid;
      const look: CardLook = {
        frame: C.side[side],
        showEnergy: s.phase === 'combat' && s.attacker === side,
        sleeping: sleeping(s, u),
        spent: spent(s, u),
        flash: anim.flash(u.uid),
        alpha: p.alpha,
      };
      let lift = 0;
      if (ui.aiMark?.a === u.uid) {
        look.ring = '#ffffff';
        lift = -8;
      } else if (ui.aiMark?.d === u.uid) look.ring = C.red;
      else if (ui.selected === u.uid) {
        look.glow = '#ffffff';
        look.ring = '#ffffff';
        lift = -10;
      } else if (legal.includes(u.uid)) {
        look.glow = `rgba(255,91,91,${0.5 + 0.5 * pulse})`;
        look.ring = C.red;
        look.ringDashed = !hovered;
      } else if (choosing.includes(u.uid)) {
        look.glow = `rgba(127,200,255,${0.5 + 0.5 * pulse})`;
        look.ring = C.blue;
        look.ringDashed = !hovered;
      } else if (humanAttacking && ui.selected === null && u.owner === s.attacker && canAttack(s, u.uid)) {
        look.glow = `rgba(91,224,122,${0.35 + 0.4 * pulse})`;
        if (hovered) lift = -6;
      }
      ctx.save();
      ctx.translate(p.x + BW / 2, p.y + lift + BH / 2);
      ctx.scale(p.scale * BOARD_SCALE, p.scale * BOARD_SCALE);
      ctx.translate(-CARD_W / 2, -CARD_H / 2);
      drawCard(ctx, { ...faceOfUnit(u), hp: anim.shown(`hp${u.uid}`, u.hp) }, look);
      ctx.restore();
      this.region(target.x, target.y, BW, BH, { kind: 'unit', uid: u.uid });
    }
    const ghosts = this.ghosts(s, side);
    const n = board.length + ghosts.length;
    for (const g of ghosts) {
      const p = slotAt(side, n, g.pos);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(BOARD_SCALE, BOARD_SCALE);
      drawCard(ctx, faceOfCard(g.id), { frame: C.side[side], ring: C.gold, ringDashed: true, alpha: g.kind === 'placing' ? 0.5 + 0.2 * pulse : 0.6 + 0.25 * pulse });
      ctx.restore();
      font(ctx, 10, '800');
      ctx.textAlign = 'center';
      const label = g.kind === 'placing' ? 'VA ACÁ · CLICK' : g.kind === 'staged' ? 'LA JUGÁS'
        : s.picks[other(side)] === null ? `ESPERA A ${s.players[other(side)].name.toUpperCase()}` : 'ENTRA AL RESOLVER';
      // debajo de la carta: arriba choca con el mensaje del medio
      outlined(ctx, label, p.x + BW / 2, p.y + BH + 13, C.gold);
      ctx.textAlign = 'left';
      if (g.kind !== 'placing') this.region(p.x, p.y, BW, BH, { kind: 'hand', side, index: g.index });
    }
  }

  /** La flecha de quién ataca a quién (a una unidad o al héroe): la que marcó la IA, o la tuya mientras apuntás. */
  private drawArrow(s: State, ui: UiState, anim: Anim): void {
    let pair: { a: number; d: number } | null = ui.aiMark;
    const t = hoverTarget(ui);
    if (!pair && ui.selected !== null && t !== null && attackTargets(s, ui.selected).includes(t)) pair = { a: ui.selected, d: t };
    if (!pair) return;
    const a = anim.where(pair.a) ?? this.slot(s, pair.a);
    const side = targetSide(pair.d);
    const d = side !== null ? null : anim.where(pair.d) ?? this.slot(s, pair.d);
    if (!a || (side === null && !d)) return;
    const x1 = a.x + BW / 2, y1 = a.y + BH / 2;
    const x2 = side !== null ? HERO[side].x : d!.x + BW / 2, y2 = side !== null ? HERO[side].y : d!.y + BH / 2;
    const stop = side !== null ? HERO_R + 8 : 34;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - Math.cos(ang) * stop, ey = y2 - Math.sin(ang) * stop;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [w, color] of [[10, 'rgba(0,0,0,.65)'], [5, '#ffffff']] as const) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const head = 14 + w;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ang) * head * 0.7, ey + Math.sin(ang) * head * 0.7);
      ctx.lineTo(ex - Math.cos(ang - 0.55) * head * 0.6, ey - Math.sin(ang - 0.55) * head * 0.6);
      ctx.lineTo(ex - Math.cos(ang + 0.55) * head * 0.6, ey - Math.sin(ang + 0.55) * head * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEffects(anim: Anim): void {
    const ctx = this.ctx;
    for (const g of anim.ghosts) {
      const a = anim.ghostAlpha(g);
      ctx.save();
      ctx.translate(g.x + BW / 2, g.y + BH / 2);
      const sc = (0.8 + 0.2 * a) * BOARD_SCALE;
      ctx.scale(sc, sc);
      ctx.rotate((1 - a) * 0.15);
      ctx.translate(-CARD_W / 2, -CARD_H / 2);
      drawCard(ctx, { ...faceOfUnit(g.unit), hp: anim.shown(`hp${g.unit.uid}`, g.unit.hp) }, { alpha: a, ring: g.tint, flash: 1 - a });
      ctx.restore();
    }
    for (const b of anim.banners) {
      const q = (anim.now - b.t0) / b.dur;
      if (q < 0) continue;
      const a = Math.max(0, q < 0.15 ? q / 0.15 : q > 0.8 ? (1 - q) / 0.2 : 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (b.kind === 'spell' && b.card) {
        const sc = 1.35;
        ctx.translate(MAIN_CX - (CARD_W * sc) / 2, ROW.ribbon - (CARD_H * sc) / 2);
        ctx.scale(sc, sc);
        drawCard(ctx, faceOfCard(b.card), { glow: C.side[b.side ?? 0], frame: C.side[b.side ?? 0] });
      } else {
        const zoom = 1 + 0.25 * (1 - Math.min(1, q / 0.15));
        ctx.translate(MAIN_CX, ROW.ribbon);
        ctx.scale(zoom, zoom);
        font(ctx, b.kind === 'power' ? 32 : 46, '800');
        ctx.textAlign = 'center';
        outlined(ctx, b.text.toUpperCase(), 0, 14, C.side[b.side ?? 0], 'rgba(0,0,0,.85)', 8);
      }
      ctx.restore();
    }
    for (const f of anim.floats) {
      const st = anim.floatState(f);
      if (!st) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, st.alpha);
      font(ctx, f.size, '800');
      ctx.textAlign = 'center';
      outlined(ctx, f.text, f.x, st.y, f.color, 'rgba(0,0,0,.85)', 5);
      ctx.restore();
    }
  }

  // ───────────────────────── izquierda: placas y carta ampliada ─────────────────────────

  private drawLeft(s: State, ui: UiState): void {
    const ctx = this.ctx;
    const focus = this.focus(s, ui);
    const zx = 34, zy = 100, zs = 1.4;
    const below = zy + CARD_H * zs;
    if (focus && focus.hero !== undefined) {
      // el héroe: la carta de clase en grande y, abajo, el poder
      ctx.save();
      ctx.translate(zx, zy);
      ctx.scale(zs, zs);
      drawCard(ctx, focus.face, { frame: C.side[focus.hero] });
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, below + 6, 252, H - below - 12);
      ctx.clip();
      this.drawHeroInfo(s, focus.hero, 16, below + 26, 222);
      ctx.restore();
    } else if (focus) {
      ctx.save();
      ctx.translate(zx, zy);
      ctx.scale(zs, zs);
      drawCard(ctx, focus.face, { frame: focus.side === null ? undefined : C.side[focus.side] });
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, below + 6, 252, H - below - 12);
      ctx.clip();
      let y = drawDetails(ctx, focus.face, 16, below + 26, 222, focus.side, s.cfg);
      if (focus.preview) {
        y += 6;
        font(ctx, 12, '800');
        ctx.fillStyle = C.gold;
        ctx.fillText('Si atacás:', 16, y);
        y += 16;
        font(ctx, 11);
        ctx.fillStyle = C.text;
        for (const step of focus.preview) {
          for (const l of wrap(ctx, step, 222)) {
            ctx.fillText(l, 16, y);
            y += 14;
          }
        }
      }
      ctx.restore();
    } else {
      rrect(ctx, zx, zy, CARD_W * zs, CARD_H * zs, 16);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.stroke();
      ctx.setLineDash([]);
      font(ctx, 12.5);
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      let y = zy + 110;
      for (const l of wrap(ctx, 'Pasá el mouse por cualquier carta para verla en grande', 150)) {
        ctx.fillText(l, zx + (CARD_W * zs) / 2, y);
        y += 17;
      }
      ctx.textAlign = 'left';
      this.drawLegend(s, below + 30);
    }
  }

  private drawLegend(s: State, y: number): void {
    const ctx = this.ctx;
    const old = s.players.some((p) => Object.values(OLD_DECKS).some((d) => d.name === p.deck));
    const lines = !old ? [
      'En cada pelea, los dos se pegan',
      `a la vez: ${WEAPONS.attack.icon} ataque contra ❤ vida.`,
      `${WEAPONS.spear.icon} Lanza: antes. ${WEAPONS.knife.icon} Cuchillo: al final.`,
      ...(s.cfg.summonSick ? ['💤 La que entra ataca al turno', '   siguiente (salvo Carga).'] : []),
      'Borde gris: ya atacó o no puede.',
      ...(s.cfg.cards === 'hand' ? ['Maná = el turno: jugá las que', 'sumen eso; descartás una nueva.'] : []),
      ...(s.players.some((p) => p.hero) ? [s.cfg.powerMode === 'off' ? '⚡ Poder: apagado.' : s.cfg.powerMode === 'mana' ? '⚡ Poder: 1 de maná, una vez, atacando.' : s.cfg.powerMode === 'all' ? '⚡ Poder: +1 energía/turno; gasta toda.' : '⚡ Poder: +1 energía/turno; cuesta 2.'] : []),
      ...(s.cfg.scoring === 'hero' ? ['Atacá al héroe rival (su retrato,', 'arriba) como a una unidad; el', 'Guardián lo tapa. Gana el que', 'deja al otro en 0.']
        : s.cfg.scoring === 'face' ? ['Las que no atacan le pegan a la', 'vida (salvo Guardián). Gana el', 'que deja al otro en 0.']
        : s.cfg.scoring === 'difference' ? ['Al final de cada turno, el que', 'tiene menos en la mesa pierde', 'la diferencia.']
        : ['Al final, cada carta viva le', 'pega su número dorado al rival.']),
    ] : [
      `${WEAPONS.bow.icon} Con arco: un tiro de lejos;`,
      '   solo responde otro arco.',
      'Cuerpo a cuerpo pegan, en orden:',
      `${WEAPONS.spear.icon} lanzas`,
      `${WEAPONS.sword.icon} > ${WEAPONS.axe.icon} > ${WEAPONS.mace.icon} > ${WEAPONS.sword.icon} (el que gana, antes)`,
      `${WEAPONS.knife.icon} cuchillos`,
      'El que muere ya no pega.',
    ];
    font(ctx, 11.5);
    for (const [i, l] of lines.entries()) {
      ctx.fillStyle = (old ? i === 2 : i === 0) ? C.gold : C.dim;
      ctx.fillText(l, 16, y + i * 18);
    }
  }

  /** El héroe, su poder con los números de ahora, la energía y la carta de clase. */
  private drawHeroInfo(s: State, side: Side, x: number, y: number, w: number): void {
    const ctx = this.ctx;
    const p = s.players[side];
    const h = HEROES[p.hero!];
    const line = (text: string, color: string, size = 11.5, weight: '' | 'bold' | '800' = '') => {
      font(ctx, size, weight);
      ctx.fillStyle = color;
      for (const l of wrap(ctx, text, w)) {
        ctx.fillText(l, x, y);
        y += size + 3.5;
      }
    };
    line(h.name, C.side[side], 16, 'bold');
    line(h.blurb, C.dim, 11);
    y += 4;
    line(h.power.name, C.gold, 12.5, 'bold');
    const x0 = powerX(s, side);
    const now = s.cfg.powerMode === 'all' ? `Ahora (X = ${x0})` : `Cuesta ${powerCost(s.cfg)}${s.cfg.powerMode === 'mana' ? ' de maná' : ''}`;
    line(`${now}: ${powerText(h.id, x0, p.totems, s.cfg)}`, C.text);
    y += 2;
    line(energyRule(s.cfg), C.dim, 10.5);
    y += 4;
    const c = card(classCardNow(s, side));
    line(`Cartas de clase: le llega una por turno, con las dos del mazo. Arriba, la del turno ${c.rank}: ${c.name}.`, C.dim, 10.5);
  }

  private focus(s: State, ui: UiState): { face: Face; side: Side | null; preview?: string[]; hero?: Side } | null {
    const h = ui.hover;
    if ((h?.kind === 'power' || h?.kind === 'hero') && s.players[h.side].hero) {
      return { face: faceOfCard(classCardNow(s, h.side)), side: h.side, hero: h.side };
    }
    if (h?.kind === 'hand') {
      const id = options(s, h.side)[h.index];
      if (id) return { face: faceOfCard(id), side: h.side };
    }
    if (h?.kind === 'deck') return { face: faceOfCard(h.id), side: null };
    if (h?.kind === 'unit') {
      const u = unitById(s, h.uid);
      if (u) {
        const prev = ui.selected !== null && attackTargets(s, ui.selected).includes(u.uid) ? preview(s, ui.selected, u.uid).steps : undefined;
        return { face: faceOfUnit(u), side: u.owner, preview: prev };
      }
    }
    if (ui.selected !== null) {
      const u = unitById(s, ui.selected);
      if (u) return { face: faceOfUnit(u), side: u.owner };
    }
    if (s.phase === 'target' && s.pending) return { face: faceOfCard(s.pending.card), side: s.pending.player };
    if (ui.aiming !== null && s.players[ui.aiming].hero) return { face: faceOfCard(classCardNow(s, ui.aiming)), side: ui.aiming, hero: ui.aiming };
    return null;
  }

  // ───────────────────────── mazos ─────────────────────────

  private drawDecks(s: State): void {
    const ctx = this.ctx;
    const sc = 0.46, cw = CARD_W * sc, ch = CARD_H * sc, colW = 86;
    const x0 = MAIN_X0 + 18;
    rrect(ctx, MAIN_X0, 52, MAIN_X1 - MAIN_X0, 660, 16);
    ctx.fillStyle = 'rgba(6,10,16,.88)';
    ctx.fill();
    for (const side of [1, 0] as const) {
      const top = side === 1 ? 62 : 386;
      const p = s.players[side];
      font(ctx, 15, '800');
      ctx.fillStyle = C.side[side];
      ctx.fillText(`${p.name} · ${p.deck}`, x0, top + 16);
      p.turns.forEach((_, t) => {
        const x = x0 + t * colW;
        const turn = t + 1;
        const ids = turnOptions(p, turn);
        if (turn === s.turn && s.phase !== 'end') {
          rrect(ctx, x - 6, top + 24, cw + 12, 3 * (ch + 4) + 26, 8);
          ctx.fillStyle = 'rgba(255,214,107,.08)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = C.gold;
          ctx.stroke();
        }
        font(ctx, 11, '800');
        ctx.fillStyle = attackerOf(s.cfg, turn) === side ? C.side[side] : C.dim;
        ctx.fillText(`T${turn} ${attackerOf(s.cfg, turn) === side ? '⚔' : '🛡'}`, x, top + 40);
        const h = s.history.find((e) => e.turn === turn);
        ids.forEach((id, k) => {
          const y = top + 48 + k * (ch + 4);
          const look: CardLook = { frame: C.side[side] };
          if (h) {
            if (h.plays[side].includes(id)) look.ring = C.gold;
            else look.dim = true;
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(sc, sc);
          drawCard(ctx, faceOfCard(id), look);
          ctx.restore();
          this.region(x, y, cw, ch, { kind: 'deck', id });
        });
      });
      // el héroe y su poder
      if (p.hero) {
        const h = HEROES[p.hero];
        const x = x0 + 9 * colW + 6;
        font(ctx, 11, '800');
        ctx.fillStyle = C.gold;
        ctx.fillText(h.name.slice(0, 20), x, top + 40);
        font(ctx, 10);
        ctx.fillStyle = C.dim;
        let ty = top + 58;
        for (const l of wrap(ctx, `Abajo de cada turno, su carta de clase. Poder: ${h.power.name}.`, colW - 4)) {
          ctx.fillText(l, x, ty);
          ty += 12;
        }
        this.region(x, top + 26, colW, ty - top - 26, { kind: 'power', side });
      }
    }
    font(ctx, 12);
    ctx.fillStyle = C.dim;
    ctx.fillText('Los dos ven todo: en cada turno, dos cartas del mazo y la de la clase. ⚔ ataca · 🛡 defiende · M vuelve a la mesa.', x0, 704);
  }
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** La carta de clase del turno en curso (la del 9 en las rondas sin cartas). */
function classCardNow(s: State, side: Side): string {
  return HEROES[s.players[side].hero!].cards[Math.min(9, Math.max(1, s.turn)) - 1];
}

/** Los objetivos del poder que estás apuntando (unidades por uid y héroes con `heroTarget`). */
function aimTargets(s: State, ui: UiState): number[] {
  return ui.aiming !== null && s.phase === 'combat' && !ui.isAI(ui.aiming) ? powerTargets(s, ui.aiming) ?? [] : [];
}

/** Qué le pasa a la vida del rival si el que ataca termina el turno ahora (null si no se le pega). */
function faceNote(s: State): string | null {
  if (s.cfg.scoring !== 'face' || !s.players[s.attacker].board.length) return null;
  if (faceBlocked(s, s.attacker)) return 'el Guardián rival frena los golpes a la vida';
  const n = pendingFace(s);
  return n > 0 ? `las que no atacaron le pegan ${n} a la vida` : null;
}

/** El lugar `k` de una fila de `n` cartas, centrada (esquina de la carta, a escala de tablero). */
function slotAt(side: Side, n: number, k: number): Point {
  const step = n > 1 ? Math.min(BW + 12, (MAIN_X1 - MAIN_X0 - BW) / (n - 1)) : 0;
  const total = (n - 1) * step + BW;
  return { x: MAIN_CX - total / 2 + k * step, y: BOARD_Y[side] };
}

/** Una unidad del que ataca que entró este turno y todavía no puede atacar. */
function sleeping(s: State, u: Unit): boolean {
  return s.cfg.summonSick && s.phase !== 'end' && u.owner === s.attacker && u.summonedTurn === s.turn && !u.charge;
}

/** Una del que ataca que ya no hace nada en este combate: atacó, duerme o está congelada. */
function spent(s: State, u: Unit): boolean {
  return s.phase === 'combat' && u.owner === s.attacker && !canAttack(s, u.uid) && !faceHits(s).some((h) => h.unit === u);
}

function anyHumanAttack(s: State): boolean {
  return s.phase === 'combat' && s.players[s.attacker].board.some((u) => canAttack(s, u.uid));
}

function orderRule(s: State): string {
  switch (s.cfg.firstToResolve) {
    case 'attacker': return 'Se resuelve primero la carta del atacante (salvo que la tuya sea Rápida)';
    case 'defender': return 'Se resuelve primero la tuya';
    default: return 'Se resuelve primero la del que tiene menos vida (salvo Rápida)';
  }
}

/** A qué está apuntando el mouse para atacar: una unidad (uid) o un héroe (`heroTarget`). */
function hoverTarget(ui: UiState): number | null {
  const h = ui.hover;
  return h?.kind === 'unit' ? h.uid : h?.kind === 'hero' ? heroTarget(h.side) : null;
}

/** El resultado de un ataque en una línea, para el mensaje del medio. */
export function shortPreview(s: State, aUid: number, dUid: number): string {
  const a = unitById(s, aUid)!;
  const p = preview(s, aUid, dUid);
  const side = targetSide(dUid);
  if (side !== null) {
    const me = a.owner, healed = p.life[me] - s.players[me].life;
    return `${s.players[side].name} queda en ${p.life[side]}${healed > 0 ? ` · ${s.players[me].name} +${healed}` : ''}`;
  }
  const d = unitById(s, dUid)!;
  const res = (u: Unit, after: Unit | null) => (after ? `${u.name} queda en ${after.hp}${after.shield < u.shield ? ' (pierde escudo)' : ''}` : `${u.name} muere`);
  const others = p.gone.filter((n) => n !== a.name && n !== d.name);
  return `${res(a, p.attacker)} · ${res(d, p.defender)}${others.length ? ` · también: ${others.join(', ')}` : ''}`;
}
