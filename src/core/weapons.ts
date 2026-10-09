// Las armas y el orden en que pegan. Cada unidad tiene un valor por arma (0 si no la tiene) y una pelea
// va por fases, de arriba hacia abajo como están en la carta:
//
// - Arco: es para atacar. Una unidad con arco ataca únicamente con el arco, de lejos: solo le responde
//   otro arquero (con su arco, a la vez). Sus otras armas son para defenderse cuerpo a cuerpo; contra
//   un ataque cuerpo a cuerpo, el arco no pega.
// Sin arco, la pelea es cuerpo a cuerpo y va por fases:
// 1. Lanza: las dos a la vez.
// 2. Arma principal. El ataque simple pega a la vez que el otro. Entre armas del triángulo, espada le
//    gana a hacha, hacha a maza y maza a espada: si uno le gana al otro, pega primero; si no, a la vez.
// 3. Cuchillo: los dos a la vez, al final.
//
// En los mazos del juego casi todas las cartas tienen solo el ataque simple: los dos se pegan a la vez,
// como en Hearthstone. La lanza y el cuchillo aparecen en algunas. El arco y el triángulo quedaron en
// las cartas del primer prototipo.
//
// Cada fase es un golpe aparte (el escudo frena los golpes chicos y la armadura resta en cada uno). Una
// unidad que muere en una fase no llega a pegar en las siguientes. Pegar primero solo importa si ese golpe
// mata: si los dos sobreviven, da lo mismo que a la vez.
import type { Damage, Triad, Weapon } from './types';

export interface WeaponInfo {
  name: string;
  icon: string;
  color: string;
  hint: string;
}

export const WEAPONS: Record<Weapon, WeaponInfo> = {
  bow: { name: 'Arco', icon: '🏹', color: '#4fae5a', hint: 'Para atacar: ataca solo con el arco, de lejos, y solo le responde otro arquero. Sus otras armas son para defenderse cuerpo a cuerpo.' },
  spear: { name: 'Lanza', icon: '🔱', color: '#4f78d0', hint: 'Pega primero (las dos lanzas a la vez).' },
  attack: { name: 'Ataque', icon: '⚔️', color: '#d99a2b', hint: 'Pega a la vez que el otro: los dos se hacen daño.' },
  sword: { name: 'Espada', icon: '🗡️', color: '#8f9cb0', hint: 'Le gana al hacha (pega antes); la maza le gana a ella.' },
  axe: { name: 'Hacha', icon: '🪓', color: '#d0703c', hint: 'Le gana a la maza (pega antes); la espada le gana a ella.' },
  mace: { name: 'Maza', icon: '🔨', color: '#a07446', hint: 'Le gana a la espada (pega antes); el hacha le gana a ella.' },
  knife: { name: 'Cuchillo', icon: '🔪', color: '#9157b8', hint: 'Pega último (los dos cuchillos a la vez).' },
};

/** El orden de las casillas en la carta, que es el orden en que pegan. */
export const WEAPON_ORDER: Weapon[] = ['bow', 'spear', 'attack', 'sword', 'axe', 'mace', 'knife'];
export const TRIAD: Triad[] = ['sword', 'axe', 'mace'];
/** Las que van en la casilla del medio: a lo sumo una por carta. */
export const MAIN: Weapon[] = ['attack', ...TRIAD];

/** El triángulo: la clave le gana al valor. */
export const BEATS: Record<Triad, Triad> = { sword: 'axe', axe: 'mace', mace: 'sword' };

export function emptyDamage(): Damage {
  return { bow: 0, spear: 0, attack: 0, sword: 0, axe: 0, mace: 0, knife: 0 };
}

/** El arma del triángulo que tiene (con valor), o null. */
export function triadOf(d: Damage): Triad | null {
  return TRIAD.find((w) => d[w] > 0) ?? null;
}

export function totalDamage(d: Damage): number {
  return d.bow + d.spear + d.attack + d.sword + d.axe + d.mace + d.knife;
}

/** Quién pega primero en la fase del triángulo cuando `a` ataca a `d`. */
export function triadOrder(a: Triad | null, d: Triad | null): 'attacker' | 'defender' | 'both' {
  if (a && d && BEATS[a] === d) return 'attacker';
  if (a && d && BEATS[d] === a) return 'defender';
  return 'both';
}
