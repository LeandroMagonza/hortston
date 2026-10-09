// Animaciones. El motor ya dejó el estado final; acá se cuenta cómo se llegó, con los eventos que
// emitió: la embestida del que ataca, los números de daño, los muertos que se desvanecen, el hechizo
// que se muestra en grande. Los eventos se encolan uno detrás de otro (`cursor`), así una cadena de
// efectos se lee en orden. Mientras hay animaciones pendientes la IA espera. Los números de vida (de las
// unidades y de los jugadores) cambian recién cuando se anima el golpe o la curación (`shown`).
import { HEROES } from '../core/heroes';
import type { GameEvent, Side, Unit } from '../core/types';
import { BH, BW } from './draw';

export interface Point {
  x: number;
  y: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
  size: number;
}

interface Ghost {
  unit: Unit;
  x: number;
  y: number;
  fadeAt: number;
  tint: string;
}

interface Lunge {
  to: Point;
  t0: number;
}

/** Un cambio de un número que se ve en el momento `t`: suma `delta` o lo pone en `set`. */
interface Change {
  t: number;
  delta?: number;
  set?: number;
}

export interface Banner {
  kind: 'turn' | 'spell' | 'power';
  text: string;
  card?: string;
  side?: Side;
  t0: number;
  dur: number;
}

const LUNGE_MS = 380;
const FLOAT_MS = 1000;
const FADE_MS = 450;

export class Anim {
  now = 0;
  private last = 0;
  private cursor = 0;
  private pos = new Map<number, { x: number; y: number; appear: number }>();
  private lunges = new Map<number, Lunge>();
  private flashes = new Map<number, number>();
  floats: Float[] = [];
  ghosts: Ghost[] = [];
  banners: Banner[] = [];
  /** Los cambios de números todavía sin terminar de animar, el número de antes y el último que se vio. */
  private changes = new Map<string, Change[]>();
  private base = new Map<string, number>();
  private seen = new Map<string, number>();

  reset(): void {
    this.changes.clear();
    this.base.clear();
    this.seen.clear();
    this.pos.clear();
    this.lunges.clear();
    this.flashes.clear();
    this.floats = [];
    this.ghosts = [];
    this.banners = [];
    this.cursor = this.now;
  }

  tick(t: number): number {
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    this.now = t;
    this.floats = this.floats.filter((f) => t < f.t0 + FLOAT_MS);
    this.ghosts = this.ghosts.filter((g) => t < g.fadeAt + FADE_MS);
    this.banners = this.banners.filter((b) => t < b.t0 + b.dur);
    return dt;
  }

  /** Hay algo animándose (o por animarse): la IA espera. */
  busy(): boolean {
    return this.now < this.cursor + 120;
  }

  /** Avanza la posición dibujada de una unidad hacia su lugar y devuelve dónde dibujarla. */
  place(uid: number, target: Point, dt: number): { x: number; y: number; alpha: number; scale: number } {
    let p = this.pos.get(uid);
    if (!p) {
      p = { x: target.x, y: target.y, appear: this.now };
      this.pos.set(uid, p);
    } else if (Number.isNaN(p.x)) {
      p.x = target.x;
      p.y = target.y;
    }
    const k = Math.min(1, dt * 10);
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
    const a = Math.max(0, Math.min(1, (this.now - p.appear) / 260));
    let x = p.x, y = p.y;
    const l = this.lunges.get(uid);
    if (l) {
      const q = (this.now - l.t0) / LUNGE_MS;
      if (q >= 1) this.lunges.delete(uid);
      else if (q > 0) {
        const s = Math.sin(Math.PI * q) * 0.6;
        x += (l.to.x - p.x) * s;
        y += (l.to.y - p.y) * s;
      }
    }
    return { x, y, alpha: a, scale: 0.75 + 0.25 * a };
  }

  /** Dónde está dibujada una unidad (o null si todavía no se dibujó). */
  where(uid: number): Point | null {
    const p = this.pos.get(uid);
    return p && !Number.isNaN(p.x) ? { x: p.x, y: p.y } : null;
  }

