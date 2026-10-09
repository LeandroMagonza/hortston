// El texto de las cartas sale de sus datos, así nunca dice algo distinto de lo que hace.
// Las armas, la vida, el escudo y la armadura no van en el texto: son las piedras de los bordes.
//
// Cada habilidad es un renglón «Palabra clave: efecto». Las palabras clave que ya dicen todo van solas
// (Guardián, Rápido, Energía 2, Aguante); las que disparan algo llevan el efecto después de los dos
// puntos (Al invocar: …, Último aliento: …).
import { card, unitCard } from './cards';
import type { Config, Effect, Keyword, TargetKind, Trigger, Unit, UnitCard } from './types';
import { WEAPON_ORDER, WEAPONS } from './weapons';

/** El nombre de cada disparador en la carta. `onPlay` (hechizos) no lleva nombre. */
const TRIGGERS: Record<Trigger, string> = {
  onPlay: '',
  onSummon: 'Al invocar',
  beforeFight: 'Antes de pelear',
  afterFight: 'Después de pelear',
  afterCombat: 'Tras el combate',
  lastStand: 'Aguante',
  onDeath: 'Último aliento',
  onCombatDeath: 'Caer en combate',
  endTurn: 'Fin del turno',
  onDamaged: 'Al recibir daño',
  onFace: 'Al pegarle al rival',
  onAllyDeath: 'Cuando muere otra tuya',
  onPower: 'Al usar tu poder',
};

const TARGETS: Record<TargetKind, string> = {
  self: 'esta unidad',
  otherAllies: 'tus otras unidades',
  allAllies: 'tus unidades',
  allEnemies: 'todas las unidades enemigas',
  allUnits: 'todas las unidades',
  allOthers: 'todas las demás unidades',
  adjacent: 'las de los costados',
  leftAllies: 'las de tu izquierda',
  rightAllies: 'las de tu derecha',
  selfAtEdge: 'esta unidad, si quedó en una punta de tu fila',
  strongestEnemy: 'la unidad enemiga que más pega',
  weakestEnemy: 'la unidad enemiga con menos vida',
  newestEnemy: 'la última unidad enemiga invocada',
  rival: 'su rival',
  // las que se eligen dicen «una»: «la que…» son las que se eligen solas
  chosenEnemy: 'una unidad enemiga',
  chosenAlly: 'otra unidad tuya',
  chosenUnit: 'una unidad',
  chosenEnemyAndSides: 'una unidad enemiga y a las de sus costados',
  chosenDamagedEnemy: 'una unidad enemiga herida',
  chosenUndamagedEnemy: 'una unidad enemiga sin heridas',
  enemyPlayer: 'el rival',
  ownPlayer: 'vos',
};

