import { describe, expect, it } from 'vitest';
import { choosePlace } from './ai';
import { card, DECKS, OLD_DECKS } from './cards';
import { HEROES } from './heroes';
import {
  attack, attackTargets, canUsePower, chooseTarget, DEFAULT_CONFIG, endCombat, heroTarget, newGame as startGame, options, pick, powerTargets, resolveOrder,
  summonUnit, turnOptions, unitById, usePower,
} from './rules';
import type { Config, Damage, Side, State, Unit, UnitCard } from './types';
import { emptyDamage, triadOrder } from './weapons';

/**
 * Estos tests son de las reglas de antes: sin mano (una de las tres del turno), con la energía del poder
 * aparte y con las que no atacan pegándole solas a la vida. Los de la mano, el poder con maná y el ataque
 * al héroe, en mano.test.ts.
 */
const newGame: typeof startGame = (o) => startGame({ ...o, config: { cards: 'turn', powerMode: 'fixed', scoring: 'face', ...o.config } });

/** Salta al turno `n`, con las cartas de ese turno en la mano de cada uno. */
function goTo(s: State, n: number): void {
  s.turn = n;
  for (const j of [0, 1] as const) deal(s, j, turnOptions(s.players[j], n));
}

/** Le pone esas cartas en la mano (como llegadas este turno). */
function deal(s: State, j: Side, ids: string[]): void {
  s.players[j].hand = ids.map((id) => ({ id, turn: s.turn }));
}

/**
 * Una partida en el combate del turno 1, con el tablero vacío para armarlo a mano. Las que se ponen
 * pueden atacar enseguida (sin «recién llegada»), salvo que el test diga otra cosa.
 */
function arena(config: Partial<Config> = {}): State {
  const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'], config: { summonSick: false, ...config } });
  s.phase = 'combat';
  s.attacker = 0;
  return s;
}

/** Pone una unidad; `w` reemplaza todas sus armas. */
function put(s: State, side: Side, id: string, over: Partial<Unit> = {}, w?: Partial<Damage>): Unit {
  const u = summonUnit(s, side, id, false);
  Object.assign(u, over);
  if (w) u.dmg = { ...emptyDamage(), ...w };
  return u;
}

describe('triángulo', () => {
  it('espada > hacha > maza > espada; misma arma o sin rival, a la vez', () => {
    expect(triadOrder('sword', 'axe')).toBe('attacker');
    expect(triadOrder('axe', 'mace')).toBe('attacker');
    expect(triadOrder('mace', 'sword')).toBe('attacker');
    expect(triadOrder('axe', 'sword')).toBe('defender');
    expect(triadOrder('sword', 'sword')).toBe('both');
    expect(triadOrder('sword', null)).toBe('both');
  });
});

