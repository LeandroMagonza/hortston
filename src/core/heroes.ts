// Los héroes: cada uno tiene un poder copiado de Hearthstone (menos el Brujo, que roba cartas y acá no
// hay mazo para robar) y nueve cartas de clase, una por turno.
//
// El poder (por defecto) cuesta 1 del maná del turno, el mismo con que se juegan las cartas, y se usa una
// vez en tu turno de ataque: o jugás la carta del turno, o una más chica y el poder. Hace siempre lo
// mismo: X = 1 (los números de Hearthstone), más lo que sumen las cartas como el Aprendiz. Las cartas
// «de energía» dan maná para tu turno siguiente. En el panel quedan las reglas de antes, con energía
// aparte que se junta 1 por turno: el poder cuesta 2 (X = 2), o gasta toda y X es lo que gastaste. Los
// poderes que van a un solo lado (el Cazador, solo a la vida del rival; el Guerrero, solo a la tuya)
// hacen 1 más, y curar también (en una carrera a 0, 1 de vida vale menos que 1 de daño; 2X y X quedan
// en el panel para comparar).
//
// En cada turno tenés tres opciones: dos de tu mazo (iguales para cualquier héroe) y la de tu clase de ese
// turno. Los hechizos son todos de clase. Cada clase juega con su mecánica: el daño de poder y Congelar
// del Mago, las bestias y la cara del Cazador, la curación del Sacerdote, el enojo y la armadura del
// Guerrero, el Escudo y los Reclutas del Paladín, el Sigilo y los cuchillos del Pícaro, los tótems y las
// auras del Chamán, la energía del Druida, las puntas de la fila (Marginado) y el Robo de vida del
// Cazador de demonios, y las muertes y el Aguante del Caballero de la muerte.
import { card, unitCard } from './cards';
import type { Config } from './types';

export type PowerKind =
  | 'fireblast' | 'heal' | 'steadyShot' | 'armor' | 'reinforce'
  | 'dagger' | 'totem' | 'shapeshift' | 'claws' | 'ghoul';

/**
 * A quién apunta el poder:
 * - `none`: no se elige.
 * - `enemy`: una unidad enemiga o el rival (los poderes a distancia no miran el Guardián).
 * - `ally`: una unidad tuya o vos.
 * - `allyUnit`: una unidad tuya.
 * - `strike`: tu héroe ataca a una unidad enemiga (al Guardián primero) y recibe su daño.
 * - `strikeOrFace`: lo mismo, o al rival si no tiene Guardián.
 */
export type PowerAim = 'none' | 'enemy' | 'ally' | 'allyUnit' | 'strike' | 'strikeOrFace';

export interface Hero {
  id: string;
  name: string;
  art: string;
  /** La identidad de la clase en una línea, para el menú. */
  blurb: string;
  power: { name: string; art: string; kind: PowerKind; aim: PowerAim };
  /** Las cartas de clase, una por turno (del 1 al 9). */
  cards: string[];
}

export const POWER_MIN = 2;
export const ENERGY_MAX = 10;

/** Lo que cuesta el poder: 1 de maná, o 2 de energía con las reglas de antes. */
export function powerCost(cfg: Pick<Config, 'powerMode'>): number {
  return cfg.powerMode === 'mana' ? 1 : POWER_MIN;
}

/** Los tótems del Chamán, en el orden en que salen (en Hearthstone salen al azar). */
export const TOTEMS = ['h_totem_abrasador', 'h_totem_piedra', 'h_totem_sanador', 'h_totem_viento'];

