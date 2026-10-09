// Los tipos del juego. Todo lo de core/ es lógica pura y determinista: sin canvas ni DOM, para poder
// simular partidas enteras (la IA, el simulador y los tests usan el mismo motor que la pantalla).

export type Side = 0 | 1;

/**
 * Las armas: el arco (para atacar de lejos) y las de cuerpo a cuerpo en el orden en que pegan: la
 * lanza, el arma principal y el cuchillo. El arma principal es una del triángulo (espada, hacha, maza)
 * o el ataque simple (`attack`), que no le gana a nada: los dos pegan a la vez. Una unidad puede tener
 * varias, cada una con su propio valor: no hay un daño general. Principal, a lo sumo una.
 */
export type Weapon = 'bow' | 'spear' | 'attack' | 'sword' | 'axe' | 'mace' | 'knife';
export type Triad = 'sword' | 'axe' | 'mace';
export type Damage = Record<Weapon, number>;

/** Cuándo se dispara un efecto. `onPlay` es el de los hechizos; el resto, de unidades. */
export type Trigger =
  | 'onSummon' | 'onPlay' | 'beforeFight' | 'afterFight' | 'afterCombat'
  | 'onDeath' | 'onCombatDeath' | 'lastStand'
  /** Al terminar cada turno, después del combate (haya peleado o no). */
  | 'endTurn'
  /** Cada vez que recibe daño y sobrevive. */
  | 'onDamaged'
  /** Cuando le pega a la vida del rival (atacándolo; con la regla de antes, porque no atacó). */
  | 'onFace'
  /** Cuando muere otra unidad del mismo dueño. */
  | 'onAllyDeath'
  /** Cuando su dueño usa el poder del héroe. */
  | 'onPower';

/**
 * A quién le pega un efecto. Los automáticos se resuelven siempre igual (sin azar); los `chosen*` los
 * elige el jugador cuando la carta entra. Una carta tiene a lo sumo una elección: si varios efectos
 * dicen `chosen*`, van todos al mismo objetivo.
 */
export type TargetKind =
  | 'self' | 'otherAllies' | 'allAllies' | 'allEnemies' | 'allUnits' | 'allOthers'
  /** Por posición en la fila de la carta: las dos de al lado, o todas las de un lado. */
  | 'adjacent' | 'leftAllies' | 'rightAllies'
  /** Ella misma, si quedó en una punta de su fila. */
  | 'selfAtEdge'
  | 'strongestEnemy' | 'weakestEnemy' | 'newestEnemy' | 'rival'
  | 'chosenEnemy' | 'chosenAlly' | 'chosenUnit'
  /** Una enemiga a elección y las de sus costados en su fila. */
  | 'chosenEnemyAndSides'
  /** Una enemiga a elección que esté herida (o sin heridas). */
  | 'chosenDamagedEnemy' | 'chosenUndamagedEnemy'
  | 'enemyPlayer' | 'ownPlayer';

export type Effect =
  | { type: 'damage'; n: number; target: TargetKind }
  /** `dmg` se suma a cada arma que la unidad ya tiene. */
  | { type: 'buff'; dmg: number; hp: number; target: TargetKind }
  | { type: 'heal'; n: number; target: TargetKind }
  | { type: 'shield'; n: number; target: TargetKind }
  | { type: 'breakShield'; target: TargetKind }
  | { type: 'armor'; n: number; target: TargetKind }
  | { type: 'silence'; target: TargetKind }
  | { type: 'banish'; target: TargetKind }
  | { type: 'destroy'; target: TargetKind }
  /** Si está herida, la destruye; si no, le hace `n` de daño. */
  | { type: 'execute'; n: number; target: TargetKind }
  /** `per: 'enemy'`: una por cada unidad enemiga (y `count` no se usa). */
  | { type: 'summon'; card: string; count: number; per?: 'enemy' }
  /** Congelar: no ataca ni le pega a la vida en el próximo combate de su dueño. */
  | { type: 'freeze'; target: TargetKind }
  /** Duplica la vida que tiene. */
  | { type: 'double'; target: TargetKind }
  /** Pasa a ser tuya (entra recién llegada). */
  | { type: 'steal'; target: TargetKind }
  /** El dueño gana energía (la del poder del héroe). */
  | { type: 'energy'; n: number }
  /** Invoca el próximo tótem del dueño, con esa vida (ver el poder del Chamán). */
  | { type: 'totem'; hp: number }
  /** Le da una palabra clave. */
  | { type: 'grant'; what: Keyword; target: TargetKind };

/** Las palabras clave que se pueden dar con un efecto. */
export type Keyword = 'charge' | 'rush' | 'stealth' | 'lifesteal' | 'guard' | 'poison';