describe('mazos del juego', () => {
  it('con ataque simple los dos se pegan a la vez', () => {
    const s = arena();
    const a = put(s, 0, 'b_conejo'); // ⚔️1 ❤3
    const d = put(s, 1, 'b_perro', { hp: 3 }); // ⚔️2 ❤3
    attack(s, a.uid, d.uid);
    expect([a.hp, d.hp]).toEqual([1, 2]);
  });

  it('a la vez: los dos pueden morir', () => {
    const s = arena();
    const a = put(s, 0, 'b_rata', {}, { attack: 3 }); // ⚔️3 ❤1
    const d = put(s, 1, 'b_conejo'); // ⚔️1 ❤3
    attack(s, a.uid, d.uid);
    expect(unitById(s, a.uid)).toBeNull();
    expect(unitById(s, d.uid)).toBeNull();
  });

  it('contra una espada, el ataque simple también pega a la vez', () => {
    const s = arena();
    const a = put(s, 0, 'b_cocodrilo', { hp: 3 }, { attack: 3 });
    const d = put(s, 1, 'armadillo', { hp: 3, armor: 0 }, { sword: 3 });
    attack(s, a.uid, d.uid);
    expect(unitById(s, a.uid)).toBeNull();
    expect(unitById(s, d.uid)).toBeNull();
  });

  it('las cartas sin efectos siguen la curva de Hearthstone, 2N+1 (en el T1 puede haber 3/1 o 1/3)', () => {
    for (const deck of Object.values(DECKS)) {
      deck.turns.forEach((ids, t) => {
        for (const id of ids) {
          const c = card(id);
          if (c.kind !== 'unit' || c.effects || c.shield || c.guard || c.charge || c.poison || c.aura) continue;
          const d = { ...emptyDamage(), ...c.dmg };
          expect(c.rank).toBe(t + 1);
          expect(d.bow + d.sword + d.axe + d.mace).toBe(0);
          const want = 2 * (t + 1) + 1 - (d.spear > 0 ? 1 : 0) + (d.knife > 0 ? 1 : 0);
          expect(Math.abs(d.spear + d.attack + d.knife + c.hp - want)).toBeLessThanOrEqual(t === 0 ? 1 : 0);
        }
      });
    }
  });

  it('en un turno, ninguna carta sin efectos es otra con más números', () => {
    for (const deck of Object.values(DECKS)) {
      for (const ids of deck.turns) {
        const plain = ids.map((id) => card(id)).filter((c): c is UnitCard => c.kind === 'unit' && !c.effects && !c.shield && !c.guard && !c.charge && !c.poison && !c.aura);
        for (const x of plain) {
          for (const y of plain) {
            if (x === y) continue;
            const dx = { ...emptyDamage(), ...x.dmg }, dy = { ...emptyDamage(), ...y.dmg };
            const nums = (c: UnitCard, d: Damage) => [d.spear, d.attack, d.knife, c.hp];
            const nx = nums(x, dx), ny = nums(y, dy);
            const covers = nx.every((v, i) => v >= ny[i]) && nx.some((v, i) => v > ny[i]);
            expect(covers, `${x.name} es ${y.name} con más números`).toBe(false);
          }
        }
      }
    }
  });

  it('la lanza pega antes: si mata, el otro no llega a pegar', () => {
    const s = arena();
    const a = put(s, 0, 'b_cabra'); // 🔱3 ⚔️2 ❤3
    const d = put(s, 1, 'b_cocodrilo', { hp: 3 }); // ⚔️5
    attack(s, a.uid, d.uid);
    expect(unitById(s, d.uid)).toBeNull();
    expect(a.hp).toBe(3);
  });

  it('el cuchillo pega al final, solo si sigue viva', () => {
    const s = arena();
    const a = put(s, 0, 'b_leopardo'); // ⚔️4 🔪3 ❤5
    const d = put(s, 1, 'b_jabali', { hp: 20 }, { attack: 1 });
    attack(s, a.uid, d.uid);
    expect([a.hp, d.hp]).toEqual([4, 13]);
    const e = put(s, 1, 'b_tigre'); // ⚔️7 ❤6
    a.energy = 1;
    attack(s, a.uid, e.uid);
    expect(unitById(s, a.uid)).toBeNull();
    expect(e.hp).toBe(2); // el ataque entró (4), el cuchillo no
  });

  it('entran las dos y después los efectos: el del que ataca le puede apuntar a la carta nueva del otro', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['cazador', null] });
    pick(s, 0, 2); // avispa (la del Cazador): al invocar, 1 de daño a una unidad enemiga
    pick(s, 1, 1); // conejo ⚔️1 ❤3
    expect(s.phase).toBe('target');
    const conejo = s.players[1].board[0];
    expect(s.pending?.options).toEqual([conejo.uid]);
    chooseTarget(s, 0, conejo.uid);
    expect(conejo.hp).toBe(2);
    expect(s.phase).toBe('combat');
  });

  it('el Murciélago le pega 1 solo a las enemigas', () => {
    const s = arena();
    const mine = put(s, 0, 'b_perro', { hp: 3 });
    const theirs = put(s, 1, 'b_conejo');
    summonUnit(s, 0, 'b_murcielago');
    expect([mine.hp, theirs.hp]).toEqual([3, 2]);
  });

  it('el Elefante le pega a una enemiga y a las de sus costados', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    s.turn = 8;
    const row = ['b_conejo', 'b_perro', 'b_vaca', 'b_mamut'].map((id) => put(s, 1, id, id === 'b_perro' ? { hp: 3 } : {}));
    deal(s, 0, ['b_elefante', 'b_elefante', 'b_elefante']);
    pick(s, 1, 0);
    pick(s, 0, 0);
    chooseTarget(s, 0, row[1].uid); // el perro: también el conejo y la vaca, no el mamut
    expect(row.map((u) => u.hp)).toEqual([1, 1, 6, 10]);
  });

  it('el Ternero crece al final de cada turno, y la Avispa lo saca antes', () => {
    const heroes: [string, string] = ['cazador', 'druida'];
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes });
    pick(s, 0, 1); // rata
    pick(s, 1, 2); // ternero 1/1 (la del Druida)
    endCombat(s);
    const ternero = s.players[1].board[0];
    expect([ternero.dmg.attack, ternero.hp]).toEqual([2, 2]);
    const t = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes });
    pick(t, 1, 2); // ternero
    pick(t, 0, 2); // avispa
    chooseTarget(t, 0, t.players[1].board[0].uid);
    expect(t.players[1].board).toHaveLength(0);
  });

  it('Veneno: si le hace daño, la mata; el Escudo lo frena', () => {
    const s = arena();
    const a = put(s, 0, 'b_escorpion'); // ⚔️1 ❤2, veneno
    const big = put(s, 1, 'b_mamut'); // ⚔️9 ❤10
    attack(s, a.uid, big.uid);
    expect(unitById(s, big.uid)).toBeNull();
    const c = put(s, 0, 'b_cobra');
    const shielded = put(s, 1, 'b_unicornio'); // escudo 1
    attack(s, c.uid, shielded.uid);
    expect(unitById(s, shielded.uid)).not.toBeNull();
    expect(shielded.shield).toBe(0);
  });

  it('Hiena: al recibir daño gana +2, pero pega lo de antes en ese golpe', () => {
    const s = arena();
    const a = put(s, 0, 'b_perro', { hp: 3 }); // ⚔️2 ❤3
    const h = put(s, 1, 'b_hiena'); // ⚔️2 ❤4
    attack(s, a.uid, h.uid);
    expect(a.hp).toBe(1); // le pegó 2, no 4
    expect(h.dmg.attack).toBe(4);
  });

  it('el Loro silencia: el Ternero deja de crecer', () => {
    const s = arena();
    const ternero = put(s, 1, 'b_ternero');
    const loro = summonUnit(s, 0, 'b_loro');
    expect(loro.name).toBe('Loro');
    ternero.silenced = true; // lo que hace «silencia» (el objetivo lo elige el jugador al resolver)
    endCombat(s);
    expect([ternero.dmg.attack, ternero.hp]).toEqual([1, 1]);
  });

  it('la Gallina pone un Pichón a su derecha al final de cada turno', () => {
    const s = arena();
    put(s, 1, 'b_conejo');
    put(s, 1, 'b_gallina');
    put(s, 1, 'b_perro');
    endCombat(s);
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_conejo', 'b_gallina', 'b_pichon', 'b_perro']);
  });

  it('último aliento: invoca fichas', () => {
    const s = arena();
    const a = put(s, 0, 'b_tigre');
    const osa = put(s, 1, 'b_osa');
    attack(s, a.uid, osa.uid);
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_osezno', 'b_osezno']);
  });
});

