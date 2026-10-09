// Los íconos de game-icons.net (la lista está en iconos.ts): una silueta que se pinta del color que se
// quiera, en el canvas o en el HTML del menú.
import { ICONS } from './iconos';
import SVG from './iconos-svg.json';

const PATHS = SVG as Record<string, string>;
const cache = new Map<string, Path2D | null>();

function pathData(key: string): string | null {
  const name = ICONS[key];
  return (name && PATHS[name]) || null;
}

/** El dibujo de una carta (por id), un héroe (heroe_<id>), un poder (poder_<kind>)…; null si no tiene. */
function iconPath(key: string): Path2D | null {
  let p = cache.get(key);
  if (p === undefined) {
    const d = pathData(key);
    p = d ? new Path2D(d) : null;
    cache.set(key, p);
  }
  return p;
}

/**
 * Pinta el ícono centrado en (cx, cy), de `size` de lado. `color` es un color o [arriba, abajo] para un
 * degradé. Con `shadow`, una sombra atrás. Devuelve false si no tiene ícono.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D, key: string, cx: number, cy: number, size: number,
  color: string | [string, string], shadow?: string,
): boolean {
  const p = iconPath(key);
  if (!p) return false;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 512, size / 512);
  if (shadow) {
    ctx.shadowColor = shadow;
    ctx.shadowBlur = Math.max(2, size * 0.08);
    ctx.shadowOffsetY = Math.max(1, size * 0.025);
  }
  if (typeof color === 'string') ctx.fillStyle = color;
  else {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, color[0]);
    g.addColorStop(1, color[1]);
    ctx.fillStyle = g;
  }
  ctx.fill(p);
  ctx.restore();
  return true;
}

/** Para el HTML (menú, historial): el ícono como <svg>, del color del texto. */
export function iconSvg(key: string): string {
  const d = pathData(key);
  return d ? `<svg class="ico" viewBox="0 0 512 512" aria-hidden="true"><path d="${d}"/></svg>` : '';
}
