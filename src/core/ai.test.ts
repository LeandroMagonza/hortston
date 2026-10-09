import { describe, expect, it } from 'vitest';
import { playOut } from './ai';
import { DECKS, OLD_DECKS } from './cards';
import { newGame } from './rules';
import type { Config } from './types';

const ALL = { ...DECKS, ...OLD_DECKS };

/** Una partida IA contra IA; sin decir, sin mano (más rápido). */
function game(config: Partial<Config>, decks: [string, string] = ['manada', 'muralla']) {
  const s = newGame({ decks: [ALL[decks[0]], ALL[decks[1]]], names: ['A', 'B'], config: { cards: 'turn', ...config } });
  playOut(s);
  return s;
}

describe('IA contra IA', () => {
  it('termina la partida en todos los modos', () => {
    for (const pickMode of ['sequential', 'simultaneous'] as const) {
      for (const extraRounds of [0, 1, 3]) {
        const s = game({ pickMode, extraRounds });
        expect(s.phase).toBe('end');
        expect(s.result).not.toBeNull();
      }
    }
  }, 30000);

  it('termina con los mazos del juego, con cualquier límite de ataques', () => {
    for (const maxAttacks of [0, 1, 2]) {
      const s = game({ maxAttacks }, ['salvajes', 'pradera']);
      expect(s.phase).toBe('end');
    }
  }, 30000);

  it('termina con héroes y con mano (la regla por defecto): usa el poder, juega varias juntas y descarta', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['mago', 'paladin'] });
    playOut(s);
    expect(s.phase).toBe('end');
    expect(s.record.some((r) => r.powers.length > 0)).toBe(true);
    expect(s.record.some((r) => r.plays.some((p) => p.length > 1))).toBe(true);
    expect(s.players.every((p) => p.gone.length > 0)).toBe(true);
  }, 60000);

  it('con mano tampoco hay azar', () => {
    const run = () => {
      const s = newGame({ decks: [DECKS.pradera, DECKS.salvajes], names: ['A', 'B'], heroes: ['druida', 'picaro'] });
      playOut(s);
      return s;
    };
    const a = run(), b = run();
    expect(a.result).toEqual(b.result);
    expect(a.history).toEqual(b.history);
  }, 60000);

  it('sin azar: la misma partida da siempre lo mismo', () => {
    const a = game({ pickMode: 'sequential' });
    const b = game({ pickMode: 'sequential' });
    expect(a.result).toEqual(b.result);
    expect(a.history).toEqual(b.history);
  }, 30000);
});