describe('lugar en la fila', () => {
  it('al elegir la carta se elige dónde entra', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    pick(s, 0, 1); // rata
    pick(s, 1, 1); // conejo
    endCombat(s);
    pick(s, 1, 0, 0); // B: el perro a la izquierda del conejo
    pick(s, 0, 0, 1); // A: el escorpión a la derecha de la rata
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_perro', 'b_conejo']);
    expect(s.players[0].board.map((u) => u.card)).toEqual(['b_rata', 'b_escorpion']);
    expect(() => pick(s, 0, 0, 5)).toThrow();
  });

  it('las de los costados: las dos de al lado', () => {
    const s = arena();
    const [a, b, c] = ['b_pollito', 'b_conejo', 'b_perro'].map((id) => put(s, 0, id));
    summonUnit(s, 0, 'b_lobo_alfa', true, 1); // entre el pollito y el conejo
    expect([a.dmg.attack, b.dmg.attack, c.dmg.attack]).toEqual([2, 2, 2]);
  });

  it('las de tu izquierda y las de tu derecha', () => {
    const s = arena();
    const [a, b, c] = ['b_pollito', 'b_conejo', 'b_perro'].map((id) => put(s, 0, id));
    summonUnit(s, 0, 'b_buho', true, 2); // izquierda: pollito y conejo; derecha: perro
    expect([a.hp, b.hp, c.hp]).toEqual([2, 4, 2]);
    expect([a.dmg.attack, b.dmg.attack, c.dmg.attack]).toEqual([1, 1, 3]);
  });

  it('las fichas de un Último aliento salen donde estaba la que murió', () => {
    const s = arena();
    put(s, 1, 'b_conejo');
    const pollito = put(s, 1, 'b_pollito');
    put(s, 1, 'b_perro');
    const a = put(s, 0, 'b_tigre');
    attack(s, a.uid, pollito.uid);
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_conejo', 'b_pichon', 'b_perro']);
  });

  it('la IA pone el Lobo Alfa entre dos', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    goTo(s, 4);
    put(s, 0, 'b_rata');
    put(s, 0, 'b_cocodrilo');
    expect(choosePlace(s, 0, 0)).toBe(1); // su aura les da +1 a las dos
    expect(choosePlace(s, 0, 1)).toBe(2); // sin efecto de posición: a la derecha
  });
});

describe('vida', () => {
  /** Un combate armado a mano: A ataca en el turno 3 con lo que haya puesto (ya no están recién llegadas). */
  function combat(config: Partial<Config> = {}): State {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], config });
    s.turn = 3;
    s.phase = 'combat';
    s.attacker = 0;
    return s;
  }
  const ready = (s: State, side: Side, id: string) => {
    const u = put(s, side, id);
    u.summonedTurn = 1;
    return u;
  };

  it('las que no atacan le pegan su daño a la vida del rival al terminar el turno', () => {
    const s = combat();
    const a = ready(s, 0, 'b_cocodrilo'); // ⚔️5
    ready(s, 0, 'b_leopardo'); // ⚔️4 🔪3: pega 7
    const d = ready(s, 1, 'b_conejo');
    attack(s, a.uid, d.uid);
    endCombat(s);
    expect(s.players[1].life).toBe(30 - 7);
    expect(s.players[0].life).toBe(30);
  });

  it('la recién llegada no le pega a la vida; con Carga, sí', () => {
    const s = combat();
    put(s, 0, 'b_cocodrilo'); // entró este turno
    put(s, 0, 'b_jabali'); // Carga ⚔️2
    endCombat(s);
    expect(s.players[1].life).toBe(28);
  });

  it('un Guardián frena los golpes a la vida', () => {
    const s = combat();
    ready(s, 0, 'b_cocodrilo');
    ready(s, 1, 'b_carnero'); // Guardián
    endCombat(s);
    expect(s.players[1].life).toBe(30);
  });

  it('con la opción de nivel, pega su nivel: los dos lobos le ganan a la rata', () => {
    const s = combat({ faceValue: 'rank' });
    ready(s, 0, 'b_rata'); // nivel 1, ⚔️2
    endCombat(s);
    expect(s.players[1].life).toBe(29);
    const t = combat({ faceValue: 'rank' });
    ready(t, 0, 'b_lobezno');
    ready(t, 0, 'b_cachorro');
    endCombat(t);
    expect(t.players[1].life).toBe(28);
  });

  it('el que llega a 0 pierde en el acto', () => {
    const s = combat({ startingLife: 5 });
    ready(s, 0, 'b_cocodrilo');
    endCombat(s);
    expect(s.phase).toBe('end');
    expect(s.result?.winner).toBe(0);
    expect(s.result?.early).toBe(true);
  });

  it('con la diferencia: el que tiene menos en la mesa pierde la diferencia cada turno', () => {
    const s = combat({ scoring: 'difference' });
    ready(s, 0, 'b_cocodrilo'); // 5
    ready(s, 1, 'b_conejo'); // 1
    endCombat(s);
    expect(s.players[1].life).toBe(26);
    expect(s.players[0].life).toBe(30);
  });

  it('después del T9 se sigue peleando, con cansancio, hasta que alguien llega a 0', () => {
    const s = combat();
    s.turn = 9;
    endCombat(s);
    expect(s.turn).toBe(10);
    expect(s.phase).toBe('combat');
    expect(s.players.map((p) => p.life)).toEqual([29, 29]);
    for (let k = 0; k < 20 && s.phase !== 'end'; k++) endCombat(s);
    expect(s.phase).toBe('end');
    expect(s.result?.winner).toBeNull(); // los dos sin cartas: llegan a 0 a la vez
  });
});