/** Qué quiere decir cada palabra clave, para la vista ampliada. */
export const KEYWORDS: Record<string, string> = {
  Guardián: 'Hay que atacarlo antes que a las demás y que al héroe.',
  Energía: 'Cuántas veces ataca por turno.',
  Rápido: 'Su efecto se resuelve antes que el de la carta del rival.',
  Carga: 'Puede atacar el turno en que entra (las demás esperan al turno siguiente).',
  Veneno: 'Si le hace daño a una unidad peleando, la mata. El Escudo lo frena.',
  'Fin del turno': 'Al terminar cada turno, después del combate, haya peleado o no.',
  'Al recibir daño': 'Cada vez que recibe daño y sobrevive.',
  'Al pegarle al rival': 'Cuando ataca al héroe rival y le pega.',
  'Cuando muere otra tuya': 'Cada vez que muere otra unidad tuya, de cualquier forma.',
  'Al usar tu poder': 'Cada vez que usás el poder de tu héroe.',
  'Poder +': 'Mientras esté viva, la X de tu poder sube eso (el Mago pega más, el Sacerdote cura más…).',
  'Poder con Veneno': 'Mientras esté viva, si tu poder le hace daño a una unidad, la mata. El Escudo lo frena.',
  'De clase': 'Solo la tiene ese héroe: le llega una en cada turno, con las dos del mazo.',
  Congelada: 'No ataca ni le pega a la vida en el próximo combate de su dueño.',
  'Robo de vida': 'El daño que hace (peleando o a la vida del rival) le cura lo mismo a su dueño.',
  Embestida: 'Puede atacar unidades el turno en que entra (pero ese turno no al héroe).',
  Sigilo: 'No se la puede atacar ni elegir como objetivo hasta que ataca (a una unidad o al héroe). Los golpes a todas sí le pegan.',
  'Mientras esté viva': 'Las de sus costados tienen eso de más mientras esté viva y al lado: si muere, lo pierden (la vida también, pero sin morirse por eso).',
  Aguante: 'La primera vez que moriría, queda en 1 de vida y sigue, con todo lo que tenía.',
  'Al invocar': 'Cuando entra al tablero.',
  'Antes de pelear': 'En cada pelea, antes de los golpes.',
  'Después de pelear': 'En cada pelea, si sobrevive.',
  'Tras el combate': 'Al terminar el combate del turno, si peleó y sigue viva.',
  'Último aliento': 'Cuando muere, de cualquier forma.',
  'Caer en combate': 'Cuando muere peleando.',
  Evoluciona: 'Si sigue viva al empezar ese turno, se transforma.',
};

const signed = (n: number) => (n < 0 ? '−' : '+') + Math.abs(n);

/** Una palabra en plural: Osezno → Oseznos, Pichón → Pichones, espectral → espectrales. */
const pluralWord = (w: string) => (/[aeiouáéíóú]$/i.test(w) ? `${w}s` : /ón$/.test(w) ? `${w.slice(0, -2)}ones` : `${w}es`);

/** El plural de un nombre de ficha: «Cachorro de león» → «Cachorros de león»; «Lobo espectral» → «Lobos espectrales». */
function plural(name: string): string {
  const words = name.split(' ');
  const de = words.indexOf('de');
  return words.map((w, i) => (de < 0 || i < de ? pluralWord(w) : w)).join(' ');
}

/** Las armas y la vida de una carta, en corto: «🔱2 🔪1 ❤3». */
export function cardStats(c: UnitCard): string {
  const parts = WEAPON_ORDER.filter((w) => (c.dmg[w] ?? 0) > 0).map((w) => `${WEAPONS[w].icon}${c.dmg[w]}`);
  parts.push(`❤${c.hp}`);
  return parts.join(' ');
}

/**
 * Con el poder que cuesta maná, las cartas «de energía» dan maná para el turno siguiente; con las reglas
 * de antes, energía para el poder. La partida lo avisa al empezar (`setRulesText`).
 */
let manaWords = true;

/** Lo que cambia con la regla de la vida: atacando al héroe (por defecto) o las que no atacan pegan solas. */
const FACE_WORDS: Record<'hero' | 'face', Record<string, string>> = {
  hero: {
    'Al pegarle al rival': KEYWORDS['Al pegarle al rival'],
    Embestida: KEYWORDS.Embestida,
  },
  face: {
    'Al pegarle al rival': 'Cuando no atacó y le pega a la vida del rival al terminar tu turno.',
    Embestida: 'Puede atacar unidades el turno en que entra (pero ese turno no le pega a la vida).',
  },
};

export function setRulesText(cfg: Pick<Config, 'powerMode' | 'scoring'>): void {
  manaWords = cfg.powerMode === 'mana';
  Object.assign(KEYWORDS, FACE_WORDS[cfg.scoring === 'face' ? 'face' : 'hero']);
}