interface CardBase {
  id: string;
  name: string;
  /** Un emoji, para los textos (el dibujo de la carta es un ícono: src/game/iconos.ts). */
  art: string;
  /** El turno de la carta. En las unidades, además, el daño que hacen al final si siguen vivas. */
  rank: number;
  /** Rápido: si una sola de las dos cartas del turno lo es, se resuelve primero. */
  fast?: boolean;
  /** Carta de clase: la tiene solo ese héroe (le llega con las del mazo en el turno de la carta). */
  hero?: string;
  effects?: Partial<Record<Trigger, Effect[]>>;
}

export interface UnitCard extends CardBase {
  kind: 'unit';
  hp: number;
  dmg: Partial<Damage>;
  /** Frena los golpes menores que este valor; uno igual o mayor lo rompe (ver `Config.shieldBreak`). */
  shield?: number;
  /** Lo que le resta a cada golpe. */
  armor?: number;
  guard?: boolean;
  /** Carga: puede atacar el turno en que entra (con `Config.summonSick`). */
  charge?: boolean;
  /** Veneno: si le hace daño a una unidad peleando, la mata. */
  poison?: boolean;
  /** Ataques por turno (1 si no dice). */
  energy?: number;
  /** Aguante: la primera vez que moriría, queda en 1 de vida (y dispara su efecto `lastStand`, si tiene). */
  lastStand?: boolean;
  /** Si sigue viva al inicio de ese turno, se transforma en `into`. */
  evolves?: { turn: number; into: string };
  /** Mientras esté viva, el poder del héroe se usa como si tuvieras esa energía de más. */
  powerBonus?: number;
  /** Mientras esté viva, el poder del héroe tiene Veneno. */
  powerPoison?: boolean;
  /** Robo de vida: el daño que hace (peleando o a la vida del rival) le cura lo mismo a su dueño. */
  lifesteal?: boolean;
  /** Embestida: puede atacar unidades el turno en que entra (pero ese turno no le pega a la vida). */
  rush?: boolean;
  /** Sigilo: no se la puede atacar ni elegir como objetivo hasta que ataca. */
  stealth?: boolean;
  /** Mientras esté viva, las de sus costados tienen esto de más (lo pierden si muere o se separan). */
  aura?: { dmg: number; hp: number };
  /** No está en ningún mazo: la invoca otra carta o sale de una evolución. */
  token?: boolean;
}

export interface SpellCard extends CardBase {
  kind: 'spell';
}

export type Card = UnitCard | SpellCard;

export interface Deck {
  id: string;
  name: string;
  art: string;
  blurb: string;
  /** Una fila por turno, con las tres cartas de ese turno. */
  turns: string[][];
}

export interface Unit {
  uid: number;
  card: string;
  owner: Side;
  name: string;
  rank: number;
  dmg: Damage;
  hp: number;
  maxHp: number;
  /** El escudo (0 si está roto). `maxShield` es al que vuelve si el escudo se renueva. */
  shield: number;
  maxShield: number;
  armor: number;
  guard: boolean;
  charge: boolean;
  poison: boolean;
  energy: number;
  maxEnergy: number;
  lastStand: boolean;
  evolves: { turn: number; into: string } | null;
  silenced: boolean;
  /** El turno en que entró (con `Config.summonSick`, ese turno no ataca). */
  summonedTurn: number;
  /** Peleó este turno (para «tras el combate»). */
  fought: boolean;
  /** Le pegaron en la pelea en curso (para «al caer en combate»). */
  hitInCombat: boolean;
  /** Daño que tiene de más solo hasta el fin del turno (las Garras del Cazador de demonios). */
  bonus: number;
  lifesteal: boolean;
  rush: boolean;
  stealth: boolean;
  /** Congelada: no ataca ni le pega a la vida en el próximo combate de su dueño. */
  frozen: boolean;
  /** Lo que le dan ahora las auras de las de sus costados (ya sumado al ataque y a la vida). */
  aura: { dmg: number; hp: number };
}