describe('héroes', () => {
  /**
   * Un combate armado a mano en el turno 3: A (con `h0`) ataca con `energy` de energía. Por defecto con
   * la regla que gasta toda (para probar los números con X); `config` la cambia.
   */
  function duel(h0: string, h1: string | null = null, energy = 2, config: Partial<Config> = { powerMode: 'all' }): State {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: [h0, h1], config });
    s.turn = 3;
    s.phase = 'combat';
    s.attacker = 0;
    s.players[0].energy = energy;
    return s;
  }
  const ready = (s: State, side: Side, id: string) => {
    const u = put(s, side, id);
    u.summonedTurn = 1;
    return u;
  };

  it('energía: 1 por turno a cada uno; el poder cuesta 2 y se usa en tu ataque', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['cazador', 'cazador'] });
    expect(s.players.map((p) => p.energy)).toEqual([1, 1]);
    pick(s, 0, 1);
    pick(s, 1, 1);
    expect(s.phase).toBe('combat');
    expect(canUsePower(s, 0)).toBe(false); // T1: 1 de energía
    endCombat(s);
    expect(s.players.map((p) => p.energy)).toEqual([2, 2]);
    pick(s, 0, 1);
    pick(s, 1, 1);
    expect(canUsePower(s, 0)).toBe(false); // no ataca A
    expect(canUsePower(s, 1)).toBe(true);
    expect(s.players[1].energy).toBe(2);
    usePower(s, 1);
    expect(s.players[0].life).toBe(30 - 3);
    expect(s.players[1].energy).toBe(0);
    expect(canUsePower(s, 1)).toBe(false); // ya no le alcanza
  });

  it('por defecto cuesta 2 y hace siempre lo mismo: con 5 de energía, el Mago lo usa dos veces', () => {
    const s = duel('mago', null, 5, {});
    usePower(s, 0, heroTarget(1));
    usePower(s, 0, heroTarget(1));
    expect(s.players[1].life).toBe(26);
    expect(s.players[0].energy).toBe(1);
    expect(canUsePower(s, 0)).toBe(false);
  });

  it('la Rata da 1 de energía al morir y el Perro al entrar', () => {
    const s = duel('mago', null, 0, {});
    const r = ready(s, 0, 'b_rata'); // ⚔️2 ❤1
    attack(s, r.uid, ready(s, 1, 'b_conejo').uid);
    expect(unitById(s, r.uid)).toBeNull();
    expect(s.players[0].energy).toBe(1);
    const t = duel('mago', null, 0, {});
    summonUnit(t, 0, 'b_perro');
    expect(t.players[0].energy).toBe(1);
  });

  it('con la regla que gasta toda, esperar lo hace más fuerte: con 4 de energía el Cazador pega 5', () => {
    const s = duel('cazador', null, 4);
    ready(s, 1, 'b_carnero'); // Guardián: al poder no lo frena
    usePower(s, 0);
    expect(s.players[1].life).toBe(25);
    expect(canUsePower(s, 0)).toBe(false); // quedó en 0
    s.players[0].energy = 2; // si una carta le da energía, lo vuelve a usar (sin límite por turno)
    usePower(s, 0);
    expect(s.players[1].life).toBe(22);
  });

  it('la energía llega hasta 10', () => {
    const s = duel('mago', null, 10);
    endCombat(s);
    expect(s.players[0].energy).toBe(10);
  });

  it('Mago: X de daño a una unidad enemiga o al rival', () => {
    const s = duel('mago', null, 3);
    const d = ready(s, 1, 'b_perro'); // ❤3
    expect(powerTargets(s, 0)).toEqual([d.uid, heroTarget(1)]);
    usePower(s, 0, d.uid);
    expect(unitById(s, d.uid)).toBeNull();
    const t = duel('mago', null, 2);
    usePower(t, 0, heroTarget(1));
    expect(t.players[1].life).toBe(28);
  });

  it('Sacerdote: cura X+1 a una tuya (sin tope) o a vos; en el panel, 2X o X', () => {
    const s = duel('sacerdote', null, 3);
    const u = ready(s, 0, 'b_cocodrilo'); // ❤4
    usePower(s, 0, u.uid);
    expect(u.hp).toBe(8);
    const t = duel('sacerdote', null, 2);
    usePower(t, 0, heroTarget(0));
    expect(t.players[0].life).toBe(33);
    for (const [priestHeal, life] of [['double', 34], ['x', 32]] as const) {
      const v = duel('sacerdote', null, 2);
      v.cfg.priestHeal = priestHeal;
      usePower(v, 0, heroTarget(0));
      expect(v.players[0].life).toBe(life);
    }
  });

  it('Guerrero: ganás X+1; Paladín: un Recluta X/X', () => {
    const s = duel('guerrero', null, 2);
    usePower(s, 0);
    expect(s.players[0].life).toBe(33);
    const t = duel('paladin', null, 3);
    usePower(t, 0);
    const r = t.players[0].board[0];
    expect([r.name, r.dmg.attack, r.hp]).toEqual(['Recluta', 3, 3]);
  });

  it('Pícaro: le pega X+1 a una enemiga (al Guardián primero) y recibe su daño; con la Envenenadora, la mata', () => {
    const s = duel('picaro', null, 2);
    const big = ready(s, 1, 'b_caballo'); // ⚔️6 ❤5
    const g = ready(s, 1, 'b_carnero'); // Guardián ⚔️3 ❤3
    expect(powerTargets(s, 0)).toEqual([g.uid]);
    usePower(s, 0, g.uid);
    expect(unitById(s, g.uid)).toBeNull();
    expect(s.players[0].life).toBe(27);
    const t = duel('picaro', null, 2);
    ready(t, 0, 'h_envenenadora');
    const b = ready(t, 1, 'b_caballo');
    usePower(t, 0, b.uid);
    expect(unitById(t, b.uid)).toBeNull();
    expect(t.players[0].life).toBe(24);
    expect(big.hp).toBe(5);
  });

  it('Chamán: los tótems salen en ronda, con X de vida; la Chamana invoca el próximo', () => {
    const s = duel('chaman', null, 3);
    usePower(s, 0);
    summonUnit(s, 0, 'h_chamana');
    const totems = s.players[0].board.filter((u) => u.card.startsWith('h_totem')).map((u) => [u.name, u.hp]);
    expect(totems).toEqual([['Tótem Abrasador', 3], ['Tótem de Piedra', 2]]);
  });

  it('Druida: ganás X y le pegás X−1 a una enemiga o al rival; la Dríade da 2 de energía', () => {
    const s = duel('druida', null, 3);
    const d = ready(s, 1, 'b_conejo'); // ⚔️1 ❤3
    usePower(s, 0, d.uid);
    expect(d.hp).toBe(1);
    expect(s.players[0].life).toBe(30 + 3 - 1);
    const t = duel('druida', null, 2);
    summonUnit(t, 0, 'h_driade');
    expect(t.players[0].energy).toBe(4);
  });

  it('Cazador de demonios: +X de daño hasta el fin del turno (también para pegarle a la vida)', () => {
    const s = duel('cazador_demonios', null, 2);
    const u = ready(s, 0, 'b_cocodrilo'); // ⚔️5
    usePower(s, 0, u.uid);
    expect(u.dmg.attack).toBe(7);
    endCombat(s);
    expect(s.players[1].life).toBe(23);
    expect(u.dmg.attack).toBe(5);
  });

  it('la Proscrita gana +1 y Carga solo si queda en una punta de la fila', () => {
    const s = duel('cazador_demonios');
    ready(s, 0, 'b_conejo');
    ready(s, 0, 'b_conejo');
    const edge = summonUnit(s, 0, 'h_proscrita', true, 0);
    const mid = summonUnit(s, 0, 'h_proscrita', true, 1);
    expect([edge.dmg.attack, edge.charge]).toEqual([4, true]);
    expect([mid.dmg.attack, mid.charge]).toEqual([3, false]);
  });

  it('Caballero de la muerte: un Necrófago X/1 con Carga que muere al terminar el turno; la Exhumadora gana energía con cada muerte', () => {
    const s = duel('caballero_muerte', null, 3);
    ready(s, 0, 'h_exhumadora');
    usePower(s, 0);
    const g = s.players[0].board.find((u) => u.name === 'Necrófago')!;
    expect([g.dmg.attack, g.hp, g.charge]).toEqual([3, 1, true]);
    expect(attackTargets(s, g.uid)).toEqual([]); // no hay enemigas: le pega a la vida
    endCombat(s);
    expect(s.players[1].life).toBe(30 - 3 - 3); // el Necrófago y la Exhumadora
    expect(s.players[0].board.some((u) => u.name === 'Necrófago')).toBe(false);
    expect(s.players[0].energy).toBe(2); // 1 por el Necrófago, 1 del turno nuevo
  });

  it('el Aprendiz suma 1 al poder; el Sabueso da energía al pegarle a la vida; la Clériga cura al usar el poder', () => {
    const s = duel('mago', null, 2);
    ready(s, 0, 'h_aprendiz');
    usePower(s, 0, heroTarget(1));
    expect(s.players[1].life).toBe(27);
    const t = duel('cazador', null, 0);
    ready(t, 0, 'h_sabueso');
    endCombat(t);
    expect(t.players[0].energy).toBe(2);
    const c = duel('sacerdote', null, 2);
    ready(c, 0, 'h_cleriga');
    const o = ready(c, 0, 'b_conejo');
    usePower(c, 0, heroTarget(0));
    expect(o.hp).toBe(4); // la Clériga: +1 a las otras
  });

  it('cada turno: dos cartas del mazo y la de la clase (sin héroe, solo las dos)', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['mago', null] });
    expect(options(s, 0)).toEqual([...DECKS.salvajes.turns[0], 'h_imagen_espejo']);
    expect(options(s, 1)).toEqual(DECKS.pradera.turns[0]);
    pick(s, 0, 2); // Imagen espejo: dos Reflejos 0/2 con Guardián
    pick(s, 1, 1);
    expect(s.players[0].board.map((u) => u.name)).toEqual(['Reflejo', 'Reflejo']);
    endCombat(s);
    expect(options(s, 0)).toEqual([...DECKS.salvajes.turns[1], 'h_aprendiz']);
    pick(s, 0, 2);
    pick(s, 1, 0);
    expect(s.players[0].board.some((u) => u.card === 'h_aprendiz')).toBe(true);
  });

  it('cada héroe tiene nueve cartas de clase, una por turno', () => {
    for (const h of Object.values(HEROES)) {
      expect(h.cards.map((id) => card(id).rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const id of h.cards) expect(card(id).hero).toBe(h.id);
    }
    // y los mazos, dos por turno y sin hechizos
    for (const d of Object.values(DECKS)) {
      expect(d.turns.every((ids) => ids.length === 2 && ids.every((id) => card(id).kind === 'unit' && !card(id).hero))).toBe(true);
    }
  });
});

