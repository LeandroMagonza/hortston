// Simulador IA contra IA:  npm run sim  [-- -v]
// Como no hay azar, cada configuración da siempre el mismo resultado: alcanza con una partida por
// combinación. -v imprime el registro completo de cada partida.
//
// Además del resultado, cuenta cómo terminan los ataques: «gratis» (el que ataca mata y sobrevive),
// «cambio» (mueren los dos), «nadie» (no muere ninguno). Si casi todo es gratis, el que ataca limpia la
// mesa sin costo y elegir carta deja de importar (fue lo que pasó con la curva 2N+2).
import { playOut } from '../src/core/ai';
import { DECKS } from '../src/core/cards';
import { newGame } from '../src/core/rules';
import type { Config, State } from '../src/core/types';

const verbose = process.argv.includes('-v');

const MATCHUPS: [string, string][] = [['salvajes', 'pradera'], ['pradera', 'salvajes'], ['salvajes', 'salvajes'], ['pradera', 'pradera']];

const VARIANTS: { name: string; config: Partial<Config> }[] = [
  { name: 'por defecto: las que no atacan le pegan a la vida (su daño)', config: {} },
  { name: 'las que no atacan pegan su nivel', config: { faceValue: 'rank' } },
  { name: 'cada turno, la diferencia de mesa (daño)', config: { scoring: 'difference' } },
  { name: 'regla vieja: solo al final', config: { scoring: 'final' } },
];

function outcomes(s: State): { free: number; trade: number; none: number } {
  const o = { free: 0, trade: 0, none: 0 };
  for (const r of s.record) {
    for (const a of r.attacks) {
      if (a.dHp === null && a.aHp !== null) o.free++;
      else if (a.dHp === null) o.trade++;
      else if (a.aHp !== null) o.none++;
    }
  }
  return o;
}

const t0 = Date.now();
for (const v of VARIANTS) {
  console.log(`\n== ${v.name} ==`);
  const tot = { free: 0, trade: 0, none: 0 };
  for (const [m0, m1] of MATCHUPS) {
    const s = newGame({ decks: [DECKS[m0], DECKS[m1]], names: [`J1 ${m0}`, `J2 ${m1}`], config: v.config });
    playOut(s);
    const r = s.result!;
    const o = outcomes(s);
    tot.free += o.free;
    tot.trade += o.trade;
    tot.none += o.none;
    const win = r.winner === null ? 'empate' : `gana ${s.players[r.winner].name}`;
    console.log(`J1 ${m0.padEnd(8)} (ataca impares) vs J2 ${m1.padEnd(8)} → vida ${r.life.join(' a ')} · termina en el turno ${s.turn} · ${win}`);
    if (verbose) {
      for (const l of s.log) console.log('   ', l.text);
    }
  }
  const n = tot.free + tot.trade + tot.none || 1;
  const pc = (x: number) => `${Math.round((100 * x) / n)}%`;
  console.log(`   ataques: ${n} · matan gratis ${pc(tot.free)} · cambio ${pc(tot.trade)} · no muere nadie ${pc(tot.none)}`);
}
console.log(`\n(${Date.now() - t0} ms)`);
