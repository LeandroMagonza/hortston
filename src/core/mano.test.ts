import { describe, expect, it } from 'vitest';
import { DECKS } from './cards';
import {
  attack, attackTargets, candidates, canUsePower, discard, discarders, endCombat, heroTarget, mana, newGame, options, pick, pickers, play, summonUnit,
  usePower,
} from './rules';
import type { Side, State, Unit } from './types';

/** Salvajes contra Pradera con las reglas por defecto (mano y poder con maná); B con el Sacerdote, para tener tres cartas por turno. */
function start(): State {
  return newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: [null, 'sacerdote'] });
}

describe('la mano', () => {
  it('es la regla por defecto: llegan las cartas del turno, se descarta una y el maná es el número del turno', () => {
    const s = start();
    expect(s.cfg.cards).toBe('hand');
    expect(options(s, 0)).toEqual(['b_lobezno', 'b_rata']);
    expect(options(s, 1)).toEqual(['b_pollito', 'b_conejo', 'h_novicia']);
    // primero, cada uno descarta una de las que le llegaron
    expect(s.phase).toBe('discard');
    expect(discarders(s)).toEqual([0, 1]);
    expect(() => pick(s, 0, 0)).toThrow();
    discard(s, 0, 0); // el Lobezno
    expect(s.phase).toBe('discard');
    discard(s, 1, 2); // la Novicia
    expect(s.phase).toBe('pick');
    expect(options(s, 0)).toEqual(['b_rata']);
    expect(options(s, 1)).toEqual(['b_pollito', 'b_conejo']);
    expect(mana(s, 0)).toBe(1);
    // el rival no sabe cuál descartó: para él, la Novicia puede seguir en la mano
    expect(candidates(s, 1).map((c) => c.id)).toContain('h_novicia');
    expect(s.players[1].gone.map((c) => c.id)).toEqual(['h_novicia']);
  });

  it('se juegan las que sumen hasta el maná, o ninguna', () => {
    const s = start();
    discard(s, 0, 0);
    discard(s, 1, 2);
    expect(() => play(s, 1, [0, 1])).toThrow(); // 1 + 1 > 1
    play(s, 0, [0]); // rata
    play(s, 1, []); // no juega nada
    expect(s.phase).toBe('combat');
    expect(s.players[0].board.map((u) => u.card)).toEqual(['b_rata']);
    expect(s.record[0].plays).toEqual([['b_rata'], []]);
  });

  it('las que guardaste se juegan después, varias juntas, cada unidad en su lugar', () => {
    const s = start();
    discard(s, 0, 0);
    discard(s, 1, 2);
    play(s, 0, [0]);
    play(s, 1, []);
    endCombat(s);
    // T2: B descarta una de las tres nuevas y juega el Pollito y el Conejo del T1 juntos (maná 2)
    discard(s, 1, 4); // la Clériga
    expect(discarders(s)).toEqual([0]);
    discard(s, 0, 0);
    expect(options(s, 1)).toEqual(['b_pollito', 'b_conejo', 'b_perro', 'b_cordero']);
    play(s, 1, [0, 1], [1, 0]); // el Conejo a la izquierda
    play(s, 0, [0]);
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_conejo', 'b_pollito']);
    expect(s.record[1].plays[1]).toEqual(['b_pollito', 'b_conejo']);
    expect(options(s, 1)).toEqual(['b_perro', 'b_cordero']);
  });

  it('una unidad sin lugar va a la derecha; dos no pueden ir al mismo lugar', () => {
    const s = start();
    discard(s, 0, 0);
    discard(s, 1, 2);
    expect(() => play(s, 1, [0], [3])).toThrow(); // la fila va a tener una sola
    pick(s, 1, 0);
    expect(s.picks[1]).toEqual({ cards: [0], places: [0] });
  });

  it('después del T9 se juega lo que quedó; el que no tiene nada que jugar, pasa solo', () => {
    const s = start();
    s.turn = 9;
    s.phase = 'combat';
    s.players[0].hand = [{ id: 'b_trex', turn: 8 }];
    s.players[1].hand = [];
    endCombat(s);
    expect(s.turn).toBe(10);
    expect(mana(s, 0)).toBe(9);
    expect(s.phase).toBe('pick');
    expect(pickers(s)).toEqual([0]);
    play(s, 0, [0]);
    expect(s.phase).toBe('combat');
    expect(s.players[0].board.map((u) => u.card)).toEqual(['b_trex']);
  });

  it('sin mano, como antes: solo las del turno y una por turno, sin descarte', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], config: { cards: 'turn' } });
    expect(s.phase).toBe('pick');
    expect(() => play(s, 0, [])).toThrow();
    pick(s, 0, 1);
    pick(s, 1, 0);
    endCombat(s);
    expect(s.phase).toBe('pick');
    expect(options(s, 0)).toEqual(['b_escorpion', 'b_jabali']);
  });
});