describe('mecánicas de clase', () => {
  /** Un combate armado a mano en el turno 3: ataca A. */
  function fight3(): State {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    s.turn = 3;
    s.phase = 'combat';
    s.attacker = 0;
    return s;
  }
  const ready = (s: State, side: Side, id: string, at?: number) => {
    const u = summonUnit(s, side, id, false, at);
    u.summonedTurn = 1;
    return u;
  };

  it('aura: mientras está viva, las de los costados tienen el bonus; si muere la del medio, lo pierden', () => {
    const s = fight3();
    const a = ready(s, 1, 'b_conejo'); // ⚔️1 ❤3
    const pavo = ready(s, 1, 'b_pavo'); // las de los costados +0/+1
    const b = ready(s, 1, 'b_conejo');
    expect([a.hp, b.hp]).toEqual([4, 4]);
    const lobo = ready(s, 0, 'b_lobo_alfa'); // las de los costados +1 de daño
    const croc = ready(s, 0, 'b_cocodrilo');
    expect(croc.dmg.attack).toBe(6);
    attack(s, croc.uid, pavo.uid); // el cocodrilo mata al pavo
    expect(unitById(s, pavo.uid)).toBeNull();
    expect([a.hp, a.maxHp, b.hp]).toEqual([3, 3, 3]);
    expect(lobo.dmg.attack).toBe(3);
  });

  it('aura: perderla saca la vida que daba, aunque estuviera herida (no la cura), pero no la mata', () => {
    const t = fight3();
    const x = ready(t, 1, 'b_conejo'); // ❤3
    x.hp -= 1; // como con el Murciélago: 2 de 3
    const p2 = ready(t, 1, 'b_pavo');
    const y = ready(t, 1, 'b_conejo');
    expect([x.hp, x.maxHp]).toEqual([3, 4]);
    y.hp -= 3; // 4 → 1
    p2.hp = 0;
    attack(t, ready(t, 0, 'b_cocodrilo').uid, x.uid); // el cocodrilo pega 5: mata a x y saca al pavo
    expect(unitById(t, p2.uid)).toBeNull();
    expect([y.hp, y.maxHp]).toEqual([1, 3]); // pierde lo del aura sin morir
    const u = fight3();
    const z = ready(u, 1, 'b_conejo');
    z.hp -= 1;
    const p3 = ready(u, 1, 'b_pavo');
    p3.hp = 0;
    attack(u, ready(u, 0, 'b_lobo').uid, ready(u, 1, 'b_conejo', 0).uid); // cualquier cosa que saque muertos
    expect(unitById(u, p3.uid)).toBeNull();
    expect([z.hp, z.maxHp]).toEqual([2, 3]); // vuelve a como estaba antes del pavo
  });

  it('congelar: no ataca ni le pega a la vida en el próximo combate de su dueño', () => {
    const s = fight3();
    const u = ready(s, 0, 'b_cocodrilo');
    ready(s, 1, 'b_conejo');
    u.frozen = true;
    expect(attackTargets(s, u.uid)).toEqual([]);
    endCombat(s);
    expect(s.players[1].life).toBe(30); // no le pegó a la vida
    expect(u.frozen).toBe(false); // y se descongeló
  });

  it('Rayo de escarcha: 4 de daño y congela', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['mago', null] });
    goTo(s, 3);
    const d = ready(s, 1, 'b_caballo'); // ❤5
    pick(s, 1, 1); // Carnero (el Pavo, con su aura, le daría vida)
    pick(s, 0, 2); // Rayo de escarcha
    chooseTarget(s, 0, d.uid);
    expect([d.hp, d.frozen]).toEqual([1, true]);
  });

  it('Robo de vida: lo que pega peleando y a la vida le cura a su dueño', () => {
    const s = fight3();
    s.players[0].life = 20;
    const a = ready(s, 0, 'h_cazador_almas'); // ⚔️3 Robo de vida
    const d = ready(s, 1, 'b_conejo'); // ❤3
    attack(s, a.uid, d.uid);
    expect(s.players[0].life).toBe(23);
    const t = fight3();
    t.players[0].life = 20;
    ready(t, 0, 'h_angel'); // ⚔️5 Robo de vida
    endCombat(t);
    expect(t.players[0].life).toBe(25);
    expect(t.players[1].life).toBe(25);
  });

  it('Embestida: ataca unidades el turno en que entra, pero ese turno no le pega a la vida', () => {
    const s = fight3();
    const r = summonUnit(s, 0, 'h_hachera', false); // entra ahora
    const d = ready(s, 1, 'b_conejo');
    expect(attackTargets(s, r.uid)).toEqual([d.uid]);
    const t = fight3();
    summonUnit(t, 0, 'h_hachera', false);
    endCombat(t);
    expect(t.players[1].life).toBe(30);
  });

  it('Sigilo: no se la puede atacar ni elegir hasta que ataca', () => {
    const s = fight3();
    const a = ready(s, 0, 'b_cocodrilo');
    const hidden = ready(s, 1, 'h_bandida');
    const seen = ready(s, 1, 'b_conejo');
    expect(attackTargets(s, a.uid)).toEqual([seen.uid]);
    // y cuando ataca, se ve
    s.attacker = 1;
    attack(s, hidden.uid, a.uid);
    expect(hidden.stealth).toBe(false);
  });

  it('Ejecutar destruye a una herida y a una sana le hace 3', () => {
    const play = (wounded: boolean) => {
      const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['guerrero', 'picaro'] });
      goTo(s, 2);
      const hurt = ready(s, 1, 'b_caballo');
      hurt.hp = 3;
      const fine = ready(s, 1, 'b_bufalo');
      pick(s, 0, 2); // Ejecutar
      pick(s, 1, 1);
      expect(s.pending?.options).toEqual(expect.arrayContaining([hurt.uid, fine.uid]));
      chooseTarget(s, 0, wounded ? hurt.uid : fine.uid);
      return { s, hurt, fine };
    };
    const a = play(true);
    expect(unitById(a.s, a.hurt.uid)).toBeNull();
    expect(a.fine.hp).toBe(7);
    const b = play(false);
    expect(b.fine.hp).toBe(4);
    expect(b.hurt.hp).toBe(3);
  });

  it('el Espíritu divino duplica la vida de otra tuya; Control mental hace tuya a una herida', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['sacerdote', null] });
    goTo(s, 3);
    const mine = ready(s, 0, 'b_conejo'); // ❤3
    pick(s, 0, 2);
    pick(s, 1, 0);
    chooseTarget(s, 0, mine.uid);
    expect([mine.hp, mine.maxHp]).toEqual([6, 6]);
    const t = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['sacerdote', null] });
    goTo(t, 9);
    const big = ready(t, 1, 'b_mamut');
    big.hp -= 2;
    ready(t, 1, 'b_caballo'); // sin heridas: no se puede elegir
    pick(t, 0, 2); // Control mental
    pick(t, 1, 0);
    expect(t.pending?.options).toEqual([big.uid]);
    chooseTarget(t, 0, big.uid);
    expect(t.players[0].board.map((u) => u.card)).toContain('b_mamut');
    expect(big.owner).toBe(0);
    expect(attackTargets(t, big.uid)).toEqual([]); // entra recién llegada
  });

  it('Soltar a los perros: un Perro de caza con Carga por cada unidad enemiga', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], heroes: ['cazador', null] });
    goTo(s, 6);
    for (const id of ['b_conejo', 'b_conejo', 'b_pavo']) ready(s, 1, id);
    pick(s, 1, 0); // B juega una más: Búfalo
    pick(s, 0, 2);
    expect(s.players[0].board.filter((u) => u.name === 'Perro de caza')).toHaveLength(4);
  });
});

