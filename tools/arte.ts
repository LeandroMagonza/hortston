// Dibujos de las cartas con IA:  npm run arte -- [qué] [opciones]
//
// Adaptado del generador de skins de «STS Modded tools» (Python, OpenAI gpt-image-2). Cambios:
// - Está en TypeScript, como el resto del proyecto, y sin dependencias: usa fetch contra la API de OpenAI.
// - Los pedidos salen de las cartas mismas: el estilo es uno solo para todas (arte-temas.ts) y cada
//   carta suma qué se dibuja; no hay que escribir un JSON a mano por imagen.
// - Además de transformar una imagen (images/edits, lo único que hacía el de STS), genera de cero
//   (images/generations) y acepta una imagen de referencia de estilo, para que todas salgan parecidas.
// - Guarda en public/art/ y arma public/art/index.json: el juego usa solas las imágenes que encuentra.
//
// La clave: OPENAI_API_KEY, en el entorno o en un archivo .env en esta carpeta (web/.env, que no se sube).
//
// Qué generar (se pueden mezclar): ids de cartas (b_lobo, h_aprendiz…), heroe_<id> para los retratos, o
// grupos: salvajes, pradera, clases, fichas, heroes, todo.
//
// Opciones:
//   --prueba              no llama a la API: muestra qué pediría y cuántas imágenes son
//   --calidad low|medium|high   (medium por defecto)
//   --forzar              rehace las que ya existen
//   --sufijo _v2          guarda como <id>_v2.webp, para comparar sin pisar la que se usa
//   --estilo arte.webp    imagen de referencia: el dibujo nuevo copia su estilo (images/edits)
//   --desde arte.webp     mejora esa imagen en vez de empezar de cero (images/edits, con el pedido)
//   --extra "texto"       se suma al pedido (por ejemplo, «more dramatic lighting»)
//   --formato webp|png    (webp por defecto: pesa mucho menos)
//   --indice              solo rehace public/art/index.json (si renombraste o borraste imágenes a mano)
//
// Ejemplos:
//   npm run arte -- b_lobo --prueba
//   npm run arte -- b_lobo b_tigre --calidad high
//   npm run arte -- salvajes --estilo public/art/b_lobo.webp
//   npm run arte -- b_lobo --desde public/art/b_lobo.webp --extra "show the whole pack behind" --sufijo _v2
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { CARDS, DECKS } from '../src/core/cards';
import { HERO_ORDER, HEROES } from '../src/core/heroes';
import { PORTRAIT, SPELL, STYLE, SUBJECTS } from './arte-temas';

const MODEL = 'gpt-image-2';
const API = 'https://api.openai.com/v1/images';
const OUT = join(import.meta.dirname, '..', 'public', 'art');
const PARALLEL = 3;

// ───────────────────────── argumentos ─────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
function option(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const WITH_VALUE = ['calidad', 'sufijo', 'estilo', 'desde', 'extra', 'formato'];
const words = argv.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.some((w) => argv[i - 1] === `--${w}`));

const dry = flag('prueba');
const force = flag('forzar');
const quality = option('calidad', 'medium');
const suffix = option('sufijo', '');
const style = option('estilo', '');
const from = option('desde', '');
const extra = option('extra', '');
const format = option('formato', 'webp') as 'webp' | 'png';

if (!['low', 'medium', 'high'].includes(quality)) throw new Error('--calidad: low, medium o high');
if (!['webp', 'png'].includes(format)) throw new Error('--formato: webp o png');
for (const f of [style, from]) if (f && !existsSync(f)) throw new Error(`no existe ${f}`);

// ───────────────────────── qué dibujar ─────────────────────────

const deckIds = (d: string) => [...new Set(DECKS[d].turns.flat())];
const tokensOf = (ids: string[]) => ids.flatMap((id) => {
  const fx = CARDS[id].effects ?? {};
  return Object.values(fx).flat().flatMap((e) => (e && e.type === 'summon' ? [e.card] : []));
});
const GROUPS: Record<string, () => string[]> = {
  salvajes: () => [...deckIds('salvajes'), ...tokensOf(deckIds('salvajes'))],
  pradera: () => [...deckIds('pradera'), ...tokensOf(deckIds('pradera'))],
  clases: () => HERO_ORDER.flatMap((h) => HEROES[h].cards),
  fichas: () => Object.values(CARDS).filter((c) => c.id.startsWith('h_') && c.kind === 'unit' && c.token).map((c) => c.id),
  heroes: () => HERO_ORDER.map((h) => `heroe_${h}`),
};
GROUPS.todo = () => ['salvajes', 'pradera', 'clases', 'fichas', 'heroes'].flatMap((g) => GROUPS[g]());

function expand(list: string[]): string[] {
  const ids = list.flatMap((w) => {
    if (GROUPS[w]) return GROUPS[w]();
    if (CARDS[w] || (w.startsWith('heroe_') && HEROES[w.slice(6)])) return [w];
    throw new Error(`no conozco «${w}»: va un id de carta, heroe_<id> o un grupo (${Object.keys(GROUPS).join(', ')})`);
  });
  return [...new Set(ids)];
}

