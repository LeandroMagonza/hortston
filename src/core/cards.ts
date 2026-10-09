// Las cartas y los mazos. En el turno N tenés siempre las mismas tres opciones, y el rival las ve: dos de
// tu mazo (Salvajes o Pradera, solo unidades) y una de la clase de tu héroe (unidad o hechizo: los
// hechizos son todos de clase). Los números son de prototipo: se ajustan con `npm run sim` y
// `npm run heroes`. El emoji queda para los textos; el dibujo es un ícono (src/game/iconos.ts) o el de `npm run arte`.
//
// Los mazos del juego (Salvajes y Pradera) siguen la curva de Hearthstone: en el turno N una carta sin
// efectos reparte 2N+1 entre ataque y vida. Los efectos son chicos y se pagan con números. La lanza
// (pega primero) cuesta 1 y el cuchillo (pega último, si sigue viva) da 1. Los hechizos no quedan en la
// mesa, así que no suman al golpe final.
//
// Regla de diseño: en cada turno, las opciones cumplen papeles distintos (cuerpo, varias fichas, crecer,
// sacar, proteger, barrer, pegar ya…), así ninguna es «la misma con más números». Y cada efecto tiene
// con qué contestarlo: las fichas, con golpes a todas; el Veneno, con Escudo o lanza; la Carga, con
// Guardián; el Sigilo, con golpes a todas; el aura, matando a la del medio.
// - Salvajes: atacan. Veneno, Carga, silencio, golpes a todas, cuchillos.
// - Pradera: aguantan. Fichas, Guardián, Escudo, refuerzos, lanzas.
// Algunas dependen de dónde las ponés en la fila: «las de los costados» (las dos de al lado), «las de tu
// izquierda» y «las de tu derecha» (todas las de ese lado), al momento de jugarse; y las de aura
// («mientras esté viva, las de los costados tienen…»), todo el tiempo: matar a la del medio les saca el
// bonus a las otras.
//
// Después vienen las cartas de clase (nueve por héroe, una por turno; ver heroes.ts) y las fichas de los
// poderes. Las cartas de clase que vienen de los mazos (la Avispa, el Incendio…) quedaron donde estaban,
// con el héroe que las tiene.
//
// Más abajo quedan las cartas del primer prototipo (Manada y Muralla, con arco, triángulo, escudo,
// armadura y habilidades). No están en el menú: sirven de referencia y para los tests del motor.
import type { Card, Damage, Deck, Effect, Keyword, TargetKind, UnitCard } from './types';
import { MAIN } from './weapons';

const damage = (n: number, target: TargetKind): Effect => ({ type: 'damage', n, target });
const buff = (dmg: number, hp: number, target: TargetKind): Effect => ({ type: 'buff', dmg, hp, target });
const heal = (n: number, target: TargetKind): Effect => ({ type: 'heal', n, target });
const shield = (n: number, target: TargetKind): Effect => ({ type: 'shield', n, target });
const breakShield = (target: TargetKind): Effect => ({ type: 'breakShield', target });
const armor = (n: number, target: TargetKind): Effect => ({ type: 'armor', n, target });
const silence = (target: TargetKind): Effect => ({ type: 'silence', target });
const banish = (target: TargetKind): Effect => ({ type: 'banish', target });
const summon = (card: string, count: number): Effect => ({ type: 'summon', card, count });
const destroy = (target: TargetKind): Effect => ({ type: 'destroy', target });
const execute = (n: number, target: TargetKind): Effect => ({ type: 'execute', n, target });
const energy = (n: number): Effect => ({ type: 'energy', n });
const totem = (hp: number): Effect => ({ type: 'totem', hp });
const charge = (target: TargetKind): Effect => ({ type: 'grant', what: 'charge', target });
const grant = (what: Keyword, target: TargetKind): Effect => ({ type: 'grant', what, target });
const freeze = (target: TargetKind): Effect => ({ type: 'freeze', target });
const double = (target: TargetKind): Effect => ({ type: 'double', target });
const steal = (target: TargetKind): Effect => ({ type: 'steal', target });
const summonPerEnemy = (card: string): Effect => ({ type: 'summon', card, count: 0, per: 'enemy' });

type UnitExtra = Omit<UnitCard, 'kind' | 'id' | 'name' | 'art' | 'rank' | 'hp' | 'dmg'>;

function unit(id: string, name: string, art: string, rank: number, hp: number, dmg: Partial<Damage>, extra: UnitExtra = {}): Card {
  return { kind: 'unit', id, name, art, rank, hp, dmg, ...extra };
}

/** Una carta sin habilidades: armas y vida. */
function beast(id: string, name: string, art: string, rank: number, dmg: Partial<Damage>, hp: number): Card {
  return { kind: 'unit', id, name, art, rank, hp, dmg };
}

function spell(id: string, name: string, art: string, rank: number, effects: Effect[], fast = false, hero?: string): Card {
  return { kind: 'spell', id, name, art, rank, fast, effects: { onPlay: effects }, ...(hero ? { hero } : {}) };
}

/** Un hechizo de clase. */
function classSpell(hero: string, id: string, name: string, art: string, rank: number, effects: Effect[]): Card {
  return spell(id, name, art, rank, effects, false, hero);
}