describe('ritmo', () => {
  it('por defecto la que entra no ataca ese turno, salvo con Carga', () => {
    expect(DEFAULT_CONFIG.summonSick).toBe(true);
    const s = arena({ summonSick: true });
    const a = put(s, 0, 'b_cocodrilo');
    const charge = put(s, 0, 'b_jabali');
    put(s, 1, 'b_pollito');
    expect(attackTargets(s, a.uid)).toEqual([]);
    expect(attackTargets(s, charge.uid)).toHaveLength(1);
    a.summonedTurn = 0;
    expect(attackTargets(s, a.uid)).toHaveLength(1);
  });

  it('por defecto atacan todas; con la regla de 1 ataque, una sola por turno', () => {
    expect(DEFAULT_CONFIG.maxAttacks).toBe(0);
    const s = arena({ maxAttacks: 1 });
    const a = put(s, 0, 'b_tigre');
    const b = put(s, 0, 'b_leon');
    const d = put(s, 1, 'b_pollito');
    put(s, 1, 'b_conejo');
    attack(s, a.uid, d.uid);
    expect(attackTargets(s, b.uid)).toEqual([]);
  });

  it('el historial guarda qué jugó cada uno, los ataques y cómo quedó la mesa', () => {
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'], config: { summonSick: false } });
    pick(s, 0, 1); // rata ⚔️2 ❤1
    pick(s, 1, 1); // conejo ⚔️1 ❤3
    const [a] = s.players[0].board, [d] = s.players[1].board;
    attack(s, a.uid, d.uid);
    endCombat(s);
    const r = s.record[0];
    expect(r.plays).toEqual([['b_rata'], ['b_conejo']]);
    expect(r.attacks).toHaveLength(1);
    expect(r.attacks[0]).toMatchObject({ aHp: null, dHp: 1 }); // muere la rata, el conejo queda en 1
    expect(r.units).toEqual([0, 1]);
    expect(s.record[1].turn).toBe(2);
  });
});