/** `again`: el objetivo ya se nombró antes en la misma carta (va al mismo). */
function effectText(e: Effect, again = false): string {
  if (e.type === 'summon') {
    const c = unitCard(e.card);
    const keys = [c.charge && 'Carga', c.guard && 'Guardián'].filter(Boolean).join(', ');
    const what = `(${cardStats(c)}${keys ? `, ${keys}` : ''})`;
    if (e.per === 'enemy') return `invoca un ${c.name} ${what} por cada unidad enemiga`;
    return `invoca ${e.count > 1 ? `${e.count} ${plural(c.name)}` : `un ${c.name}`} ${what}`;
  }
  if (e.type === 'energy') return manaWords ? `+${e.n} de maná en tu turno siguiente` : `ganás ${e.n} de energía`;
  if (e.type === 'totem') return `invoca tu próximo tótem, con ${e.hp} de vida`;
  const t = again && e.target.startsWith('chosen') ? 'esa unidad' : TARGETS[e.target];
  if (e.target === 'selfAtEdge') {
    // «si quedó en una punta de tu fila, gana +1 de daño y Carga»
    const what = e.type === 'grant' ? KEYWORD_TEXT[e.what] : e.type === 'buff' ? buffText(e.dmg, e.hp) : '';
    return again ? what : `si quedó en una punta de tu fila, gana ${what}`;
  }
  switch (e.type) {
    case 'damage': return e.target === 'enemyPlayer' ? `el rival pierde ${e.n} de vida` : `${e.n} de daño a ${t}`;
    case 'buff': {
      const what = buffText(e.dmg, e.hp);
      if (e.target === 'self') return `gana ${what}`;
      return again && e.target.startsWith('chosen') ? `le da ${what}` : `${t}: ${what}`;
    }
    case 'heal': return e.target === 'ownPlayer' ? `ganás ${e.n} de vida` : again && e.target.startsWith('chosen') ? `le da +${e.n} de vida` : `${t}: +${e.n} de vida`;
    case 'shield': return e.target === 'self' ? `recupera Escudo ${e.n}` : `da Escudo ${e.n} a ${t}`;
    case 'breakShield': return `rompe el Escudo de ${t}`;
    case 'armor': return `da Armadura +${e.n} a ${t}`;
    case 'silence': return `silencia a ${t}`;
    case 'banish': return `destierra a ${t}`;
    case 'destroy': return e.target === 'self' ? 'muere' : `destruye a ${t}`;
    case 'execute': return `${t}: si está herida, la destruye; si no, le hace ${e.n} de daño`;
    case 'grant': return e.target === 'self' ? `gana ${KEYWORD_TEXT[e.what]}` : `${t}: ${KEYWORD_TEXT[e.what]}`;
    case 'freeze': return `congela a ${t}`;
    case 'double': return `duplica la vida de ${t}`;
    case 'steal': return `tomás el control de ${t}`;
  }
}

const KEYWORD_TEXT: Record<Keyword, string> = {
  charge: 'Carga', rush: 'Embestida', stealth: 'Sigilo', lifesteal: 'Robo de vida', guard: 'Guardián', poison: 'Veneno',
};