const LIST: Hero[] = [
  {
    id: 'mago', name: 'Mago', art: '🔮', blurb: 'Hechizos de daño, Congelar y Poder +N.',
    power: { name: 'Explosión de fuego', art: '🔥', kind: 'fireblast', aim: 'enemy' },
    cards: ['h_imagen_espejo', 'h_aprendiz', 'h_rayo_escarcha', 'h_elemental_agua', 'h_bola_fuego', 'b_incendio', 'h_archimaga', 'h_meteoro', 'h_dragona_arcana'],
  },
  {
    id: 'cazador', name: 'Cazador', art: '🏹', blurb: 'Bestias, Carga y a la cara (el poder pasa por encima del Guardián).',
    power: { name: 'Disparo firme', art: '🎯', kind: 'steadyShot', aim: 'none' },
    cards: ['b_avispa', 'h_sabueso', 'h_carronero', 'b_halcon', 'h_leona', 'h_soltar_perros', 'h_huargo', 'b_aguila', 'h_quimera'],
  },
  {
    id: 'sacerdote', name: 'Sacerdote', art: '📿', blurb: 'Curar (sin tope), duplicar vida y tomar el control de una enemiga.',
    power: { name: 'Curación menor', art: '✨', kind: 'heal', aim: 'ally' },
    cards: ['h_novicia', 'h_cleriga', 'h_espiritu_divino', 'h_sanadora', 'h_nova_sagrada', 'h_angel', 'b_vaca', 'h_profeta', 'h_control_mental'],
  },
  {
    id: 'guerrero', name: 'Guerrero', art: '💪', blurb: 'Se enoja al recibir daño, Embestida, Guardián y armadura.',
    power: { name: '¡Armadura!', art: '🛡️', kind: 'armor', aim: 'none' },
    cards: ['h_berserker', 'h_ejecutar', 'h_herrera', 'h_escudero', 'h_hachera', 'h_senor_guerra', 'h_espadachin', 'h_grito_infernal', 'h_coloso'],
  },
  {
    id: 'paladin', name: 'Paladín', art: '⚜️', blurb: 'Escudo, Reclutas y bendiciones.',
    power: { name: 'Refuerzos', art: '📯', kind: 'reinforce', aim: 'none' },
    cards: ['h_escudero_argenteo', 'h_protectora', 'h_bendicion_reyes', 'h_llamado_armas', 'h_consagracion', 'h_caballero_argenteo', 'h_guardiana_luz', 'b_unicornio', 'h_senor_luz'],
  },
  {
    id: 'picaro', name: 'Pícaro', art: '🎭', blurb: 'Sigilo y cuchillos: elige cuándo pegar; Veneno y sacar unidades. Su héroe pelea con una daga.',
    power: { name: 'Maestría con dagas', art: '🗡️', kind: 'dagger', aim: 'strike' },
    cards: ['h_punalada', 'h_bandida', 'h_envenenadora', 'h_espia', 'b_cobra', 'h_asesinar', 'h_maestra_dagas', 'h_asesina_noche', 'h_sombra'],
  },
  {
    id: 'chaman', name: 'Chamán', art: '🌩️', blurb: 'Tótems (en ronda), auras, rayos y elementales.',
    power: { name: 'Llamada totémica', art: '🗿', kind: 'totem', aim: 'none' },
    cards: ['h_descarga_escarcha', 'h_totem_lengua', 'h_chamana', 'h_cadena_relampagos', 'h_lobos_espectrales', 'h_elemental_fuego', 'h_elemental_tierra', 'h_tormenta', 'b_erupcion'],
  },
  {
    id: 'druida', name: 'Druida', art: '🌿', blurb: 'Energía, crías que crecen, bestias grandes y refuerzos a todas.',
    power: { name: 'Cambio de forma', art: '🐾', kind: 'shapeshift', aim: 'strikeOrFace' },
    cards: ['b_ternero', 'h_driade', 'b_zarpazo', 'h_ent_joven', 'b_primavera', 'h_ancestro', 'b_oso', 'h_fuerza_naturaleza', 'b_estampida'],
  },
  {
    id: 'cazador_demonios', name: 'Cazador de demonios', art: '👿', blurb: 'Las puntas de la fila, Embestida y Robo de vida.',
    power: { name: 'Garras demoníacas', art: '💥', kind: 'claws', aim: 'allyUnit' },
    cards: ['h_diablillo', 'h_golpe_vil', 'h_proscrita', 'h_cazador_almas', 'h_mastin_vil', 'h_rayo_ocular', 'h_demonio_abismo', 'h_senor_demoniaco', 'h_gran_cazador'],
  },
  {
    id: 'caballero_muerte', name: 'Caballero de la muerte', art: '💀', blurb: 'Las muertes dan energía; Aguante, Congelar y Robo de vida.',
    power: { name: 'Carga del necrófago', art: '🧟', kind: 'ghoul', aim: 'none' },
    cards: ['h_zombi', 'h_golpe_escarcha', 'h_exhumadora', 'h_abominacion', 'h_senor_sangre', 'h_muerte_descomposicion', 'h_gigante_hueso', 'h_rey_escarcha', 'h_dragona_hueso'],
  },
];