describe('pelea por fases', () => {
  it('la lanza pega antes: si mata, el otro no llega a pegar', () => {
    const s = arena();
    const a = put(s, 0, 'lobezno', { hp: 3 }, { axe: 3 });
    const d = put(s, 1, 'erizo', { hp: 2 }, { spear: 3 });
    attack(s, a.uid, d.uid);
    expect(unitById(s, a.uid)).toBeNull();
    expect(d.hp).toBe(2);
  });

  it('en el triángulo, el que gana pega primero', () => {
    const s = arena();
    const a = put(s, 0, 'lobezno', { hp: 3 }, { axe: 3 });
    const d = put(s, 1, 'castor', { hp: 2 }, { mace: 5 });
    attack(s, a.uid, d.uid);
    expect(unitById(s, d.uid)).toBeNull();
    expect(a.hp).toBe(3);
  });

  it('si ninguno muere, el orden da lo mismo', () => {
    const s = arena();
    const a = put(s, 0, 'lobezno', { hp: 5 }, { axe: 1 });
    const d = put(s, 1, 'castor', { hp: 5 }, { mace: 1 });
    attack(s, a.uid, d.uid);
    expect([a.hp, d.hp]).toEqual([4, 4]);
  });

  it('el escudo frena los golpes menores; uno igual lo rompe y se pierde; el siguiente entra', () => {
    const s = arena();
    const a = put(s, 0, 'erizo', { hp: 9 }, { spear: 1, sword: 2, knife: 3 });
    const d = put(s, 1, 'armadillo', { hp: 5, shield: 2, armor: 0 }, {});
    attack(s, a.uid, d.uid);
    // lanza 1: frenada; espada 2: rompe el escudo y se pierde; cuchillo 3: entra
    expect(d.shield).toBe(0);
    expect(d.hp).toBe(2);
  });

  it('escudo 1 es el escudo divino: el primer golpe lo rompe', () => {
    const s = arena();
    const a = put(s, 0, 'erizo', { hp: 9 }, { spear: 1, knife: 1 });
    const d = put(s, 1, 'zorro_picaro', { hp: 2, shield: 1 }, {});
    attack(s, a.uid, d.uid);
    expect(d.shield).toBe(0);
    expect(d.hp).toBe(1);
  });

  it('la armadura resta en los golpes que entran', () => {
    const s = arena();
    const a = put(s, 0, 'erizo', { hp: 9 }, { spear: 2, knife: 4 });
    const d = put(s, 1, 'armadillo', { hp: 9, shield: 2, armor: 1 }, {});
    attack(s, a.uid, d.uid);
    // lanza 2: rompe el escudo y se pierde; cuchillo 4 − 1
    expect(d.hp).toBe(6);
  });

  it('las tres reglas del golpe que rompe el escudo', () => {
    const want = { absorb: 5, full: 2, mitigated: 4 } as const;
    for (const rule of ['absorb', 'full', 'mitigated'] as const) {
      const s = arena({ shieldBreak: rule });
      const a = put(s, 0, 'jabali', { hp: 9 }, { axe: 3 });
      const d = put(s, 1, 'armadillo', { hp: 5, shield: 2, armor: 0 }, {});
      attack(s, a.uid, d.uid);
      expect(d.shield).toBe(0);
      expect(d.hp).toBe(want[rule]);
    }
  });

  it('«tras el combate: recupera escudo» lo devuelve si peleó y sobrevivió, sin acumular', () => {
    const s = arena();
    const a = put(s, 0, 'lobezno', { hp: 9 }, { axe: 1 });
    const d = put(s, 1, 'comadreja', { hp: 3 }, { knife: 1 }); // escudo 1, lo recupera tras el combate
    attack(s, a.uid, d.uid);
    expect(d.shield).toBe(0);
    endCombat(s);
    expect(d.shield).toBe(1);
  });

  it('con arco ataca de lejos: el que defiende cuerpo a cuerpo no responde', () => {
    const s = arena();
    const a = put(s, 0, 'halcon', { hp: 1 }, { bow: 1 });
    const d = put(s, 1, 'castor', { hp: 3 }, { spear: 5, mace: 5 });
    attack(s, a.uid, d.uid);
    expect(a.hp).toBe(1);
    expect(d.hp).toBe(2);
  });

  it('un arquero con maza ataca solo con el arco y defiende con la maza', () => {
    const s = arena();
    const archer = put(s, 0, 'halcon', { hp: 3 }, { bow: 1, mace: 4 });
    const d = put(s, 1, 'castor', { hp: 5 }, { mace: 2 });
    attack(s, archer.uid, d.uid);
    expect(d.hp).toBe(4); // solo la flecha
    expect(archer.hp).toBe(3); // sin respuesta
    // ahora lo atacan cuerpo a cuerpo: maza contra maza, a la vez
    s.attacker = 1;
    d.energy = 1;
    attack(s, d.uid, archer.uid);
    expect(archer.hp).toBe(1);
    expect(unitById(s, d.uid)).toBeNull(); // la maza del arquero (4) lo mata
  });

  it('si al arquero lo atacan con arco, se defiende con su arco: se disparan a la vez', () => {
    const s = arena();
    const a = put(s, 0, 'halcon', { hp: 2 }, { bow: 2 });
    const d = put(s, 1, 'buho_sabio', { hp: 2 }, { bow: 2, mace: 5 });
    attack(s, a.uid, d.uid);
    expect(unitById(s, a.uid)).toBeNull();
    expect(unitById(s, d.uid)).toBeNull();
  });

  it('contra un ataque cuerpo a cuerpo, el arco no pega', () => {
    const s = arena();
    const a = put(s, 0, 'lobezno', { hp: 2 }, { axe: 2 });
    const d = put(s, 1, 'buho_sabio', { hp: 2 }, { bow: 3 });
    attack(s, a.uid, d.uid);
    expect(unitById(s, d.uid)).toBeNull();
    expect(a.hp).toBe(2);
  });

  it('hay que atacar primero a los guardianes', () => {
    const s = arena();
    const a = put(s, 0, 'jabali');
    put(s, 1, 'castor');
    const g = put(s, 1, 'oso_guardian');
    expect(attackTargets(s, a.uid)).toEqual([g.uid]);
  });

  it('aguante: queda en 1, dispara su efecto y devuelve el golpe', () => {
    const s = arena();
    const a = put(s, 0, 'fenrir'); // 🪓8 🔪3 ❤10
    const d = put(s, 1, 'gorila'); // 🔨7 ❤7, aguante: 3 a todas las enemigas
    attack(s, a.uid, d.uid);
    // el hacha le gana a la maza: 8 al gorila, queda en 1, le pega 3 a Fenrir y la maza 7 lo mata
    expect(d.hp).toBe(1);
    expect(unitById(s, a.uid)).toBeNull();
  });

  it('último aliento: se dispara al morir, peleando o no', () => {
    const s = arena();
    const a = put(s, 0, 'jabali', { hp: 9 }, { axe: 5 });
    const castor = put(s, 1, 'castor'); // último aliento: tus otras unidades +1 de vida
    const friend = put(s, 1, 'erizo');
    s.players[1].board = [friend, castor];
    attack(s, a.uid, castor.uid);
    expect(unitById(s, castor.uid)).toBeNull();
    expect(friend.hp).toBe(friend.maxHp);
    expect(friend.maxHp).toBe(3);
  });

  it('curar es ganar vida: puede pasar de la que tenía', () => {
    const s = arena();
    const u = put(s, 0, 'castor'); // ❤2
    u.hp = 1;
    s.attacker = 0;
    s.phase = 'pick';
    s.turn = 6;
    deal(s, 0, ['savia', 'savia', 'savia']); // +4 de vida a tus unidades y a vos
    s.picks = [null, null];
    pick(s, 0, 0);
    pick(s, 1, 0);
    expect(u.hp).toBe(5);
    expect(s.players[0].life).toBe(34);
  });

  it('desterrar no dispara efectos de muerte', () => {
    const s = arena();
    const h = put(s, 0, 'huargo'); // al caer en combate: 3 al que más pega
    const enemy = put(s, 1, 'oso_pardo');
    s.attacker = 1;
    s.phase = 'target';
    s.pending = { player: 1, card: 'buho_archimago', source: null, options: [h.uid] };
    s.queue = [{ side: 1, id: 'buho_archimago', unit: null }];
    s.chosen = [null, null];
    chooseTarget(s, 1, h.uid);
    expect(unitById(s, h.uid)).toBeNull();
    expect(enemy.hp).toBe(3);
  });
});

