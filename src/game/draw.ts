// Dibujo de cartas en canvas 2D.
//
// La carta tiene piedras en los bordes, cada una con su ícono y el número encima:
// - izquierda, de arriba hacia abajo: las armas que tiene, en el orden en que pegan (🔱 lanza arriba
//   porque pega primero, ⚔️ ataque, 🔪 cuchillo abajo porque pega último). Sin huecos: la mayoría tiene
//   solo el ataque, y así queda arriba, frente al corazón.
// - derecha: la vida (un corazón) y, si tiene, escudo, armadura y energía.
// En el medio, el dibujo (un ícono de game-icons.net, o el hecho con IA si hay). Si tiene habilidades, van abajo en una placa de
// pergamino, un renglón por habilidad: «Palabra clave: efecto»; si no, el dibujo ocupa ese lugar. El
// turno de la carta va chico, abajo al medio. Las cartas de clase llevan arriba del dibujo el héroe que
// las tiene.
import { card } from '../core/cards';
import { HEROES } from '../core/heroes';
import { artImage, drawCover } from './art';
import { drawIcon } from './icon';
import { describeCard, describeUnit, explain, shieldText, type Ability } from '../core/text';
import type { Config, Damage, Side, Unit, Weapon } from '../core/types';
import { emptyDamage, WEAPON_ORDER, WEAPONS } from '../core/weapons';

/** Tamaño lógico de la pantalla: todo se dibuja en estas coordenadas y se escala al canvas. */
export const W = 1280;
export const H = 720;
/** La carta a tamaño 1; en cada lugar se dibuja a otra escala. */
export const CARD_W = 132;
export const CARD_H = 180;
/** En el tablero las cartas van un poco más chicas. */
export const BOARD_SCALE = 0.82;
export const BW = CARD_W * BOARD_SCALE;
export const BH = CARD_H * BOARD_SCALE;

export const C = {
  text: '#f1ede4',
  dim: '#a9b1c2',
  gold: '#ffd66b',
  goldDeep: '#7a4b12',
  red: '#ff5b5b',
  green: '#5be07a',
  blue: '#7fc8ff',
  spell: '#a988ff',
  side: ['#3fd2b5', '#ff9a52'] as const,
};

export const FONT = '"Segoe UI", system-ui, sans-serif';
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** Lo que hace falta para dibujar una carta, venga de un mazo o del tablero. */
export interface Face {
  id: string;
  kind: 'unit' | 'spell';
  name: string;
  art: string;
  rank: number;
  dmg: Damage;
  baseDmg: Damage;
  hp: number;
  maxHp: number;
  baseHp: number;
  shield: number;
  armor: number;
  energy: number;
  maxEnergy: number;
  abilities: Ability[];
  guard: boolean;
  silenced: boolean;
  fast: boolean;
  onBoard: boolean;
  /** Carta de clase: el héroe que la tiene. */
  hero: { id: string; name: string } | null;
  frozen: boolean;
  stealth: boolean;
}

function heroTag(id: string): Face['hero'] {
  const h = card(id).hero;
  return h ? { id: h, name: HEROES[h].name } : null;
}

export function faceOfCard(id: string): Face {
  const c = card(id);
  const u = c.kind === 'unit' ? c : null;
  const dmg = { ...emptyDamage(), ...(u?.dmg ?? {}) };
  return {
    id, kind: c.kind, name: c.name, art: c.art, rank: c.rank,
    dmg, baseDmg: dmg, hp: u?.hp ?? 0, maxHp: u?.hp ?? 0, baseHp: u?.hp ?? 0,
    shield: u?.shield ?? 0, armor: u?.armor ?? 0, energy: u?.energy ?? 1, maxEnergy: u?.energy ?? 1,
    abilities: describeCard(id),
    guard: !!u?.guard, silenced: false, fast: !!c.fast, onBoard: false, hero: heroTag(id), frozen: false, stealth: false,
  };
}

export function faceOfUnit(u: Unit): Face {
  const c = card(u.card);
  const base = c.kind === 'unit' ? c : null;
  return {
    id: u.card, kind: 'unit', name: u.name, art: c.art, rank: u.rank,
    dmg: u.dmg, baseDmg: { ...emptyDamage(), ...(base?.dmg ?? {}) }, hp: u.hp, maxHp: u.maxHp, baseHp: base?.hp ?? u.maxHp,
    shield: u.shield, armor: u.armor, energy: u.energy, maxEnergy: u.maxEnergy,
    abilities: describeUnit(u),
    guard: u.guard, silenced: u.silenced, fast: !!c.fast, onBoard: true, hero: heroTag(u.card), frozen: u.frozen, stealth: u.stealth,
  };
}