export const HEROES: Record<string, Hero> = Object.fromEntries(LIST.map((h) => [h.id, h]));
export const HERO_ORDER = LIST.map((h) => h.id);

// cada héroe, nueve cartas suyas: una por turno, del 1 al 9
for (const h of LIST) {
  h.cards.forEach((id, i) => {
    const c = card(id);
    if (c.hero !== h.id || c.rank !== i + 1) throw new Error(`${h.id}: ${id} no es su carta del turno ${i + 1}`);
  });
  if (h.cards.length !== 9) throw new Error(`${h.id}: tiene ${h.cards.length} cartas de clase`);
}

export function hero(id: string): Hero {
  const h = HEROES[id];
  if (!h) throw new Error(`héroe desconocido: ${id}`);
  return h;
}

/** Cuánto cura el Sacerdote con X de energía, según la regla en prueba. */
export function healOf(cfg: Pick<Config, 'priestHeal'>, x: number): number {
  return cfg.priestHeal === 'double' ? 2 * x : cfg.priestHeal === 'x' ? x : x + 1;
}

/**
 * Qué hace el poder, con los números de energía `x` (o «X» si es null). `totems`: cuántos tótems lleva
 * invocados el Chamán (para decir cuál sale); `cfg`: las reglas en prueba que cambian números.
 */
export function powerText(id: string, x: number | null, totems = 0, cfg: Pick<Config, 'priestHeal'> = { priestHeal: 'plus1' }): string {
  const n = (k = 0) => (x === null ? (k ? `X${k > 0 ? '+' : '−'}${Math.abs(k)}` : 'X') : String(Math.max(0, x + k)));
  switch (hero(id).power.kind) {
    case 'fireblast': return `${n()} de daño a una unidad enemiga o al rival.`;
    case 'heal': {
      const amount = x !== null ? String(healOf(cfg, x)) : cfg.priestHeal === 'double' ? '2X' : cfg.priestHeal === 'x' ? 'X' : 'X+1';
      return `+${amount} de vida a una unidad tuya o a vos.`;
    }
    case 'steadyShot': return `el rival pierde ${n(1)} de vida, aunque tenga Guardián.`;
    case 'armor': return `ganás ${n(1)} de vida.`;
    case 'reinforce': return `invocás un Recluta ${n()}/${n()}.`;
    case 'dagger': return `tu héroe le pega ${n(1)} a una unidad enemiga (al Guardián primero) y recibe su daño.`;
    case 'totem': {
      const next = unitCard(TOTEMS[totems % TOTEMS.length]).name;
      return `invocás tu próximo tótem (${next}), con ${n()} de vida. Salen en ronda: ${TOTEMS.map((t) => unitCard(t).name).join(', ')}.`;
    }
    case 'shapeshift': return `ganás ${n()} de vida y tu héroe le pega ${x === null ? 'X−1 (al menos 1)' : Math.max(1, x - 1)} a una unidad enemiga (recibe su daño) o al rival, si no tiene Guardián.`;
    case 'claws': return `una unidad tuya gana +${n()} de daño hasta el fin del turno.`;
    case 'ghoul': return `invocás un Necrófago ${n()}/1 con Carga, que muere al terminar el turno.`;
  }
}

/** La regla de la energía, para mostrar junto al poder. */
export function energyRule(cfg: Pick<Config, 'powerMode'>): string {
  if (cfg.powerMode === 'off') return 'El poder está apagado (en «Reglas en prueba»): la energía no sirve.';
  if (cfg.powerMode === 'mana') return 'Cuesta 1 de maná, el mismo de las cartas: se usa una vez, en tu turno de ataque, con lo que no gastaste en cartas. Las cartas de energía te dan maná para tu turno siguiente.';
  return cfg.powerMode === 'all'
    ? `Ganás 1 de energía por turno (hasta ${ENERGY_MAX}); algunas cartas dan más. El poder se usa en tu turno de ataque, con ${POWER_MIN} o más, y gasta toda: X es lo que gastás.`
    : `Ganás 1 de energía por turno (hasta ${ENERGY_MAX}); algunas cartas dan más. En tu turno de ataque el poder cuesta ${POWER_MIN} y lo usás las veces que te alcance.`;
}