describe('turno', () => {
  it('la elección es simultánea por defecto: cualquiera elige primero y se resuelve al elegir los dos', () => {
    expect(DEFAULT_CONFIG.pickMode).toBe('simultaneous');
    const s = newGame({ decks: [DECKS.salvajes, DECKS.pradera], names: ['A', 'B'] });
    pick(s, 1, 1);
    expect(s.phase).toBe('pick');
    expect(s.players[1].board).toHaveLength(0);
    pick(s, 0, 1);
    expect(s.phase).toBe('combat');
    expect(s.players[0].board.map((u) => u.card)).toEqual(['b_rata']);
    expect(s.players[1].board.map((u) => u.card)).toEqual(['b_conejo']);
  });

  it('secuencial: el atacante elige primero y nada se resuelve hasta que elige el defensor', () => {
    const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'], config: { pickMode: 'sequential' } });
    expect(() => pick(s, 1, 0)).toThrow();
    pick(s, 0, 1);
    expect(s.players[0].board).toHaveLength(0);
    pick(s, 1, 0);
    expect(s.phase).toBe('combat');
    expect(s.players[0].board.map((u) => u.card)).toEqual(['lobezno']);
  });

  it('un objetivo a elección hace esperar al dueño de la carta', () => {
    const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'], config: { extraRounds: 0, pickMode: 'sequential' } });
    pick(s, 0, 0);
    pick(s, 1, 2);
    endCombat(s);
    // T2: ataca B. A juega el halcón (1 a una enemiga a elección)
    pick(s, 1, 0);
    pick(s, 0, 1);
    expect(s.phase).toBe('target');
    expect(s.pending?.player).toBe(0);
    const castor = s.players[1].board.find((u) => u.card === 'castor')!;
    chooseTarget(s, 0, castor.uid);
    expect(castor.hp).toBe(1);
    expect(s.phase).toBe('combat');
  });

  it('la carta rápida se resuelve primero aunque sea del defensor', () => {
    const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'] });
    s.turn = 2;
    s.attacker = 0;
    deal(s, 0, ['rata']);
    deal(s, 1, ['buho_sabio']); // rápido
    s.picks = [{ cards: [0], places: [0] }, { cards: [0], places: [0] }];
    expect(resolveOrder(s)).toEqual([1, 0]);
  });

  it('el escudo renovable vuelve a su valor al empezar cada turno', () => {
    const s = arena({ shieldRenews: true });
    const u = put(s, 1, 'tortuga_dragon');
    const full = u.maxShield;
    u.shield = 0;
    endCombat(s);
    expect(full).toBeGreaterThan(0);
    expect(u.shield).toBe(full);
  });

  it('con la regla vieja: después del T9 hay rondas sin cartas y al final cada unidad pega su rango a la vida', () => {
    const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'], config: { scoring: 'final', extraRounds: 1, startingLife: 30 } });
    s.turn = 9;
    s.phase = 'combat';
    put(s, 0, 'fenrir');
    put(s, 1, 'erizo');
    endCombat(s);
    expect(s.turn).toBe(10);
    expect(s.phase).toBe('combat');
    expect(s.picks).toEqual([null, null]);
    endCombat(s);
    expect(s.phase).toBe('end');
    expect(s.result?.finalDamage).toEqual([9, 1]);
    expect(s.result?.life).toEqual([29, 21]);
    expect(s.result?.winner).toBe(0);
  });

  it('evoluciona si sigue viva al inicio de su turno', () => {
    const s = newGame({ decks: [OLD_DECKS.manada, OLD_DECKS.muralla], names: ['A', 'B'] });
    s.phase = 'combat';
    s.turn = 3;
    const u = put(s, 0, 'cachorro');
    endCombat(s);
    expect(u.name).toBe('Lobo Joven');
    expect(u.rank).toBe(4);
    expect(u.dmg.sword).toBe(4);
  });
});
