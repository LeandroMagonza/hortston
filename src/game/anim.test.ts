import { describe, expect, it } from 'vitest';
import { Anim } from './anim';

const P = { x: 0, y: 0 };
const consume = (a: Anim, events: Parameters<Anim['consume']>[0]) => a.consume(events, () => P, () => P, P, () => P);

describe('los números cambian cuando se anima el golpe', () => {
  it('la vida del jugador baja cuando la carta llega, una por una', () => {
    const a = new Anim();
    a.tick(1000);
    expect(a.shown('life0', 30)).toBe(30); // lo que se veía
    consume(a, [
      { kind: 'face', uid: 1, side: 0, amount: 3 },
      { kind: 'face', uid: 2, side: 0, amount: 2 },
    ]);
    expect(a.shown('life0', 25)).toBe(30); // el motor ya restó todo, pero todavía no llegó ninguna
    a.tick(1200);
    expect(a.shown('life0', 25)).toBe(27); // llegó la primera
    a.tick(2000);
    expect(a.shown('life0', 25)).toBe(25);
  });

  it('la vida de una unidad baja con el daño, y una que muere se va con el número de antes hasta el golpe', () => {
    const a = new Anim();
    a.tick(1000);
    a.shown('hp7', 5);
    consume(a, [{ kind: 'attack', a: 3, d: 7 }, { kind: 'damage', uid: 7, amount: 2, blocked: false, weapon: 'attack' }]);
    expect(a.shown('hp7', 3)).toBe(5); // embistiendo
    a.tick(1300);
    expect(a.shown('hp7', 3)).toBe(3);
  });

  it('una que entra y recibe daño en la misma jugada arranca desde su vida de antes del golpe', () => {
    const a = new Anim();
    a.tick(1000);
    consume(a, [{ kind: 'summon', uid: 9, owner: 0 }, { kind: 'damage', uid: 9, amount: 1, blocked: false, weapon: null }]);
    expect(a.shown('hp9', 2)).toBe(3);
    a.tick(3000);
    expect(a.shown('hp9', 2)).toBe(2);
  });
});