/** El pedido para una imagen: el estilo, qué se dibuja y lo que se agregue. */
function prompt(id: string): string {
  const hero = id.startsWith('heroe_') ? HEROES[id.slice(6)] : null;
  const c = hero ? null : CARDS[id];
  const subject = SUBJECTS[id] ?? (hero ? `the ${hero.name} hero` : `${c!.name} (${c!.art})`);
  const parts = [STYLE, `Subject: ${subject}.`];
  if (c?.kind === 'spell') parts.push(SPELL);
  if (hero) parts.push(PORTRAIT);
  if (style) parts.push('Match the art style, palette, brushwork and lighting of the reference image exactly, but draw the new subject; do not copy its subject or composition.');
  if (from) parts.push('Improve this image: keep the subject and composition, make it cleaner, more detailed and more striking.');
  if (extra) parts.push(extra);
  return parts.join(' ');
}

// ───────────────────────── la API ─────────────────────────

function apiKey(): string {
  const env = join(import.meta.dirname, '..', '.env');
  if (!process.env.OPENAI_API_KEY && existsSync(env)) process.loadEnvFile(env);
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY: ponela en web/.env (OPENAI_API_KEY=...) o en el entorno.');
  return key;
}

const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function fileBlob(path: string): Blob {
  return new Blob([readFileSync(path)], { type: MIME[extname(path).toLowerCase()] ?? 'image/png' });
}

/** Pide una imagen y devuelve los bytes. Con `--desde` o `--estilo` va por images/edits. */
async function request(key: string, text: string): Promise<Buffer> {
  const images = [from, style].filter(Boolean);
  let res: Response;
  if (images.length) {
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', text);
    form.append('size', '1024x1024');
    form.append('quality', quality);
    form.append('output_format', format);
    for (const img of images) form.append(images.length > 1 ? 'image[]' : 'image', fileBlob(img), basename(img));
    res = await fetch(`${API}/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } else {
    res = await fetch(`${API}/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: text, size: '1024x1024', quality, output_format: format, n: 1 }),
    });
  }
  const body = await res.json() as { data?: { b64_json?: string }[]; error?: { message: string } };
  if (!res.ok || !body.data?.[0]?.b64_json) {
    const err = new Error(`${res.status}: ${body.error?.message ?? 'sin imagen en la respuesta'}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return Buffer.from(body.data[0].b64_json, 'base64');
}

/** Reintenta lo que puede ser pasajero (límite de pedidos, errores del servidor). */
async function withRetry(key: string, text: string): Promise<Buffer> {
  for (let k = 0; ; k++) {
    try {
      return await request(key, text);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      if (k >= 2 || !(status === 429 || status >= 500)) throw e;
      await new Promise((r) => setTimeout(r, 4000 * (k + 1)));
    }
  }
}

/** public/art/index.json: las imágenes que usa el juego (las que se llaman igual que la carta). */
function writeManifest(): number {
  const files = readdirSync(OUT).filter((f) => /\.(webp|png|jpe?g)$/i.test(f));
  const art: Record<string, string> = {};
  for (const f of files) {
    const id = f.replace(/\.[^.]+$/, '');
    if (CARDS[id] || (id.startsWith('heroe_') && HEROES[id.slice(6)])) art[id] = f;
  }
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(art, null, 2)}\n`);
  return Object.keys(art).length;
}

// ───────────────────────── principal ─────────────────────────

async function main(): Promise<void> {
  if (!words.length && !flag('indice')) {
    console.log('Decí qué dibujar: ids de cartas, heroe_<id>, o un grupo:', Object.keys(GROUPS).join(', '));
    console.log('Por ejemplo: npm run arte -- b_lobo --prueba   (más opciones al principio de tools/arte.ts)');
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const ids = expand(words);
  const out = (id: string) => join(OUT, `${id}${suffix}.${format}`);
  const todo = ids.filter((id) => force || !existsSync(out(id)));
  const mode = from ? `mejorando ${from}` : style ? `con el estilo de ${style}` : 'de cero';
  console.log(`${todo.length} imagen(es) ${mode}, calidad ${quality}, ${format}${ids.length > todo.length ? ` (${ids.length - todo.length} ya estaban: --forzar para rehacerlas)` : ''}`);
  if (dry) {
    for (const id of todo) console.log(`\n· ${id}${suffix}.${format}\n  ${prompt(id)}`);
    return;
  }
  if (!todo.length) {
    console.log(`index.json: ${writeManifest()} imágenes`);
    return;
  }
  const key = apiKey();
  const queue = [...todo];
  let done = 0, failed = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        writeFileSync(out(id), await withRetry(key, prompt(id)));
        done++;
        console.log(`✓ ${id} (${done}/${todo.length})`);
      } catch (e) {
        failed++;
        console.log(`✗ ${id}: ${(e as Error).message}`);
      }
    }
  }));
  console.log(`\n${done} hechas, ${failed} con error, en ${Math.round((Date.now() - t0) / 1000)} s. index.json: ${writeManifest()} imágenes.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