const LIST: Card[] = [
  // ───────── Salvajes: atacan ─────────
  // T1: dos cuerpos · energía al morir
  unit('b_avispa', 'Avispa', '🐝', 1, 2, { attack: 1 }, { hero: 'cazador', effects: { onSummon: [damage(1, 'chosenEnemy')] } }),
  unit('b_lobezno', 'Lobezno', '🐺', 1, 1, { attack: 1 }, { effects: { onSummon: [summon('b_cachorro', 1)] } }),
  unit('b_cachorro', 'Cachorro', '🐶', 1, 1, { attack: 1 }, { token: true }),
  unit('b_rata', 'Rata', '🐀', 1, 1, { attack: 2 }, { effects: { onDeath: [energy(1)] } }),
  // T2: matar grandes · pegar ya
  unit('b_escorpion', 'Escorpión', '🦂', 2, 2, { attack: 1 }, { poison: true }),
  unit('b_jabali', 'Jabalí', '🐗', 2, 2, { attack: 2 }, { charge: true }),
  classSpell('druida', 'b_zarpazo', 'Zarpazo', '🐾', 3, [damage(3, 'chosenEnemy'), heal(2, 'ownPlayer')]),
  // T3: contra muchas chicas (solo las enemigas) · contra efectos (la Hiena quedó fuera del mazo)
  unit('b_murcielago', 'Murciélago', '🦇', 3, 1, { attack: 2 }, { effects: { onSummon: [damage(1, 'allEnemies')] } }),
  unit('b_hiena', 'Hiena', '🐕', 3, 4, { attack: 2 }, { effects: { onDamaged: [buff(2, 0, 'self')] } }),
  unit('b_loro', 'Loro', '🦜', 3, 2, { attack: 3 }, { effects: { onSummon: [silence('chosenEnemy')] } }),
  // T4: aura (posición) · cuerpo
  unit('b_lobo_alfa', 'Lobo Alfa', '🐺', 4, 4, { attack: 3 }, { aura: { dmg: 1, hp: 0 } }),
  unit('b_halcon', 'Halcón', '🦅', 4, 3, { attack: 3 }, { hero: 'cazador', effects: { onSummon: [damage(2, 'chosenEnemy')] } }),
  beast('b_cocodrilo', 'Cocodrilo', '🐊', 4, { attack: 5 }, 4),
  // T5: rematar · pegar ya
  beast('b_leopardo', 'Leopardo', '🐆', 5, { attack: 4, knife: 3 }, 5),
  unit('b_lobo', 'Lobo', '🐺', 5, 4, { attack: 5 }, { charge: true }),
  unit('b_cobra', 'Cobra', '🐍', 5, 7, { attack: 4 }, { hero: 'picaro', poison: true }),
  // T6: cuerpo · refuerzo
  beast('b_tigre', 'Tigre', '🐅', 6, { attack: 7 }, 6),
  unit('b_gorila', 'Gorila', '🦍', 6, 5, { attack: 5 }, { effects: { onSummon: [buff(1, 0, 'otherAllies')] } }),
  classSpell('mago', 'b_incendio', 'Incendio', '🔥', 6, [damage(3, 'allEnemies')]),
  // T7: cuerpo · pegar primero
  beast('b_leon', 'León', '🦁', 7, { attack: 8 }, 7),
  beast('b_rinoceronte', 'Rinoceronte', '🦏', 7, { spear: 4, attack: 4 }, 6),
  unit('b_oso', 'Oso', '🐻', 7, 7, { attack: 6 }, { hero: 'druida', charge: true }),
  // T8: cuerpo · barrer en fila
  beast('b_tiburon', 'Tiburón', '🦈', 8, { attack: 9 }, 8),
  unit('b_aguila', 'Águila Real', '🦅', 8, 6, { attack: 5 }, { hero: 'cazador', effects: { onSummon: [damage(4, 'chosenEnemy')] } }),
  unit('b_elefante', 'Elefante', '🐘', 8, 8, { attack: 6 }, { effects: { onSummon: [damage(2, 'chosenEnemyAndSides')] } }),
  // T9: cuerpo · barrer enemigas
  beast('b_trex', 'T-Rex', '🦖', 9, { attack: 10 }, 9),
  unit('b_dragon', 'Dragón', '🐉', 9, 7, { attack: 7 }, { effects: { onSummon: [damage(2, 'allEnemies')] } }),
  classSpell('chaman', 'b_erupcion', 'Erupción', '🌋', 9, [damage(3, 'allEnemies'), damage(3, 'enemyPlayer')]),

  // ───────── Pradera: aguantan y crecen ─────────
  // T1: pegajosa · aguantar
  unit('b_pollito', 'Pollito', '🐤', 1, 1, { attack: 1 }, { effects: { onDeath: [summon('b_pichon', 1)] } }),
  unit('b_pichon', 'Pichón', '🐣', 1, 1, { attack: 1 }, { token: true }),
  beast('b_conejo', 'Conejo', '🐰', 1, { attack: 1 }, 3),
  unit('b_ternero', 'Ternero', '🐮', 1, 1, { attack: 1 }, { hero: 'druida', effects: { endTurn: [buff(1, 1, 'self')] } }),
  // T2: energía · contra daño a una (el Gallo quedó fuera del mazo)
  unit('b_perro', 'Perro', '🐕', 2, 2, { attack: 2 }, { effects: { onSummon: [energy(1)] } }),
  unit('b_cordero', 'Cordero', '🐑', 2, 1, { attack: 2 }, { shield: 1 }),
  unit('b_gallo', 'Gallo', '🐓', 2, 1, { attack: 2 }, { effects: { onSummon: [buff(1, 1, 'chosenAlly')] } }),
  // T3: aura (posición) · proteger (el Granizo quedó fuera)
  unit('b_pavo', 'Pavo', '🦃', 3, 3, { attack: 2 }, { aura: { dmg: 0, hp: 1 } }),
  unit('b_carnero', 'Carnero', '🐏', 3, 3, { attack: 3 }, { guard: true }),
  spell('b_granizo', 'Granizo', '🌨️', 3, [damage(1, 'allEnemies')]),
  // T4: pegar primero · fábrica (el Ciervo quedó fuera)
  beast('b_cabra', 'Cabra', '🐐', 4, { spear: 3, attack: 2 }, 3),
  unit('b_ciervo', 'Ciervo', '🦌', 4, 4, { attack: 3 }, { effects: { onSummon: [buff(1, 1, 'chosenAlly')] } }),
  unit('b_gallina', 'Gallina', '🐔', 4, 3, { attack: 2 }, { effects: { endTurn: [summon('b_pichon', 1)] } }),
  // T5: cuerpo · posición
  beast('b_caballo', 'Caballo', '🐴', 5, { attack: 6 }, 5),
  unit('b_buho', 'Búho', '🦉', 5, 4, { attack: 4 }, { effects: { onSummon: [buff(0, 1, 'leftAllies'), buff(1, 0, 'rightAllies')] } }),
  classSpell('druida', 'b_primavera', 'Primavera', '🌷', 5, [buff(2, 2, 'allAllies')]),
  // T6: cuerpo · pegajosa (el Toro quedó fuera)
  beast('b_bufalo', 'Búfalo', '🐃', 6, { attack: 6 }, 7),
  beast('b_toro', 'Toro', '🐂', 6, { spear: 5, attack: 2 }, 5),
  unit('b_osa', 'Osa', '🐻', 6, 5, { attack: 4 }, { effects: { onDeath: [summon('b_osezno', 2)] } }),
  unit('b_osezno', 'Osezno', '🧸', 2, 2, { attack: 2 }, { token: true }),
  // T7: cuerpo · proteger
  beast('b_camello', 'Camello', '🐫', 7, { attack: 7 }, 8),
  unit('b_gran_elefante', 'Gran Elefante', '🐘', 7, 9, { attack: 5 }, { guard: true }),
  unit('b_vaca', 'Vaca sagrada', '🐄', 7, 8, { attack: 6 }, { hero: 'sacerdote', effects: { endTurn: [buff(0, 1, 'otherAllies')] } }),
  // T8: cuerpo · refuerzo a todas
  beast('b_hipopotamo', 'Hipopótamo', '🦛', 8, { attack: 8 }, 9),
  unit('b_unicornio', 'Unicornio', '🦄', 8, 8, { attack: 7 }, { hero: 'paladin', shield: 1, effects: { onSummon: [shield(1, 'chosenAlly')] } }),
  unit('b_canguro', 'Canguro', '🦘', 8, 6, { attack: 6 }, { effects: { onSummon: [buff(1, 1, 'otherAllies')] } }),
  // T9: cuerpo · pegar primero
  beast('b_mamut', 'Mamut', '🐘', 9, { attack: 9 }, 10),
  beast('b_grifo', 'Grifo', '🦅', 9, { spear: 4, attack: 5 }, 9),
  classSpell('druida', 'b_estampida', 'Estampida', '🐎', 9, [buff(3, 3, 'allAllies')]),

  // ───────── Clases: nueve cartas por héroe, una por turno (unidades y hechizos) ─────────
  // Cada una juega con la mecánica de su clase. Algunas vienen de los mazos (la Avispa, el Halcón…). Las
  // unidades siguen la curva (2N+1) con los efectos pagados en números.

  // Mago: hechizos de daño, Congelar, Poder +N
  classSpell('mago', 'h_imagen_espejo', 'Imagen espejo', '🪞', 1, [summon('h_imagen', 2)]),
  unit('h_aprendiz', 'Aprendiz', '🧙', 2, 2, { attack: 2 }, { hero: 'mago', powerBonus: 1 }),
  classSpell('mago', 'h_rayo_escarcha', 'Rayo de escarcha', '❄️', 3, [damage(4, 'chosenEnemy'), freeze('chosenEnemy')]),
  unit('h_elemental_agua', 'Elemental de agua', '💧', 4, 6, { attack: 4 }, { hero: 'mago', effects: { afterFight: [freeze('rival')] } }),
  classSpell('mago', 'h_bola_fuego', 'Bola de fuego', '☄️', 5, [damage(6, 'chosenEnemy')]),
  // T6: Incendio (arriba, en Salvajes)
  unit('h_archimaga', 'Archimaga', '🧝', 7, 8, { attack: 6 }, { hero: 'mago', powerBonus: 2 }),
  classSpell('mago', 'h_meteoro', 'Meteoro', '🌠', 8, [damage(5, 'chosenEnemyAndSides')]),
  unit('h_dragona_arcana', 'Dragona arcana', '🐉', 9, 7, { attack: 7 }, { hero: 'mago', powerBonus: 1, effects: { onSummon: [freeze('allEnemies')] } }),
  unit('h_imagen', 'Reflejo', '🪞', 1, 2, {}, { token: true, guard: true }),

  // Cazador: bestias, Carga, a la cara
  // T1: Avispa · T4: Halcón · T8: Águila Real (arriba, en Salvajes)
  unit('h_sabueso', 'Sabueso', '🦮', 2, 2, { attack: 2 }, { hero: 'cazador', effects: { onFace: [energy(1)] } }),
  unit('h_carronero', 'Zorro carroñero', '🦊', 3, 2, { attack: 3 }, { hero: 'cazador', effects: { onAllyDeath: [buff(2, 1, 'self')] } }),
  unit('h_leona', 'Leona', '🦁', 5, 5, { attack: 4 }, { hero: 'cazador', effects: { onDeath: [summon('h_cachorro_leon', 2)] } }),
  classSpell('cazador', 'h_soltar_perros', 'Soltar a los perros', '🐕', 6, [summonPerEnemy('h_perro_caza')]),
  unit('h_huargo', 'Huargo', '🐺', 7, 7, { attack: 5 }, { hero: 'cazador', rush: true, effects: { onSummon: [buff(1, 0, 'otherAllies')] } }),
  unit('h_quimera', 'Quimera', '🐲', 9, 8, { attack: 7 }, { hero: 'cazador', charge: true, effects: { onSummon: [damage(3, 'enemyPlayer')] } }),
  unit('h_cachorro_leon', 'Cachorro de león', '🐱', 2, 2, { attack: 2 }, { token: true }),
  unit('h_perro_caza', 'Perro de caza', '🐕', 1, 1, { attack: 2 }, { token: true, charge: true }),

  // Sacerdote: curar (sin tope), duplicar vida, tomar el control
  unit('h_novicia', 'Novicia', '🙏', 1, 2, { attack: 1 }, { hero: 'sacerdote', effects: { onPower: [buff(1, 1, 'self')] } }),
  unit('h_cleriga', 'Clériga', '🕯️', 2, 3, { attack: 2 }, { hero: 'sacerdote', effects: { onPower: [heal(1, 'otherAllies')] } }),
  unit('h_espiritu_divino', 'Espíritu divino', '👼', 3, 4, { attack: 2 }, { hero: 'sacerdote', effects: { onSummon: [double('chosenAlly')] } }),
  unit('h_sanadora', 'Sanadora', '🌸', 4, 5, { attack: 4 }, { hero: 'sacerdote', effects: { onSummon: [heal(3, 'chosenAlly')] } }),
  classSpell('sacerdote', 'h_nova_sagrada', 'Nova sagrada', '🌟', 5, [damage(2, 'allEnemies'), heal(2, 'allAllies'), heal(2, 'ownPlayer')]),
  unit('h_angel', 'Ángel', '😇', 6, 6, { attack: 5 }, { hero: 'sacerdote', guard: true, lifesteal: true }),
  // T7: Vaca sagrada (arriba, en Pradera)
  unit('h_profeta', 'Profeta', '🕊️', 8, 9, { attack: 6 }, { hero: 'sacerdote', powerBonus: 2 }),
  classSpell('sacerdote', 'h_control_mental', 'Control mental', '🌀', 9, [steal('chosenDamagedEnemy')]),

  // Guerrero: enojarse (al recibir daño), Embestida, Guardián, armadura (vida)
  unit('h_berserker', 'Berserker', '💢', 1, 2, { attack: 1 }, { hero: 'guerrero', effects: { onDamaged: [buff(2, 0, 'self')] } }),
  classSpell('guerrero', 'h_ejecutar', 'Ejecutar', '🗡️', 2, [execute(3, 'chosenEnemy')]),
  unit('h_herrera', 'Herrera', '⚒️', 3, 5, { attack: 2 }, { hero: 'guerrero', guard: true, effects: { onDamaged: [heal(2, 'ownPlayer')] } }),
  unit('h_escudero', 'Escudero', '⛑️', 4, 5, { attack: 3 }, { hero: 'guerrero', effects: { onSummon: [heal(4, 'ownPlayer')] } }),
  unit('h_hachera', 'Hachera', '🪓', 5, 5, { attack: 5 }, { hero: 'guerrero', rush: true }),
  unit('h_senor_guerra', 'Señor de la guerra', '👺', 6, 6, { attack: 6 }, { hero: 'guerrero', effects: { onDamaged: [buff(2, 0, 'self'), heal(2, 'ownPlayer')] } }),
  unit('h_espadachin', 'Espadachín', '🤺', 7, 7, { attack: 7 }, { hero: 'guerrero', rush: true }),
  unit('h_grito_infernal', 'Grito infernal', '😡', 8, 10, { attack: 6 }, { hero: 'guerrero', charge: true, effects: { onDamaged: [buff(4, 0, 'self')] } }),
  unit('h_coloso', 'Coloso', '🦕', 9, 10, { attack: 9 }, { hero: 'guerrero', guard: true }),

  // Paladín: Escudo, Reclutas, bendiciones
  unit('h_escudero_argenteo', 'Escudero argénteo', '🔰', 1, 1, { attack: 1 }, { hero: 'paladin', shield: 1 }),
  unit('h_protectora', 'Protectora', '🛡️', 2, 2, { attack: 2 }, { hero: 'paladin', effects: { onSummon: [shield(1, 'chosenAlly')] } }),
  classSpell('paladin', 'h_bendicion_reyes', 'Bendición de reyes', '👑', 3, [buff(4, 4, 'chosenAlly')]),
  classSpell('paladin', 'h_llamado_armas', 'Llamado a las armas', '🎺', 4, [summon('h_recluta', 3), buff(1, 1, 'allAllies')]),
  classSpell('paladin', 'h_consagracion', 'Consagración', '☀️', 5, [damage(2, 'allEnemies'), damage(2, 'enemyPlayer')]),
  unit('h_caballero_argenteo', 'Caballero argénteo', '🏇', 6, 5, { attack: 5 }, { hero: 'paladin', shield: 1, charge: true }),
  unit('h_guardiana_luz', 'Guardiana de la luz', '💫', 7, 7, { attack: 5 }, { hero: 'paladin', shield: 1, guard: true, aura: { dmg: 0, hp: 1 } }),
  // T8: Unicornio (arriba, en Pradera)
  unit('h_senor_luz', 'Señor de la luz', '🌞', 9, 8, { attack: 7 }, { hero: 'paladin', shield: 1, guard: true, charge: true, effects: { onDeath: [summon('h_recluta', 2)] } }),

  // Pícaro: Sigilo y cuchillos, Veneno, sacar unidades. Pega a la cara desde las sombras: con Sigilo
  // elige cuándo atacar. Ataque y cuchillo: pega a la vez como todas y, si sigue viva, una puñalada más
  // al final (con cuchillo solo, recibía el golpe antes de dar el suyo y perdía las peleas). Cerca de la
  // curva: el cuchillo da 1 y el Sigilo no cuesta (en una carrera, que no la puedan cambiar no es tanto).
  // La respuesta: cuando ataca, se ve.
  classSpell('picaro', 'h_punalada', 'Puñalada', '🔪', 1, [damage(4, 'chosenUndamagedEnemy')]),
  unit('h_bandida', 'Bandida', '🦝', 2, 3, { attack: 2, knife: 1 }, { hero: 'picaro', stealth: true }),
  unit('h_envenenadora', 'Envenenadora', '🧪', 3, 4, { attack: 2, knife: 1 }, { hero: 'picaro', powerPoison: true }),
  unit('h_espia', 'Espía', '🕵️', 4, 5, { attack: 3, knife: 1 }, { hero: 'picaro', stealth: true, effects: { onSummon: [silence('chosenEnemy')] } }),
  // T5: Cobra (arriba, en Salvajes)
  classSpell('picaro', 'h_asesinar', 'Asesinar', '☠️', 6, [destroy('chosenEnemy')]),
  unit('h_maestra_dagas', 'Maestra de dagas', '🗡️', 7, 8, { attack: 3, knife: 3 }, { hero: 'picaro', stealth: true, poison: true }),
  unit('h_asesina_noche', 'Asesina de la noche', '🌙', 8, 7, { attack: 5, knife: 3 }, { hero: 'picaro', stealth: true, effects: { onSummon: [damage(3, 'chosenEnemy')] } }),
  unit('h_sombra', 'Sombra', '🌑', 9, 10, { attack: 6, knife: 4 }, { hero: 'picaro', stealth: true }),

  // Chamán: tótems, auras, rayos, elementales
  classSpell('chaman', 'h_descarga_escarcha', 'Descarga de escarcha', '🧊', 1, [damage(3, 'chosenEnemy'), freeze('chosenEnemy')]),
  unit('h_totem_lengua', 'Tótem lengua de fuego', '🏮', 2, 3, {}, { hero: 'chaman', aura: { dmg: 2, hp: 0 } }),
  unit('h_chamana', 'Chamana', '🌊', 3, 3, { attack: 2 }, { hero: 'chaman', effects: { onSummon: [totem(2)] } }),
  classSpell('chaman', 'h_cadena_relampagos', 'Cadena de relámpagos', '⚡', 4, [damage(3, 'chosenEnemyAndSides')]),
  classSpell('chaman', 'h_lobos_espectrales', 'Lobos espectrales', '🐺', 5, [summon('h_lobo_espectral', 2)]),
  unit('h_elemental_fuego', 'Elemental de fuego', '🔥', 6, 5, { attack: 5 }, { hero: 'chaman', effects: { onSummon: [damage(3, 'chosenEnemy')] } }),
  unit('h_elemental_tierra', 'Elemental de tierra', '⛰️', 7, 8, { attack: 5 }, { hero: 'chaman', guard: true, effects: { onSummon: [totem(3)] } }),
  classSpell('chaman', 'h_tormenta', 'Tormenta eléctrica', '⛈️', 8, [damage(4, 'allEnemies')]),
  // T9: Erupción (arriba, en Salvajes)
  unit('h_lobo_espectral', 'Lobo espectral', '🐺', 3, 3, { attack: 3 }, { token: true, guard: true }),

  // Druida: energía, crecer, bestias grandes, refuerzos a todas
  // T1: Ternero · T3: Zarpazo · T5: Primavera · T7: Oso · T9: Estampida (arriba, en los mazos)
  unit('h_driade', 'Dríade', '🌳', 2, 2, { attack: 2 }, { hero: 'druida', effects: { onSummon: [energy(2)] } }),
  unit('h_ent_joven', 'Ent joven', '🌱', 4, 5, { attack: 4 }, { hero: 'druida', guard: true, effects: { onSummon: [energy(1)] } }),
  unit('h_ancestro', 'Ancestro', '🌴', 6, 7, { attack: 5 }, { hero: 'druida', guard: true, effects: { onSummon: [energy(2)] } }),
  classSpell('druida', 'h_fuerza_naturaleza', 'Fuerza de la naturaleza', '🍃', 8, [summon('h_treant', 3)]),
  unit('h_treant', 'Treant', '🌲', 2, 2, { attack: 3 }, { token: true, charge: true }),

  // Cazador de demonios: las puntas de la fila, Embestida, Robo de vida
  unit('h_diablillo', 'Diablillo', '😈', 1, 2, { attack: 1 }, { hero: 'cazador_demonios', effects: { onSummon: [buff(1, 1, 'selfAtEdge')] } }),
  classSpell('cazador_demonios', 'h_golpe_vil', 'Golpe vil', '💚', 2, [damage(2, 'chosenEnemy'), heal(2, 'ownPlayer')]),
  unit('h_proscrita', 'Proscrita', '🦹', 3, 2, { attack: 3 }, { hero: 'cazador_demonios', effects: { onSummon: [buff(1, 0, 'selfAtEdge'), charge('selfAtEdge')] } }),
  unit('h_cazador_almas', 'Cazador de almas', '👻', 4, 3, { attack: 3 }, { hero: 'cazador_demonios', rush: true, lifesteal: true }),
  unit('h_mastin_vil', 'Mastín vil', '🐕', 5, 4, { attack: 4 }, { hero: 'cazador_demonios', rush: true, effects: { onSummon: [buff(2, 0, 'selfAtEdge')] } }),
  classSpell('cazador_demonios', 'h_rayo_ocular', 'Rayo ocular', '👁️', 6, [damage(4, 'chosenEnemy'), heal(4, 'ownPlayer')]),
  unit('h_demonio_abismo', 'Demonio del abismo', '👾', 7, 7, { attack: 6 }, { hero: 'cazador_demonios', guard: true, lifesteal: true }),
  unit('h_senor_demoniaco', 'Señor demoníaco', '👿', 8, 7, { attack: 7 }, { hero: 'cazador_demonios', rush: true, lifesteal: true }),
  unit('h_gran_cazador', 'Gran cazador', '🧛', 9, 8, { attack: 7 }, { hero: 'cazador_demonios', charge: true, effects: { onSummon: [grant('lifesteal', 'selfAtEdge')] } }),

  // Caballero de la muerte: las muertes dan energía, Aguante, Congelar, Robo de vida
  unit('h_zombi', 'Zombi', '🧟', 1, 2, { attack: 1 }, { hero: 'caballero_muerte', lastStand: true }),
  classSpell('caballero_muerte', 'h_golpe_escarcha', 'Golpe de escarcha', '🥶', 2, [damage(3, 'chosenEnemy'), freeze('chosenEnemy')]),
  unit('h_exhumadora', 'Exhumadora', '⚰️', 3, 4, { attack: 3 }, { hero: 'caballero_muerte', effects: { onAllyDeath: [energy(1)] } }),
  unit('h_abominacion', 'Abominación', '👹', 4, 4, { attack: 4 }, { hero: 'caballero_muerte', guard: true, effects: { onDeath: [damage(2, 'allEnemies')] } }),
  unit('h_senor_sangre', 'Señor de la sangre', '🩸', 5, 6, { attack: 4 }, { hero: 'caballero_muerte', lifesteal: true, lastStand: true }),
  classSpell('caballero_muerte', 'h_muerte_descomposicion', 'Muerte y descomposición', '☣️', 6, [damage(2, 'allEnemies'), energy(2)]),
  unit('h_gigante_hueso', 'Gigante de hueso', '🦴', 7, 8, { attack: 7 }, { hero: 'caballero_muerte', lastStand: true }),
  unit('h_rey_escarcha', 'Rey de la escarcha', '🤴', 8, 8, { attack: 6 }, { hero: 'caballero_muerte', guard: true, effects: { endTurn: [summon('h_esqueleto', 1)] } }),
  unit('h_dragona_hueso', 'Dragona de hueso', '🐉', 9, 8, { attack: 7 }, { hero: 'caballero_muerte', lastStand: true, lifesteal: true }),
  unit('h_esqueleto', 'Esqueleto', '💀', 1, 1, { attack: 1 }, { token: true }),

  // fichas de los poderes (el poder les pone los números según la energía)
  unit('h_recluta', 'Recluta', '💂', 1, 1, { attack: 1 }, { token: true }),
  unit('h_necrofago', 'Necrófago', '🧟', 1, 1, { attack: 1 }, { token: true, charge: true, effects: { endTurn: [destroy('self')] } }),
  unit('h_totem_abrasador', 'Tótem Abrasador', '🔥', 1, 1, { attack: 1 }, { token: true }),
  unit('h_totem_piedra', 'Tótem de Piedra', '🗿', 1, 1, {}, { token: true, guard: true }),
  unit('h_totem_sanador', 'Tótem Sanador', '💧', 1, 1, {}, { token: true, effects: { endTurn: [heal(1, 'otherAllies')] } }),
  unit('h_totem_viento', 'Tótem del Viento', '🌪️', 1, 1, {}, { token: true, effects: { endTurn: [energy(1)] } }),

  // ───────── Primer prototipo ─────────
  // ───────── Manada: lobos, zorros y aves. Cuchillos, arcos y daño a elección ─────────
  unit('zorro_picaro', 'Zorro Pícaro', '🦊', 1, 1, { knife: 2 }, { shield: 1 }),
  unit('lobezno', 'Lobezno', '🐺', 1, 2, { axe: 2 }),
  unit('cachorro', 'Cachorro', '🐶', 1, 2, { sword: 1 }, { evolves: { turn: 4, into: 'lobo_joven' } }),
  unit('lobo_joven', 'Lobo Joven', '🐺', 4, 5, { sword: 4 }, { token: true }),

  unit('rata', 'Rata Saqueadora', '🐀', 2, 2, { knife: 3 }, { energy: 2, effects: { onDeath: [damage(1, 'strongestEnemy')] } }),
  unit('halcon', 'Halcón Explorador', '🦅', 2, 2, { bow: 1 }, { effects: { onSummon: [damage(1, 'chosenEnemy')] } }),
  unit('lobo_gris', 'Lobo Gris', '🐺', 2, 3, { axe: 3 }, { effects: { afterFight: [buff(1, 0, 'self')] } }),

  unit('zorra_tramposa', 'Zorra Tramposa', '🦊', 3, 3, { sword: 2, knife: 1 }, { effects: { onSummon: [breakShield('allEnemies')] } }),
  unit('comadreja', 'Comadreja Asesina', '🦡', 3, 3, { knife: 5 }, { shield: 1, effects: { afterCombat: [shield(1, 'self')] } }),
  spell('emboscada', 'Emboscada', '🍃', 3, [damage(3, 'chosenEnemy')], true),

  unit('jabali', 'Jabalí Furioso', '🐗', 4, 4, { axe: 5 }),
  unit('cuervo', 'Cuervo Vigía', '🐦', 4, 3, { bow: 2 }, { effects: { onSummon: [silence('chosenEnemy')] } }),
  unit('hiena', 'Hiena Carroñera', '🐕', 4, 5, { knife: 4 }, { energy: 2 }),

  unit('lobo_alfa', 'Lobo Alfa', '🐺', 5, 5, { sword: 4 }, { effects: { onSummon: [buff(1, 1, 'otherAllies')] } }),
  unit('puma', 'Puma Acechador', '🐆', 5, 5, { knife: 7 }, { shield: 2 }),
  unit('aguila', 'Águila Real', '🦅', 5, 4, { bow: 3 }, { fast: true, effects: { onSummon: [damage(2, 'chosenEnemy')] } }),

  unit('lince', 'Lince Veloz', '🐈', 6, 5, { sword: 4 }, { energy: 2 }),
  unit('loba_lider', 'Loba Líder', '🐺', 6, 3, { axe: 3 }, { effects: { onSummon: [summon('lobezno', 2)] } }),
  spell('aullido', 'Aullido', '🌕', 6, [buff(2, 1, 'allAllies')]),

  unit('huargo', 'Huargo', '🐺', 7, 6, { axe: 7 }, { effects: { onCombatDeath: [damage(3, 'strongestEnemy')] } }),
  unit('tigre', 'Tigre Sombrío', '🐅', 7, 6, { knife: 9 }, { shield: 2 }),
  unit('rey_zorro', 'Rey Zorro', '🦊', 7, 6, { bow: 3, sword: 4 }, { effects: { onSummon: [buff(-1, 0, 'allEnemies')] } }),

  unit('lobo_ancestral', 'Lobo Ancestral', '🐺', 8, 8, { sword: 6 }, { lastStand: true, effects: { lastStand: [buff(2, 2, 'otherAllies')] } }),
  unit('cazador_lunar', 'Cazador Lunar', '🌙', 8, 6, { bow: 3, knife: 3 }, { energy: 2 }),
  unit('gran_lince', 'Gran Lince', '🐆', 8, 7, { knife: 10 }, { shield: 3, armor: 1 }),

  unit('fenrir', 'Fenrir', '🐺', 9, 10, { axe: 8, knife: 3 }),
  unit('reina_loba', 'Reina Loba', '🐺', 9, 9, { sword: 7 }, { effects: { onSummon: [buff(2, 1, 'otherAllies')] } }),
  spell('luna_sangre', 'Luna de Sangre', '🌑', 9, [damage(2, 'allEnemies'), damage(3, 'enemyPlayer')]),

  // ───────── Muralla: tortugas, osos y búhos. Lanzas, mazas, guardianes, escudo y armadura ─────────
  unit('erizo', 'Erizo', '🦔', 1, 2, { spear: 1, knife: 1 }),
  unit('huevo_tortuga', 'Huevo de Tortuga', '🥚', 1, 3, {}, { guard: true, evolves: { turn: 3, into: 'tortuga_joven' } }),
  unit('tortuga_joven', 'Tortuga Joven', '🐢', 3, 5, { spear: 2 }, { guard: true, token: true }),
  unit('castor', 'Castor', '🦦', 1, 2, { mace: 2 }, { effects: { onDeath: [buff(0, 1, 'otherAllies')] } }),

  unit('puercoespin', 'Guardia Puercoespín', '🦔', 2, 3, { spear: 2 }, { guard: true, effects: { afterFight: [buff(0, 1, 'self')] } }),
  unit('buho_sabio', 'Búho Sabio', '🦉', 2, 3, { bow: 1 }, { fast: true, effects: { onSummon: [silence('chosenEnemy')] } }),
  unit('tejon', 'Tejón Tozudo', '🦡', 2, 2, { mace: 3 }, { lastStand: true }),

  unit('tortuga_escudera', 'Tortuga Escudera', '🐢', 3, 4, { spear: 2 }, { shield: 1, guard: true, effects: { afterCombat: [shield(1, 'self')] } }),
  unit('oso_pardo', 'Oso Pardo', '🐻', 3, 3, { mace: 4 }),
  spell('formacion', 'Formación', '🛡️', 3, [shield(1, 'allAllies')]),

  unit('rinoceronte', 'Rinoceronte', '🦏', 4, 5, { spear: 4 }, { armor: 1 }),
  unit('armadillo', 'Armadillo', '🦎', 4, 4, { sword: 3 }, { armor: 2 }),
  unit('buho_hechicero', 'Búho Hechicero', '🦉', 4, 3, { bow: 1, mace: 1 }, { effects: { onSummon: [shield(1, 'chosenAlly'), buff(1, 1, 'chosenAlly')] } }),

  unit('oso_guardian', 'Oso Guardián', '🐻', 5, 7, { spear: 2, mace: 2 }, { guard: true }),
  unit('tortuga_anciana', 'Tortuga Anciana', '🐢', 5, 6, { sword: 3 }, { lastStand: true, effects: { lastStand: [armor(1, 'allAllies')] } }),
  unit('alce', 'Alce', '🦌', 5, 5, { mace: 5 }, { effects: { onSummon: [damage(2, 'chosenEnemy')] } }),

  unit('gran_tortuga', 'Gran Tortuga', '🐢', 6, 9, { spear: 3 }, { guard: true, armor: 1 }),
  unit('oso_polar', 'Oso Polar', '🐻', 6, 6, { mace: 6 }, { effects: { afterFight: [buff(1, 1, 'self')] } }),
  spell('savia', 'Savia del Bosque', '🌿', 6, [heal(4, 'allAllies'), heal(4, 'ownPlayer')]),

  unit('elefante', 'Elefante Muralla', '🐘', 7, 9, { spear: 3, mace: 2 }, { guard: true, shield: 2 }),
  unit('buho_archimago', 'Búho Archimago', '🦉', 7, 5, { bow: 2 }, { effects: { onSummon: [banish('chosenEnemy')] } }),
  unit('gorila', 'Gorila', '🦍', 7, 7, { mace: 7 }, { lastStand: true, effects: { lastStand: [damage(3, 'allEnemies')] } }),

  unit('rino_acorazado', 'Rinoceronte Acorazado', '🦏', 8, 8, { spear: 7 }, { armor: 2 }),
  unit('tortuga_dragon', 'Tortuga Dragón', '🐉', 8, 10, { sword: 6 }, { shield: 3 }),
  unit('osa_madre', 'Osa Madre', '🐻', 8, 8, { mace: 5 }, { effects: { onSummon: [summon('osezno', 2)] } }),
  unit('osezno', 'Osezno', '🧸', 1, 2, { spear: 2 }, { token: true }),

  unit('mamut', 'Mamut', '🐘', 9, 11, { spear: 4, mace: 3 }, { guard: true }),
  spell('terremoto', 'Terremoto', '🌋', 9, [damage(3, 'allEnemies')]),
  unit('gran_oso', 'Gran Oso', '🐻', 9, 9, { mace: 10 }, { energy: 2 }),
];