  flash(uid: number): number {
    const t0 = this.flashes.get(uid);
    if (t0 === undefined || this.now < t0) return 0;
    const q = (this.now - t0) / 350;
    return q >= 1 ? 0 : 1 - q;
  }

  private float(at: Point | null, text: string, color: string, t0: number, size = 18): void {
    if (at) this.floats.push({ x: at.x, y: at.y, text, color, t0, size });
  }

  /** Encola un cambio de `key`; si no había otros pendientes, arranca desde el número que se veía. */
  private change(key: string, t: number, c: Omit<Change, 't'>): void {
    let list = this.changes.get(key);
    if (!list) {
      list = [];
      this.changes.set(key, list);
      const before = this.seen.get(key);
      if (before === undefined) this.base.delete(key);
      else this.base.set(key, before);
    }
    list.push({ t, ...c });
  }

  /**
   * El número que se ve (`hp<uid>`: la vida de una unidad; `life<lado>`: la de un jugador): el de antes
   * con los cambios que ya se animaron. Cuando se animaron todos, el de verdad (`actual`).
   */
  shown(key: string, actual: number): number {
    let v = actual;
    const list = this.changes.get(key);
    if (list) {
      if (list.every((c) => c.t <= this.now)) this.changes.delete(key);
      else {
        // si nunca se vio (entró y le pegaron en la misma jugada), se arma desde el final
        v = this.base.get(key) ?? list.reduce((a, c) => a - (c.delta ?? 0), actual);
        for (const c of list) if (c.t <= this.now) v = c.set ?? v + (c.delta ?? 0);
      }
    }
    this.seen.set(key, v);
    return v;
  }