export interface Config {
  /** Secuencial: el atacante elige a la vista y el defensor responde. Simultánea: los dos a ciegas. */
  pickMode: 'sequential' | 'simultaneous';
  /** Quién ataca en los turnos impares. */
  firstAttacker: Side;
  /** Quién resuelve primero su carta (salvo que una sola sea Rápida). */
  firstToResolve: 'attacker' | 'defender' | 'lowerLife';
  /** El escudo de todas vuelve al inicio de cada turno (si no, solo lo recuperan algunas cartas). */
  shieldRenews: boolean;
  /**
   * Qué pasa con el golpe que rompe el escudo: se pierde (`absorb`), entra entero (`full`) o entra lo
   * que pasa del escudo (`mitigated`).
   */
  shieldBreak: 'absorb' | 'full' | 'mitigated';
  /**
   * Cómo se le pega a la vida:
   * - `hero` (por defecto): como en Hearthstone, una unidad ataca al héroe rival como atacaría a una
   *   unidad (salvo que tenga un Guardián) y le pega su daño a la vida; el héroe no devuelve el golpe.
   *   Después del T9 se sigue peleando hasta que alguien llega a 0, con cansancio desde la ronda 10.
   * - `face`: al terminar tu turno de ataque, las tuyas que no atacaron le pegan solas a la vida del
   *   rival (salvo que tenga un Guardián). Mismo final.
   * - `difference`: al terminar cada turno, el que tiene menos en la mesa pierde la diferencia. Mismo final.
   * - `final`: nadie pierde vida en el medio; al final cada carta viva pega su nivel (lo del principio).
   */
  scoring: 'hero' | 'face' | 'difference' | 'final';
  /** Lo que pega una carta a la vida (y lo que cuenta en la mesa con `difference`): su daño o su nivel. */
  faceValue: 'attack' | 'rank';
  /** Con `scoring: 'final'`: rondas de combate sin invocar después del último turno de cartas. */
  extraRounds: number;
  /** La carta que entra no ataca ese turno (recién llegada), como en Hearthstone, salvo con Carga. */
  summonSick: boolean;
  /** Cuántos ataques hace el atacante por turno, entre todas sus unidades (0: sin límite). */
  maxAttacks: number;
  /**
   * Cómo se usa el poder del héroe:
   * - `mana` (por defecto): cuesta 1 del maná del turno, el mismo de las cartas, y se usa una vez en tu
   *   turno de ataque; hace siempre lo mismo (X = 1, los números de Hearthstone). Las cartas «de
   *   energía» dan maná para tu turno siguiente.
   * - `fixed`: energía aparte, que se junta (1 por turno); cuesta 2 y hace siempre lo mismo (X = 2); en
   *   tu ataque lo usás las veces que te alcance. Algunas cartas dan energía.
   * - `all`: gasta toda la energía (X) y crece con ella, desde 2 (otra vez solo si gana energía en el turno).
   * - `off`: sin poder (para medir los mazos y las cartas de clase solas).
   */
  powerMode: 'mana' | 'fixed' | 'all' | 'off';
  /** Cuánto cura el poder del Sacerdote con X de energía: X+1 (por defecto), 2X o X. */
  priestHeal: 'plus1' | 'double' | 'x';
  /**
   * Las cartas:
   * - `hand` (por defecto): una mano. En cada turno llegan las tres del turno y descartás una de ellas, en
   *   secreto; tenés tanto maná como el número del turno (hasta 9) y jugás las que quieras de tu mano
   *   mientras sumen hasta eso (el turno de cada carta es lo que cuesta). Lo que queda en la mano se
   *   puede jugar también después del turno 9.
   * - `turn`: solo las tres del turno, una por turno (lo de antes).
   */
  cards: 'hand' | 'turn';
  startingLife: number;
}

export type Phase = 'pick' | 'target' | 'combat' | 'discard' | 'end';

/** Una carta en la mano: cuál y en qué turno llegó (las de este turno son las nuevas). */
export interface HandCard {
  id: string;
  turn: number;
}

/**
 * Lo que juega alguien en un turno: cartas de su mano (por índice, en el orden en que se resuelven sus
 * efectos) y, de cada unidad, el lugar final en su fila (0 es la punta izquierda; −1 en los hechizos).
 */
export interface Play {
  cards: number[];
  places: number[];
}

/** Una carta jugada que espera resolver su efecto («al invocar» o hechizo). */
export interface QueuedPlay {
  side: Side;
  id: string;
  /** La unidad que entró (null si es un hechizo). */
  unit: number | null;
}

export interface PlayerState {
  name: string;
  deck: string;
  turns: string[][];
  /** Las cartas que tiene para jugar (sin mano, las del turno). */
  hand: HandCard[];
  /** Las que descartó (el rival no sabe cuáles: para él, puede tenerlas todavía). */
  gone: HandCard[];
  board: Unit[];
  graveyard: string[];
  life: number;
  /** El héroe (ver heroes.ts), o null para jugar sin poder. */
  hero: string | null;
  /**
   * Con el poder que cuesta maná (`powerMode: 'mana'`), el maná que le queda este turno (el de las cartas
   * y el poder). Con las otras reglas, la energía del poder, que se junta de un turno a otro.
   */
  energy: number;
  /** Maná de más para su turno siguiente (lo que dan las cartas «de energía», con `powerMode: 'mana'`). */
  boost: number;
  /** El turno en que usó el poder por última vez. */
  usedTurn: number;
  /** Cuántos tótems invocó (el próximo es el que sigue en la ronda). */
  totems: number;
}