// ───────────────────────── primitivas ─────────────────────────

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function font(ctx: CanvasRenderingContext2D, size: number, weight: '' | 'bold' | '800' = ''): void {
  ctx.font = `${weight} ${size}px ${FONT}`.trim();
}

function emojiFont(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.font = `${size}px ${EMOJI}`;
}

/** Corta un texto en renglones que entren en `maxW`; si sobran, el último termina en «…». */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = Infinity): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = `${last}…`;
    return cut;
  }
  return out;
}

export function textLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lh: number): number {
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lh;
  }
  return y;
}

/** Texto con contorno oscuro, para que se lea sobre cualquier fondo. */
export function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = 'rgba(0,0,0,.85)', width = 3): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function shieldShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.75, x + s * 0.85, y - s * 0.8);
  ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.35, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.35, x - s * 0.85, y - s * 0.8);
  ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.75, x, y - s);
  ctx.closePath();
}

function plateShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.8, y - s * 0.7);
  ctx.lineTo(x - s * 0.3, y - s * 0.9);
  ctx.quadraticCurveTo(x, y - s * 0.55, x + s * 0.3, y - s * 0.9);
  ctx.lineTo(x + s * 0.8, y - s * 0.7);
  ctx.lineTo(x + s * 0.65, y + s * 0.85);
  ctx.lineTo(x - s * 0.65, y + s * 0.85);
  ctx.closePath();
}

function heartShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.95);
  ctx.bezierCurveTo(x - s * 0.2, y + s * 0.8, x - s * 1.15, y + s * 0.2, x - s * 1.05, y - s * 0.35);
  ctx.bezierCurveTo(x - s * 0.95, y - s * 1.0, x - s * 0.15, y - s * 1.0, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.15, y - s * 1.0, x + s * 0.95, y - s * 1.0, x + s * 1.05, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 1.15, y + s * 0.2, x + s * 0.2, y + s * 0.8, x, y + s * 0.95);
  ctx.closePath();
}

/** La vida: un corazón rojo con el número encima. `delta` pinta el número (herida o con más vida). */
export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, value: number, delta = 0): void {
  ctx.save();
  const g = ctx.createRadialGradient(x - s * 0.4, y - s * 0.5, s * 0.1, x, y, s * 1.2);
  g.addColorStop(0, '#ff9a9a');
  g.addColorStop(0.55, '#d63a3a');
  g.addColorStop(1, '#6e1414');
  heartShape(ctx, x, y, s);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15,4,4,.9)';
  ctx.stroke();
  font(ctx, Math.round(s * 0.95), '800');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlined(ctx, String(value), x, y + s * 0.05, delta > 0 ? '#a6ffa6' : delta < 0 ? '#ffd0d0' : '#ffffff', 'rgba(0,0,0,.9)', Math.max(2.5, s * 0.25));
  ctx.restore();
}

interface Word {
  x: number;
  text: string;
  bold: boolean;
  color: string;
}

/** Arma renglones de texto con partes en negrita (la palabra clave) y partes normales (el efecto). */
export function richLines(ctx: CanvasRenderingContext2D, runs: { text: string; bold: boolean; color: string }[], maxW: number, size: number): Word[][] {
  const lines: Word[][] = [[]];
  let x = 0;
  for (const run of runs) {
    font(ctx, size, run.bold ? 'bold' : '');
    const sp = ctx.measureText(' ').width;
    for (const word of run.text.split(/\s+/).filter(Boolean)) {
      const ww = ctx.measureText(word).width;
      const line = lines[lines.length - 1];
      if (line.length && x + sp + ww > maxW) {
        lines.push([{ x: 0, text: word, bold: run.bold, color: run.color }]);
        x = ww;
      } else {
        const px = line.length ? x + sp : 0;
        line.push({ x: px, text: word, bold: run.bold, color: run.color });
        x = px + ww;
      }
    }
  }
  return lines;
}

export function drawWords(ctx: CanvasRenderingContext2D, line: Word[], x: number, y: number, size: number): void {
  for (const w of line) {
    font(ctx, size, w.bold ? 'bold' : '');
    ctx.fillStyle = w.color;
    ctx.fillText(w.text, x + w.x, y);
  }
}

