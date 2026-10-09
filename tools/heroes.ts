// Los héroes, IA contra IA:  npm run heroes [-- todos | <héroe>…] [clave=valor…]
//
// Cada héroe contra un rival sin héroe, con el mismo mazo de los dos lados (Salvajes y Pradera) y en los
// dos asientos (atacar en los impares o en los pares): 4 partidas por héroe. Mide cuánto vale el poder
// y su carta de clase: diferencia de vida a favor del héroe, cuántas gana y cuántas veces usó el poder.
// Con `todos`, además, cada héroe contra cada otro (mismos mazos y asientos), para ver quién le gana a
// quién; con ids de héroes, solo esas filas (más rápido). `clave=valor` cambia una regla en prueba
// (por ejemplo, priestHeal=double). Sin azar: cada partida da siempre lo mismo.
import { playOut } from '../src/core/ai';
import { DECKS } from '../src/core/cards';
import { HERO_ORDER, HEROES } from '../src/core/heroes';
import { newGame } from '../src/core/rules';
import type { Config, Side, State } from '../src/core/types';

const args = process.argv.slice(2);
const rows = args.filter((a) => HEROES[a]);
const all = args.includes('todos') || rows.length > 0;
const config: Record<string, string | number | boolean> = {};
for (const a of args.filter((x) => x.includes('='))) {
  const [k, v] = a.split('=');
  config[k] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
}
const DECK_IDS = ['salvajes', 'pradera'];

/** Una partida con `a` en el asiento `seat` y `b` en el otro, los dos con el mazo `deck`. */
function game(a: string | null, b: string | null, deck: string, seat: Side): State {
  const heroes: [string | null, string | null] = seat === 0 ? [a, b] : [b, a];
  const s = newGame({ decks: [DECKS[deck], DECKS[deck]], names: ['J1', 'J2'], heroes, config: config as Partial<Config> });
  playOut(s);
  return s;
}

function score(s: State, seat: Side): { diff: number; win: number; uses: number; card: number } {
  const r = s.result!;
  const you = seat === 0 ? 1 : 0;
  const mine = s.players[seat].hero ? HEROES[s.players[seat].hero!].cards : [];
  return {
    diff: r.life[seat] - r.life[you],
    win: r.winner === seat ? 1 : r.winner === null ? 0.5 : 0,
    uses: s.record.reduce((a, t) => a + t.powers.filter((p) => p.side === seat).length, 0),
    card: s.record.reduce((a, t) => a + t.plays[seat].filter((id) => mine.includes(id)).length, 0),
  };
}

const t0 = Date.now();
if (Object.keys(config).length) console.log(`Reglas: ${JSON.stringify(config)}\n`);
if (!rows.length) console.log('Cada héroe contra un rival sin héroe (mismo mazo, los dos asientos): 4 partidas.\n');
if (!rows.length) console.log(`${'héroe'.padEnd(24)}${'ganadas'.padStart(8)}${'vida ±'.padStart(9)}${'poder'.padStart(7)}${'clase'.padStart(7)}`);
for (const id of rows.length ? [] : HERO_ORDER) {
  let diff = 0, win = 0, uses = 0, card = 0, n = 0;
  for (const deck of DECK_IDS) {
    for (const seat of [0, 1] as const) {
      const r = score(game(id, null, deck, seat), seat);
      diff += r.diff;
      win += r.win;
      uses += r.uses;
      card += r.card;
      n++;
    }
  }
  const h = HEROES[id];
  console.log(`${`${h.art} ${h.name}`.padEnd(24)}${`${win}/${n}`.padStart(8)}${`${diff >= 0 ? '+' : ''}${(diff / n).toFixed(1)}`.padStart(9)}${(uses / n).toFixed(1).padStart(7)}${(card / n).toFixed(1).padStart(7)}`);
}
if (!rows.length) console.log('\nganadas: de 4 (empate cuenta ½) · vida ±: diferencia promedio al final · poder: usos por partida · clase: cartas de clase que jugó por partida (de hasta 9)');

if (all) {
  console.log('\nCada héroe (fila) contra cada otro (columna): partidas ganadas de 4.\n');
  const short = (id: string) => HEROES[id].art;
  console.log(`${''.padEnd(24)}${HERO_ORDER.map((id) => short(id).padStart(5)).join('')}   total`);
  for (const a of rows.length ? rows : HERO_ORDER) {
    let total = 0;
    const row = HERO_ORDER.map((b) => {
      if (a === b) return '   ·';
      let w = 0;
      for (const deck of DECK_IDS) for (const seat of [0, 1] as const) w += score(game(a, b, deck, seat), seat).win;
      total += w;
      return String(w).padStart(4);
    });
    console.log(`${`${HEROES[a].art} ${HEROES[a].name}`.padEnd(24)}${row.join(' ')}   ${total}/${4 * (HERO_ORDER.length - 1)}`);
  }
}
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s)`);