export const CARDS: Record<string, Card> = Object.fromEntries(LIST.map((c) => [c.id, c]));

// a lo sumo un arma principal por unidad (ataque simple o una del triángulo)
for (const c of LIST) {
  if (c.kind === 'unit' && MAIN.filter((w) => (c.dmg[w] ?? 0) > 0).length > 1) {
    throw new Error(`${c.id} tiene más de un arma principal`);
  }
}

export const DECKS: Record<string, Deck> = {
  salvajes: {
    id: 'salvajes',
    name: 'Salvajes',
    art: '🐯',
    blurb: 'Atacan: Veneno, Carga, silencio, golpes a todas y cuchillos.',
    turns: [
      ['b_lobezno', 'b_rata'],
      ['b_escorpion', 'b_jabali'],
      ['b_murcielago', 'b_loro'],
      ['b_lobo_alfa', 'b_cocodrilo'],
      ['b_leopardo', 'b_lobo'],
      ['b_tigre', 'b_gorila'],
      ['b_leon', 'b_rinoceronte'],
      ['b_tiburon', 'b_elefante'],
      ['b_trex', 'b_dragon'],
    ],
  },
  pradera: {
    id: 'pradera',
    name: 'Pradera',
    art: '🐴',
    blurb: 'Aguantan: fichas, Guardián, Escudo, auras, refuerzos y lanzas.',
    turns: [
      ['b_pollito', 'b_conejo'],
      ['b_perro', 'b_cordero'],
      ['b_pavo', 'b_carnero'],
      ['b_cabra', 'b_gallina'],
      ['b_caballo', 'b_buho'],
      ['b_bufalo', 'b_osa'],
      ['b_camello', 'b_gran_elefante'],
      ['b_hipopotamo', 'b_canguro'],
      ['b_mamut', 'b_grifo'],
    ],
  },
};