describe('el poder con maná', () => {
  /** El T3 con el Mago (A ataca): las cartas ya se descartaron. */
  function mage(): State {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['mago', null] });
    discard(s, 0, 0);
    discard(s, 1, 0);
    return s;
  }

  it('cuesta 1 del maná de las cartas, se usa una vez por ataque y hace 1 (los números de Hearthstone)', () => {
    const s = mage();
    expect(s.cfg.powerMode).toBe('mana');
    expect(s.players[0].energy).toBe(1);
    play(s, 0, []); // A guarda el maná para el poder
    play(s, 1, [0]);
    expect(canUsePower(s, 0)).toBe(true);
    usePower(s, 0, heroTarget(1));
    expect(s.players[1].life).toBe(29);
    expect(s.players[0].energy).toBe(0);
    expect(canUsePower(s, 0)).toBe(false);
  });

  it('si gastás todo el maná en cartas, no hay poder', () => {
    const s = mage();
    play(s, 0, [0]);
    play(s, 1, [0]);
    expect(s.players[0].energy).toBe(0);
    expect(canUsePower(s, 0)).toBe(false);
  });

  it('las cartas de energía dan maná para el turno siguiente, para cartas o para el poder', () => {
    const s = mage();
    play(s, 0, []);
    play(s, 1, [0]);
    summonUnit(s, 0, 'b_perro'); // al invocar: +1
    expect(s.players[0].energy).toBe(1); // este turno, igual
    endCombat(s);
    expect(s.turn).toBe(2);
    expect(s.players[0].energy).toBe(3); // 2 del turno y 1 del Perro
    expect(s.players[1].energy).toBe(2);
  });

  it('una vez por turno aunque sobre maná', () => {
    const s = mage();
    s.players[0].energy = 5;
    play(s, 0, []);
    play(s, 1, [0]);
    usePower(s, 0, heroTarget(1));
    expect(s.players[0].energy).toBe(4);
    expect(canUsePower(s, 0)).toBe(false);
  });
});

describe('el ataque al héroe', () => {
  /** El combate del T2, A ataca, con las mesas vacías. */
  function fight(): State {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    s.turn = 2;
    s.phase = 'combat';
    s.attacker = 0;
    return s;
  }
  /** Una unidad que ya estaba (puede atacar), o recién llegada con `fresh`. */
  function put(s: State, j: Side, id: string, fresh = false): Unit {
    const u = summonUnit(s, j, id, false);
    if (!fresh) u.summonedTurn = s.turn - 1;
    return u;
  }

  it('es la regla por defecto: se ataca al héroe como a una unidad, no devuelve el golpe, y las que no atacan no pegan solas', () => {
    const s = fight();
    expect(s.cfg.scoring).toBe('hero');
    const tigre = put(s, 0, 'b_tigre'); // 7/6
    const vaca = put(s, 1, 'b_vaca');
    expect(attackTargets(s, tigre.uid)).toEqual([vaca.uid, heroTarget(1)]);
    attack(s, tigre.uid, heroTarget(1));
    expect(s.players[1].life).toBe(23);
    expect(tigre.hp).toBe(6);
    expect(attackTargets(s, tigre.uid)).toEqual([]);
    put(s, 0, 'b_cocodrilo'); // no ataca
    endCombat(s);
    expect(s.players[1].life).toBe(23);
  });

  it('el Guardián lo frena (salvo con Sigilo); con Embestida, el turno en que entra solo ataca unidades; con Carga, también al héroe', () => {
    const s = fight();
    const tigre = put(s, 0, 'b_tigre');
    const carnero = put(s, 1, 'b_carnero');
    expect(attackTargets(s, tigre.uid)).toEqual([carnero.uid]);
    carnero.stealth = true;
    expect(attackTargets(s, tigre.uid)).toEqual([heroTarget(1)]);
    carnero.stealth = false;
    carnero.guard = false;
    const hachera = put(s, 0, 'h_hachera', true);
    expect(attackTargets(s, hachera.uid)).toEqual([carnero.uid]);
    const jabali = put(s, 0, 'b_jabali', true);
    expect(attackTargets(s, jabali.uid)).toEqual([carnero.uid, heroTarget(1)]);
  });

  it('atacarlo saca el Sigilo, el Robo de vida cura y se dispara «al pegarle al rival»', () => {
    const s = fight();
    const bandida = put(s, 0, 'h_bandida');
    expect(bandida.stealth).toBe(true);
    attack(s, bandida.uid, heroTarget(1));
    expect(bandida.stealth).toBe(false);
    const ladrona = put(s, 0, 'b_tigre');
    ladrona.lifesteal = true;
    s.players[0].life = 20;
    attack(s, ladrona.uid, heroTarget(1));
    expect(s.players[0].life).toBe(27);
    const sabueso = put(s, 0, 'h_sabueso'); // al pegarle al rival: +1 de maná en el turno siguiente
    attack(s, sabueso.uid, heroTarget(1));
    expect(s.players[0].boost).toBe(1);
  });

  it('el que llega a 0 pierde en el acto', () => {
    const s = fight();
    const tigre = put(s, 0, 'b_tigre');
    s.players[1].life = 5;
    attack(s, tigre.uid, heroTarget(1));
    expect(s.phase).toBe('end');
    expect(s.result?.winner).toBe(0);
  });
});