/** Una elección de objetivo que está esperando al jugador. */
export interface PendingTarget {
  player: Side;
  card: string;
  /** La unidad que acaba de entrar (null si es un hechizo). */
  source: number | null;
  options: number[];
}

/** Lo que pasó, para que la pantalla lo anime. El texto para leer va aparte, en `log`. */
export type GameEvent =
  | { kind: 'turn'; turn: number; attacker: Side; summon: boolean }
  | { kind: 'summon'; uid: number; owner: Side }
  | { kind: 'spell'; card: string; owner: Side }
  | { kind: 'attack'; a: number; d: number }
  | { kind: 'damage'; uid: number; amount: number; blocked: boolean; weapon: Weapon | null }
  | { kind: 'buff'; uid: number; dmg: number; hp: number }
  | { kind: 'heal'; uid: number; amount: number }
  | { kind: 'shield'; uid: number }
  | { kind: 'shieldBreak'; uid: number }
  | { kind: 'silence'; uid: number }
  | { kind: 'lastStand'; uid: number }
  | { kind: 'evolve'; uid: number }
  | { kind: 'death'; unit: Unit }
  | { kind: 'banish'; unit: Unit }
  | { kind: 'life'; side: Side; amount: number }
  /** Una unidad le pega a la vida del rival: lo atacó (o, con la regla de antes, no atacó). */
  | { kind: 'face'; uid: number; side: Side; amount: number }
  /** Un héroe usa su poder con energía `x`. `target`: una unidad (uid) o un héroe (−1 J1, −2 J2). */
  | { kind: 'power'; side: Side; hero: string; target: number | null; x: number; cost: number }
  | { kind: 'energy'; side: Side; amount: number }
  | { kind: 'freeze'; uid: number }
  | { kind: 'final'; damage: [number, number] };

export interface LogEntry {
  turn: number;
  text: string;
  tone: '' | 'turn' | 'attack' | 'death' | 'effect' | 'summon';
}

/** Una unidad (o un héroe atacado) como se ve en el historial. */
export interface UnitTag {
  side: Side;
  name: string;
  /** El dibujo: el id de la carta, o el ícono del héroe (vacío si juega sin héroe). */
  card: string;
  /** Es el jugador, no una unidad. */
  hero?: boolean;
}

/** Un ataque, para el historial: quién contra quién y cómo quedaron. */
export interface AttackRecord {
  a: UnitTag;
  /** La atacada, o el héroe rival (`hero`). */
  d: UnitTag;
  /** La vida con que quedó cada uno (null: murió; del héroe, la del jugador). */
  aHp: number | null;
  dHp: number | null;
  /** Otras que murieron por efectos encadenados. */
  also: string[];
  /** Golpe por golpe, como en el registro. */
  steps: string[];
}

/** Un turno, para el historial de la partida. */
export interface TurnRecord {
  turn: number;
  attacker: Side;
  /** Las cartas que jugó cada uno. */
  plays: [string[], string[]];
  attacks: AttackRecord[];
  /** Los poderes del héroe que se usaron, en una línea cada uno. */
  powers: { side: Side; text: string }[];
  /** Cómo quedó la mesa al terminar el turno: cuántas unidades y cuánto pegarían al final. */
  units: [number, number] | null;
  power: [number, number] | null;
  /** La vida al empezar el turno y al terminarlo. */
  lifeStart: [number, number];
  life: [number, number] | null;
}

export interface Result {
  life: [number, number];
  /** El golpe final de cada uno (suma de rangos de sus unidades vivas). */
  finalDamage: [number, number];
  winner: Side | null;
  /** Alguien llegó a 0 de vida antes del final. */
  early: boolean;
}

export interface State {
  cfg: Config;
  turn: number;
  phase: Phase;
  attacker: Side;
  players: [PlayerState, PlayerState];
  /** Lo que eligió cada uno este turno (null: todavía no eligió). */
  picks: [Play | null, Play | null];
  /** Ya entraron las cartas del turno y estos efectos esperan resolverse, en orden (null: todavía no entraron). */
  queue: QueuedPlay[] | null;
  /** El objetivo elegido para la carta que se está resolviendo, de cada lado. */
  chosen: [number | null, number | null];
  pending: PendingTarget | null;
  /** Con mano, al empezar el turno: la carta nueva que descarta cada uno (−1: no le toca; null: falta elegir). */
  discards: [number | null, number | null];
  history: { turn: number; plays: [string[], string[]] }[];
  /** El historial de la partida, turno por turno (no se llena en las simulaciones de la IA). */
  record: TurnRecord[];
  /** Ataques hechos en el turno (para `Config.maxAttacks`). */
  attacksMade: number;
  nextUid: number;
  log: LogEntry[];
  events: GameEvent[];
  /** Sin log ni eventos: las simulaciones de la IA no los necesitan. */
  quiet: boolean;
  result: Result | null;
}