/** Los mazos del primer prototipo (arco, triángulo, escudo, armadura, habilidades). Fuera del menú. */
export const OLD_DECKS: Record<string, Deck> = {
  manada: {
    id: 'manada',
    name: 'Manada',
    art: '🐺',
    blurb: 'Lobos, zorros y aves. Cuchillos, arcos y daño a elección.',
    turns: [
      ['zorro_picaro', 'lobezno', 'cachorro'],
      ['rata', 'halcon', 'lobo_gris'],
      ['zorra_tramposa', 'comadreja', 'emboscada'],
      ['jabali', 'cuervo', 'hiena'],
      ['lobo_alfa', 'puma', 'aguila'],
      ['lince', 'loba_lider', 'aullido'],
      ['huargo', 'tigre', 'rey_zorro'],
      ['lobo_ancestral', 'cazador_lunar', 'gran_lince'],
      ['fenrir', 'reina_loba', 'luna_sangre'],
    ],
  },
  muralla: {
    id: 'muralla',
    name: 'Muralla',
    art: '🐢',
    blurb: 'Tortugas, osos y búhos. Lanzas, mazas, guardianes, escudo y armadura.',
    turns: [
      ['erizo', 'huevo_tortuga', 'castor'],
      ['puercoespin', 'buho_sabio', 'tejon'],
      ['tortuga_escudera', 'oso_pardo', 'formacion'],
      ['rinoceronte', 'armadillo', 'buho_hechicero'],
      ['oso_guardian', 'tortuga_anciana', 'alce'],
      ['gran_tortuga', 'oso_polar', 'savia'],
      ['elefante', 'buho_archimago', 'gorila'],
      ['rino_acorazado', 'tortuga_dragon', 'osa_madre'],
      ['mamut', 'terremoto', 'gran_oso'],
    ],
  },
};

export function card(id: string): Card {
  const c = CARDS[id];
  if (!c) throw new Error(`carta desconocida: ${id}`);
  return c;
}

export function unitCard(id: string): UnitCard {
  const c = card(id);
  if (c.kind !== 'unit') throw new Error(`${id} no es una unidad`);
  return c;
}