  /**
   * Encola los eventos nuevos. `slot` da el lugar de una unidad viva en el tablero (para las que todavía
   * no se dibujaron), `life` dónde se muestra la vida de cada jugador y `power` dónde está su poder.
   */
  consume(
    events: GameEvent[], slot: (uid: number) => Point | null, life: (side: Side) => Point, center: Point, power: (side: Side) => Point,
    /** Para el sonido: cada evento con cuántos ms faltan para que se anime. */
    cue?: (e: GameEvent, delayMs: number) => void,
  ): void {
    if (this.cursor < this.now) this.cursor = this.now;
    // las posiciones son la esquina de la carta; los números salen del medio
    const corner = (uid: number): Point | null => this.where(uid) ?? slot(uid);
    const at = (uid: number): Point | null => {
      const p = corner(uid);
      return p && { x: p.x + BW / 2, y: p.y + BH * 0.42 };
    };
    for (const e of events) {
      const t = this.cursor;
      cue?.(e, t - this.now + (e.kind === 'face' ? LUNGE_MS / 2 : 0));
      switch (e.kind) {
        case 'turn':
          this.banners.push({ kind: 'turn', text: e.summon ? `Turno ${e.turn}` : `Ronda ${e.turn} · sin cartas`, side: e.attacker, t0: t, dur: 900 });
          this.cursor += 450;
          break;
        case 'summon':
          this.pos.set(e.uid, { x: NaN, y: NaN, appear: t });
          this.cursor += 260;
          break;
        case 'spell':
          this.banners.push({ kind: 'spell', text: '', card: e.card, side: e.owner, t0: t, dur: 1300 });
          this.cursor += 900;
          break;
        case 'attack': {
          const to = corner(e.d);
          if (to) this.lunges.set(e.a, { to, t0: t });
          this.cursor += LUNGE_MS / 2;
          break;
        }
        case 'damage': {
          const p = at(e.uid);
          if (e.blocked) this.float(p, '🛡', '#8fd3ff', t, 22);
          else {
            this.float(p, `−${e.amount}`, '#ff6b6b', t, 22);
            this.flashes.set(e.uid, t);
            this.change(`hp${e.uid}`, t, { delta: -e.amount });
          }
          this.cursor += 60;
          break;
        }
        case 'buff': {
          const parts: string[] = [];
          if (e.dmg) parts.push(`${e.dmg < 0 ? '−' : '+'}${Math.abs(e.dmg)} daño`);
          if (e.hp) parts.push(`${e.hp < 0 ? '−' : '+'}${Math.abs(e.hp)} vida`);
          this.float(at(e.uid), parts.join(' '), e.dmg < 0 || e.hp < 0 ? '#ffb36b' : '#8dff8d', t, 15);
          if (e.hp) this.change(`hp${e.uid}`, t, { delta: e.hp });
          this.cursor += 50;
          break;
        }
        case 'heal':
          this.float(at(e.uid), `+${e.amount}`, '#8dff8d', t, 18);
          this.change(`hp${e.uid}`, t, { delta: e.amount });
          this.cursor += 50;
          break;
        case 'shield':
          this.float(at(e.uid), '+ escudo', '#8fd3ff', t, 14);
          this.cursor += 50;
          break;
        case 'shieldBreak':
          this.float(at(e.uid), 'escudo roto', '#8fd3ff', t + 120, 14);
          break;
        case 'freeze':
          this.float(at(e.uid), 'congelada', '#9fd8ff', t, 14);
          this.cursor += 80;
          break;
        case 'silence':
          this.float(at(e.uid), 'silencio', '#c8c8d0', t, 14);
          this.cursor += 80;
          break;
        case 'lastStand':
          this.float(at(e.uid), '¡aguante!', '#e9c46a', t, 15);
          this.change(`hp${e.uid}`, t, { set: 1 });
          this.cursor += 250;
          break;
        case 'evolve':
          this.float(at(e.uid), '¡evoluciona!', '#e9c46a', t, 15);
          this.cursor += 350;
          break;
        case 'death':
        case 'banish': {
          const p = this.where(e.unit.uid) ?? slot(e.unit.uid) ?? center;
          this.ghosts.push({ unit: e.unit, x: p.x, y: p.y, fadeAt: t, tint: e.kind === 'death' ? '#ef5b5b' : '#b48cff' });
          this.pos.delete(e.unit.uid);
          this.cursor += 140;
          break;
        }
        case 'life':
          this.float(life(e.side), `${e.amount > 0 ? '+' : '−'}${Math.abs(e.amount)}`, e.amount > 0 ? '#8dff8d' : '#ff6b6b', t, 26);
          this.change(`life${e.side}`, t, { delta: e.amount });
          this.cursor += 250;
          break;
        case 'face': {
          // embiste hacia la vida del rival
          const lp = life(e.side);
          this.lunges.set(e.uid, { to: { x: lp.x - BW / 2, y: lp.y - BH / 2 }, t0: t });
          this.float(lp, `−${e.amount}`, '#ff6b6b', t + LUNGE_MS / 2, 26);
          this.change(`life${e.side}`, t + LUNGE_MS / 2, { delta: -e.amount });
          this.cursor += LUNGE_MS * 0.8;
          break;
        }
        case 'power': {
          const h = HEROES[e.hero];
          this.banners.push({ kind: 'power', text: `${h.power.name} · ${e.x}`, side: e.side, t0: t, dur: 1200 });
          const p = power(e.side);
          this.float({ x: p.x, y: p.y - 10 }, `−${e.cost} ⚡`, '#8fb8ff', t, 16);
          this.cursor += 650;
          break;
        }
        case 'energy': {
          const p = power(e.side);
          this.float({ x: p.x, y: p.y - 10 }, `+${e.amount} ⚡`, '#8fb8ff', t, 16);
          this.cursor += 200;
          break;
        }
        case 'final':
          for (const side of [0, 1] as const) {
            if (!e.damage[side]) continue;
            this.float(life(side === 0 ? 1 : 0), `−${e.damage[side]}`, '#ff6b6b', t + 300, 30);
            this.change(`life${side === 0 ? 1 : 0}`, t + 300, { delta: -e.damage[side] });
          }
          this.cursor += 900;
          break;
      }
    }
  }

  /** La transparencia de un fantasma (muerto o desterrado) que se está yendo. */
  ghostAlpha(g: Ghost): number {
    if (this.now < g.fadeAt) return 1;
    return Math.max(0, 1 - (this.now - g.fadeAt) / FADE_MS);
  }

  floatState(f: Float): { y: number; alpha: number } | null {
    const q = (this.now - f.t0) / FLOAT_MS;
    if (q < 0) return null;
    return { y: f.y - 34 * q, alpha: q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3 };
  }
}
