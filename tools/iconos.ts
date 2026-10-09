// Baja los íconos de game-icons.net que usa el juego:  npm run iconos
//
// Lee la lista de src/game/iconos.ts, baja de GitHub (game-icons/icons) los que todavía no están y guarda
// el dibujo de cada uno (el `d` de sus paths, sin el fondo negro) en src/game/iconos-svg.json, que el
// juego pinta del color que quiere. Avisa si a alguna carta, héroe o poder le falta ícono. Con
// --todos vuelve a bajar todos.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CARDS, DECKS, OLD_DECKS } from '../src/core/cards';
import { HEROES } from '../src/core/heroes';
import { WEAPON_ORDER } from '../src/core/weapons';
import { ICONS } from '../src/game/iconos';

const RAW = 'https://raw.githubusercontent.com/game-icons/icons/master';
const OUT = join(import.meta.dirname, '..', 'src', 'game', 'iconos-svg.json');

const needed = [
  ...Object.keys(CARDS),
  ...Object.values(HEROES).flatMap((h) => [`heroe_${h.id}`, `poder_${h.power.kind}`]),
  ...[...Object.values(DECKS), ...Object.values(OLD_DECKS)].map((d) => `mazo_${d.id}`),
  ...WEAPON_ORDER.map((w) => `arma_${w}`),
  'marca_energia', 'marca_dormida', 'marca_congelada',
];
const missing = needed.filter((k) => !ICONS[k]);
if (missing.length) {
  console.error(`Sin ícono en src/game/iconos.ts: ${missing.join(', ')}`);
  process.exit(1);
}

const all = process.argv.includes('--todos');
const have: Record<string, string> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const names = [...new Set(Object.values(ICONS))].sort();
const todo = names.filter((n) => all || !have[n]);
console.log(`${names.length} íconos; faltan ${todo.length}.`);

/** El dibujo de un SVG de game-icons: los `d` de sus paths menos el cuadrado negro del fondo. */
function pathOf(svg: string): string {
  const ds = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).filter((d) => !/^M0 0h512v512H0z$/.test(d));
  if (!ds.length) throw new Error('sin paths');
  return ds.join(' ');
}

let failed = 0;
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(todo.slice(i, i + 8).map(async (n) => {
    try {
      const res = await fetch(`${RAW}/${n}.svg`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      have[n] = pathOf(await res.text());
    } catch (e) {
      failed++;
      console.error(`  ✗ ${n}: ${(e as Error).message}`);
    }
  }));
}
// solo los que se usan, ordenados (así el archivo cambia poco)
const out = Object.fromEntries(names.filter((n) => have[n]).map((n) => [n, have[n]]));
writeFileSync(OUT, `${JSON.stringify(out, null, 0).replace(/","/g, '",\n"')}\n`);
const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
console.log(`Listo: ${Object.keys(out).length} en src/game/iconos-svg.json (${kb} KB).${failed ? ` Fallaron ${failed}.` : ''}`);
const authors = [...new Set(names.map((n) => n.split('/')[0]))].sort();
console.log(`Autores (para los créditos): ${authors.join(', ')}`);
if (failed) process.exit(1);