/** Los renglones de una habilidad: la palabra clave en negrita y, si tiene, el efecto después. */
function abilityRuns(a: Ability, keyColor: string, textColor: string): { text: string; bold: boolean; color: string }[] {
  const runs: { text: string; bold: boolean; color: string }[] = [];
  if (a.key) runs.push({ text: a.text ? `${a.key}:` : a.key, bold: true, color: keyColor });
  if (a.text) runs.push({ text: a.text, bold: false, color: textColor });
  if (a.spent) runs.push({ text: '(ya usado)', bold: false, color: textColor });
  return runs;
}

/** El ícono de la piedra: uno de iconos.ts (arma_<arma>, marca_energia) o una forma dibujada acá. */
type GemIcon = { icon: string } | { shape: 'shield' | 'plate' } | null;

interface GemOpts {
  value: number | null;
  color: string;
  icon: GemIcon;
  /** Más o menos que lo que dice la carta: el número se pinta verde o rojo. */
  delta?: number;
  empty?: boolean;
}

/** Una piedra del borde: círculo de color, el ícono tenue y el número arriba. */
export function gem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, o: GemOpts): void {
  ctx.save();
  if (o.empty) {
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fill();
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.stroke();
    ctx.restore();
    return;
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(o.color, 0.45));
  g.addColorStop(0.55, o.color);
  g.addColorStop(1, shade(o.color, -0.45));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(10,8,6,.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r - 2.2, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.stroke();
  if (o.icon) {
    // con ícono: el ícono se ve entero y el número va encima, abajo a la derecha
    ctx.globalAlpha = 0.95;
    if ('icon' in o.icon) drawIcon(ctx, o.icon.icon, x - r * 0.12, y - r * 0.08, r * 1.3, 'rgba(255,255,255,.9)', 'rgba(0,0,0,.6)');
    else {
      (o.icon.shape === 'shield' ? shieldShape : plateShape)(ctx, x - r * 0.12, y - r * 0.05, r * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (o.value !== null) {
    const fill = (o.delta ?? 0) > 0 ? '#a6ffa6' : (o.delta ?? 0) < 0 ? '#ffb0b0' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.icon) {
      font(ctx, Math.round(r * 1.05), '800');
      outlined(ctx, String(o.value), x + r * 0.55, y + r * 0.5, fill, 'rgba(0,0,0,.95)', 3.6);
    } else {
      font(ctx, Math.round(r * 1.2), '800');
      outlined(ctx, String(o.value), x, y + 1, fill, 'rgba(0,0,0,.9)', 3.2);
    }
  }
  ctx.restore();
}

// ───────────────────────── carta ─────────────────────────

export interface CardLook {
  /** Color del marco (el del dueño). */
  frame?: string;
  /** Halo alrededor (elegible, seleccionada, objetivo). */
  glow?: string | null;
  /** Borde de color por fuera (marcas). */
  ring?: string | null;
  ringDashed?: boolean;
  /** Atenuada (descartada). */
  dim?: boolean;
  alpha?: number;
  /** Tinte rojo de golpe recibido, 0..1. */
  flash?: number;
  /** Puntos de energía que le quedan (las del atacante en su combate). */
  showEnergy?: boolean;
  /** Recién llegada: todavía no puede atacar (💤). */
  sleeping?: boolean;
  /** Del que ataca, ya no hace nada en este combate (atacó, duerme o está congelada): borde gris. */
  spent?: boolean;
}

/** El borde de las que ya no pueden atacar en este combate. */
export const SPENT = '#6b6f78';

/** Las armas a la izquierda; vida y defensas a la derecha. Una piedra cada `GEM_STEP`. */
const GEM_R = 13.5;
const GEM_X = 16;
const GEM_Y = 20;
const GEM_STEP = 28;

/** Las armas que se muestran: las que tiene, y las que tenía la carta aunque hoy estén en 0. */
function shownWeapons(f: Face): Weapon[] {
  return WEAPON_ORDER.filter((w) => f.dmg[w] > 0 || f.baseDmg[w] > 0);
}

/** La placa de pergamino con las habilidades, un renglón por habilidad. */
function drawAbilities(ctx: CanvasRenderingContext2D, f: Face, spell: boolean): void {
  const w = CARD_W, h = CARD_H;
  const ty = 116, th = h - ty - 11;
  rrect(ctx, 7, ty, w - 14, th, 6);
  ctx.fillStyle = '#ebe1c7';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.stroke();
  ctx.textAlign = 'left';
  const size = 8.5, lh = 9.8;
  const abilities: Ability[] = spell ? [{ key: 'Hechizo', text: null }, ...f.abilities] : f.abilities;
  const lines: Word[][] = [];
  for (const a of abilities) {
    const faded = a.spent ? 'rgba(43,35,23,.45)' : null;
    lines.push(...richLines(ctx, abilityRuns(a, faded ?? (spell ? '#5a3a9a' : '#8a4f00'), faded ?? '#2b2317'), w - 24, size));
  }
  const fit = Math.floor((th - 4) / lh);
  if (!lines.length) {
    font(ctx, size);
    ctx.fillStyle = 'rgba(43,35,23,.4)';
    ctx.fillText('Sin habilidades.', 12, ty + 11);
  }
  lines.slice(0, fit).forEach((l, i) => {
    if (i === fit - 1 && lines.length > fit && l.length) l[l.length - 1] = { ...l[l.length - 1], text: `${l[l.length - 1].text}…` };
    drawWords(ctx, l, 12, ty + 11 + i * lh, size);
  });
}

/** Dibuja la carta con la esquina en (0, 0) a tamaño 1. Quien llama pone translate/scale. */
export function drawCard(ctx: CanvasRenderingContext2D, f: Face, look: CardLook = {}): void {
  const w = CARD_W, h = CARD_H;
  const spell = f.kind === 'spell';
  /** Sin habilidades que mostrar: el dibujo ocupa el lugar de la placa. */
  const bigArt = !spell && f.abilities.length === 0;
  ctx.save();
  ctx.globalAlpha = (look.alpha ?? 1) * (look.dim ? 0.35 : 1);

  // cuerpo
  const body = ctx.createLinearGradient(0, 0, 0, h);
  if (spell) {
    body.addColorStop(0, '#45306e');
    body.addColorStop(1, '#1d1433');
  } else {
    body.addColorStop(0, '#2f3b50');
    body.addColorStop(1, '#141a25');
  }
  if (look.glow) {
    ctx.save();
    ctx.shadowColor = look.glow;
    ctx.shadowBlur = 22;
    rrect(ctx, 0, 0, w, h, 12);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();
  }
  rrect(ctx, 0, 0, w, h, 12);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = look.spent ? SPENT : f.guard ? C.gold : spell ? C.spell : look.frame ?? '#5a6680';
  ctx.stroke();
  if (look.spent) ctx.strokeStyle = f.guard ? C.gold : SPENT;
  if (f.guard) {
    rrect(ctx, 5, 5, w - 10, h - 10, 8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // dibujo
  const [ax, ay, aw, ah] = bigArt ? [8, 38, w - 16, h - 38 - 15] : [28, 30, w - 56, 80];
  const art = ctx.createRadialGradient(w / 2, ay + ah * 0.45, 4, w / 2, ay + ah / 2, Math.max(aw, ah) * 0.75);
  art.addColorStop(0, spell ? '#6b52a8' : '#4b6488');
  art.addColorStop(1, spell ? '#24183f' : '#1a2233');
  rrect(ctx, ax, ay, aw, ah, 10);
  ctx.fillStyle = art;
  ctx.fill();
  const img = artImage(f.id);
  if (img) {
    // el dibujo de la carta (si se generó); si no, el ícono
    ctx.save();
    rrect(ctx, ax, ay, aw, ah, 10);
    ctx.clip();
    drawCover(ctx, img, ax, ay, aw, ah);
    ctx.restore();
    rrect(ctx, ax, ay, aw, ah, 10);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.stroke();
  if (!img) {
    const size = Math.min(aw, ah) * (bigArt ? 0.8 : 0.84);
    const color: [string, string] = spell ? ['#f6efff', '#b39ae8'] : ['#fbf4e0', '#cdb27f'];
    if (!drawIcon(ctx, f.id, w / 2, ay + ah / 2 + (f.hero ? 5 : 1), size, color, 'rgba(0,0,0,.75)')) {
      emojiFont(ctx, bigArt ? 70 : 44);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.art, w / 2, ay + ah / 2 + 3);
    }
  }

  // nombre
  font(ctx, 11, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const name = wrap(ctx, f.name, w - 66, 2);
  let ny = name.length > 1 ? 13 : 19;
  for (const l of name) {
    outlined(ctx, l, w / 2, ny, C.text, 'rgba(0,0,0,.8)', 2.5);
    ny += 11;
  }

  // carta de clase: el héroe, arriba del dibujo
  if (f.hero) {
    font(ctx, 7.5, '800');
    const label = f.hero.name.toUpperCase();
    const tw = Math.min(aw - 6, ctx.measureText(label).width + 21);
    rrect(ctx, w / 2 - tw / 2, ay + 2, tw, 12, 6);
    ctx.fillStyle = 'rgba(28,18,4,.88)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.gold;
    ctx.stroke();
    drawIcon(ctx, `heroe_${f.hero.id}`, w / 2 - tw / 2 + 8, ay + 8, 9, C.gold);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold;
    ctx.fillText(wrap(ctx, label, tw - 17, 1)[0], w / 2 + 5, ay + 11);
  }

  // placa de habilidades: un renglón por habilidad, «Palabra clave: efecto»
  if (!bigArt) drawAbilities(ctx, f, spell);

  // piedras: armas a la izquierda, vida y defensas a la derecha
  if (!spell) {
    shownWeapons(f).forEach((wp, i) => {
      gem(ctx, GEM_X, GEM_Y + i * GEM_STEP, GEM_R, { value: f.dmg[wp], color: WEAPONS[wp].color, icon: { icon: `arma_${wp}` }, delta: f.dmg[wp] - f.baseDmg[wp] });
    });
    heart(ctx, w - GEM_X, GEM_Y + 1, 15, f.hp, f.hp < f.maxHp ? -1 : f.maxHp > f.baseHp ? 1 : 0);
    const defenses: GemOpts[] = [];
    if (f.shield > 0) defenses.push({ value: f.shield, color: '#3c86d6', icon: { shape: 'shield' } });
    if (f.armor > 0) defenses.push({ value: f.armor, color: '#7d8896', icon: { shape: 'plate' } });
    if (f.maxEnergy > 1) defenses.push({ value: f.maxEnergy, color: '#c9a516', icon: { icon: 'marca_energia' } });
    defenses.forEach((d, i) => gem(ctx, w - GEM_X, GEM_Y + (i + 1) * GEM_STEP, GEM_R, d));
  }

  // el turno de la carta, chico, abajo al medio
  ctx.beginPath();
  ctx.arc(w / 2, h - 3, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = '#d9a630';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(10,8,6,.85)';
  ctx.stroke();
  font(ctx, 10, '800');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a1d05';
  ctx.fillText(String(f.rank), w / 2, h - 2.5);
  ctx.textBaseline = 'alphabetic';

  if (look.sleeping) drawIcon(ctx, 'marca_dormida', w - 30, ay + 16, 24, '#e9e4ff', 'rgba(0,0,0,.9)');

  if (look.showEnergy && !spell) {
    for (let k = 0; k < f.maxEnergy; k++) {
      ctx.beginPath();
      ctx.arc(w / 2 - (f.maxEnergy - 1) * 6 + k * 12, ay + ah - 8, 4, 0, Math.PI * 2);
      ctx.fillStyle = k < f.energy ? C.gold : 'rgba(0,0,0,.5)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.stroke();
    }
  }

  if (f.stealth && f.onBoard) {
    // con Sigilo: velada, con un borde punteado
    rrect(ctx, 3, 3, w - 6, h - 6, 10);
    ctx.fillStyle = 'rgba(20,20,40,.35)';
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(200,200,255,.7)';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (f.frozen) {
    rrect(ctx, 0, 0, w, h, 12);
    ctx.fillStyle = 'rgba(120,190,255,.35)';
    ctx.fill();
    drawIcon(ctx, 'marca_congelada', 26, ay + 16, 26, ['#ffffff', '#9fd4ff'], 'rgba(0,30,60,.9)');
  }
  if (f.silenced) {
    rrect(ctx, 0, 0, w, h, 12);
    ctx.fillStyle = 'rgba(60,60,70,.5)';
    ctx.fill();
    font(ctx, 12, '800');
    ctx.textAlign = 'center';
    outlined(ctx, 'SILENCIADA', w / 2, ay + ah / 2, '#d6d6de');
  }
  if (look.flash && look.flash > 0) {
    rrect(ctx, 0, 0, w, h, 12);
    ctx.fillStyle = `rgba(255,70,70,${0.5 * look.flash})`;
    ctx.fill();
  }
  ctx.globalAlpha = look.alpha ?? 1;
  if (look.ring) {
    rrect(ctx, -5, -5, w + 10, h + 10, 15);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = look.ring;
    if (look.ringDashed) ctx.setLineDash([8, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ───────────────────────── detalle ─────────────────────────

const SHORT_HINT: Record<Weapon, string> = {
  bow: 'ataca solo con esto, de lejos; solo le responde otro arco',
  spear: 'pega primero',
  attack: 'pega a la vez que el otro',
  sword: 'le gana al hacha',
  axe: 'le gana a la maza',
  mace: 'le gana a la espada',
  knife: 'pega último',
};

/**
 * El detalle de la carta ampliada, en renglones: cada arma con cuándo pega, cada piedra y palabra clave
 * explicada, y el efecto entero. Devuelve hasta dónde llegó.
 */
export function drawDetails(ctx: CanvasRenderingContext2D, f: Face, x: number, y: number, w: number, side: Side | null, cfg: Config): number {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const line = (text: string, color: string, size = 11.5, weight: '' | 'bold' = '') => {
    font(ctx, size, weight);
    ctx.fillStyle = color;
    y = textLines(ctx, wrap(ctx, text, w), x, y, size + 3.5);
  };
  font(ctx, 16, 'bold');
  ctx.fillStyle = side === null ? C.text : C.side[side];
  ctx.fillText(f.name, x, y);
  y += 17;
  const hit = cfg.faceValue === 'rank' ? f.rank : WEAPON_ORDER.reduce((a, wp) => a + f.dmg[wp], 0);
  const role = cfg.scoring === 'final' ? `Si llega viva al final, pega ${f.rank}.`
    : cfg.scoring === 'hero' ? `Al héroe rival le pega ${hit}.`
    : cfg.scoring === 'face' ? `Si no ataca, le pega ${hit} a la vida del rival.` : `En la mesa cuenta ${hit}.`;
  const price = cfg.cards === 'hand' ? `Cuesta ${f.rank} de maná (turno ${f.rank})` : `Turno ${f.rank}`;
  line(f.kind === 'spell' ? `Hechizo. ${price}: hace su efecto y se descarta.` : `${price}. ${role}`, C.dim, 11);
  if (f.hero) line(`De clase: solo la tiene el ${f.hero.name} (le llega una por turno).`, C.gold, 10.5);
  y += 3;
  if (f.kind === 'unit') {
    const weapons = WEAPON_ORDER.filter((wp) => f.dmg[wp] > 0);
    if (!weapons.length) line('No pega: no tiene armas.', C.dim);
    for (const wp of weapons) line(`${WEAPONS[wp].icon} ${WEAPONS[wp].name} ${f.dmg[wp]}: ${SHORT_HINT[wp]}`, C.text);
    if (f.dmg.bow > 0) {
      line(weapons.some((wp) => wp !== 'bow')
        ? 'Las otras armas son para defenderse cuerpo a cuerpo.'
        : 'Cuerpo a cuerpo no se defiende (contra otro arco, sí).', C.dim, 10.5);
    }
    line(`❤ Vida ${f.hp}${f.hp < f.maxHp ? ` (tenía ${f.maxHp})` : ''}`, C.text);
    if (f.shield > 0) line(`🛡 Escudo ${f.shield}: ${shieldText(f.shield, cfg.shieldBreak)}`, C.text);
    if (f.armor > 0) line(`Armadura ${f.armor}: le resta ${f.armor} a cada golpe.`, C.text);
  }
  y += 2;
  for (const a of f.abilities) {
    const runs = abilityRuns(a, a.spent ? 'rgba(255,214,107,.45)' : C.gold, a.spent ? 'rgba(233,226,207,.45)' : '#e9e2cf');
    for (const l of richLines(ctx, runs, w, 11.5)) {
      drawWords(ctx, l, x, y, 11.5);
      y += 15;
    }
    const why = a.key ? explain(a.key) : null;
    if (why) line(why, C.dim, 10.5);
    y += 2;
  }
  if (f.onBoard && f.kind === 'unit') {
    const changed = WEAPON_ORDER.some((wp) => f.dmg[wp] !== f.baseDmg[wp]) || f.maxHp !== f.baseHp;
    if (changed) {
      const base = WEAPON_ORDER.filter((wp) => f.baseDmg[wp] > 0).map((wp) => `${WEAPONS[wp].icon}${f.baseDmg[wp]}`);
      line(`Carta original: ${[...base, `❤${f.baseHp}`].join(' ')}`, C.dim, 10.5);
    }
  }
  ctx.restore();
  return y;
}