/** Como en Hearthstone: +1/+1 (el daño se suma a cada arma que tenga). */
function buffText(dmg: number, hp: number): string {
  return dmg && hp ? `${signed(dmg)}/${signed(hp)}` : dmg ? `${signed(dmg)} de daño` : `${signed(hp)} de vida`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Qué hace un Escudo N con la regla en uso. */
export function shieldText(n: number, rule: Config['shieldBreak']): string {
  const breaks = n <= 1 ? 'el primer golpe lo rompe' : `frena los golpes de menos de ${n}; uno de ${n} o más lo rompe`;
  const rest = rule === 'absorb' ? ', pero ese golpe se pierde' : rule === 'full' ? ' y entra entero' : ` y entra lo que pase de ${n}`;
  return `${breaks}${rest}.`;
}

/** Un renglón de habilidad: la palabra clave y, si dispara algo, el efecto. */
export interface Ability {
  /** Vacío en el efecto de un hechizo (no lleva nombre). */
  key: string;
  text: string | null;
  /** Ya se usó (un Aguante gastado): se muestra apagado. */
  spent?: boolean;
}

function effectLine(list: Effect[]): string {
  let named: string | null = null;
  return list.map((e) => {
    const target = 'target' in e ? e.target : null;
    const txt = effectText(e, target !== null && (target.startsWith('chosen') ? named?.startsWith('chosen') ?? false : named === target && target === 'selfAtEdge'));
    if (target && (target.startsWith('chosen') || target === 'selfAtEdge')) named = target;
    return txt;
  }).join(' y ');
}

/** Las habilidades de una carta, en orden: primero las que van solas, después las que disparan algo. */
export function describeCard(id: string): Ability[] {
  const c = card(id);
  const out: Ability[] = [];
  const effects = c.effects ?? {};
  if (c.fast) out.push({ key: 'Rápido', text: null });
  if (c.kind === 'unit') {
    if (c.guard) out.push({ key: 'Guardián', text: null });
    if (c.charge) out.push({ key: 'Carga', text: null });
    if (c.rush) out.push({ key: 'Embestida', text: null });
    if (c.stealth) out.push({ key: 'Sigilo', text: null });
    if (c.poison) out.push({ key: 'Veneno', text: null });
    if (c.lifesteal) out.push({ key: 'Robo de vida', text: null });
    if (c.energy && c.energy > 1) out.push({ key: `Energía ${c.energy}`, text: null });
    if (c.lastStand && !effects.lastStand) out.push({ key: 'Aguante', text: null });
    if (c.powerBonus) out.push({ key: `Poder +${c.powerBonus}`, text: null });
    if (c.powerPoison) out.push({ key: 'Poder con Veneno', text: null });
    if (c.aura) out.push({ key: 'Mientras esté viva', text: `las de los costados tienen ${buffText(c.aura.dmg, c.aura.hp)}.` });
  }
  for (const t of Object.keys(TRIGGERS) as Trigger[]) {
    const list = effects[t];
    if (!list) continue;
    const body = effectLine(list);
    out.push(TRIGGERS[t] ? { key: TRIGGERS[t], text: `${body}.` } : { key: '', text: `${capital(body)}.` });
  }
  if (c.kind === 'unit' && c.evolves) {
    const e = unitCard(c.evolves.into);
    out.push({ key: `Evoluciona en T${c.evolves.turn}`, text: `se vuelve ${e.name} (rango ${e.rank}, ${cardStats(e)}).` });
  }
  return out;
}

/** Lo mismo para una unidad en juego: refleja silencio, Guardián perdido, Aguante gastado y evolución. */
export function describeUnit(u: Unit): Ability[] {
  if (u.silenced) return [{ key: 'Silenciada', text: 'sin habilidades.' }];
  const c = unitCard(u.card);
  const out: Ability[] = [];
  if (u.frozen) out.push({ key: 'Congelada', text: null });
  // lo que le dieron (la Carga de la Proscrita, el Robo de vida del Gran cazador)
  if (u.charge && !c.charge) out.push({ key: 'Carga', text: null });
  if (u.lifesteal && !c.lifesteal) out.push({ key: 'Robo de vida', text: null });
  for (const a of describeCard(u.card)) {
    if (a.key === 'Guardián' && !u.guard) continue;
    if (a.key === 'Sigilo' && !u.stealth) continue;
    if (a.key.startsWith('Energía')) continue;
    if (a.key.startsWith('Evoluciona') && !u.evolves) continue;
    out.push(a.key === 'Aguante' && c.lastStand && !u.lastStand ? { ...a, spent: true } : a);
  }
  // la energía puede haber cambiado: va la actual, con las que van solas
  if (u.maxEnergy > 1) out.splice(out.filter((a) => a.text === null).length, 0, { key: `Energía ${u.maxEnergy}`, text: null });
  return out;
}

/** La explicación de la palabra clave de una habilidad, si tiene. */
export function explain(key: string): string | null {
  const base = Object.keys(KEYWORDS).find((k) => key.startsWith(k));
  return base ? KEYWORDS[base] : null;
}
