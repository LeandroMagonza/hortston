// Las pantallas en DOM, por encima del canvas, con el estilo de las de GolfKnight: el menú de inicio
// (rival, mazos, héroes y reglas en prueba), el cartel del final, el historial de la partida y las reglas.
import { card, DECKS } from './core/cards';
import { HERO_ORDER, HEROES, POWER_MIN, powerText } from './core/heroes';
import { DEFAULT_CONFIG, SUMMON_TURNS } from './core/rules';
import { cardStats } from './core/text';
import { iconSvg } from './game/icon';
import type { AttackRecord, Config, Result, Side, State, TurnRecord, UnitTag } from './core/types';

export interface Setup {
  opponent: 'ai' | 'human';
  decks: [string, string];
  /** El héroe de cada uno (null: sin héroe). */
  heroes: [string | null, string | null];
  config: Config;
}

/** v6: héroes (lo guardado antes no se usa). */
const KEY = 'hortston.setup.v6';
/**
 * Las reglas por defecto: cuando cambian (3: atacar al héroe a mano), las reglas guardadas vuelven a las
 * nuevas una vez; los mazos y los héroes elegidos quedan.
 */
const RULES = 3;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`falta #${id}`);
  return el as T;
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Menu {
  private menuEl = $('menu');
  private endEl = $('end');
  private logEl = $('logbox');
  private logList = $('log');
  /** Lo último que se dibujó en el historial, para no rehacerlo si no cambió nada. */
  private logged = '';
  private setup: Setup;
  onPlay: ((s: Setup) => void) | null = null;
  onResume: (() => void) | null = null;
  onRematch: (() => void) | null = null;

  constructor() {
    this.setup = this.load();
    this.renderDecks();
    this.renderHeroes();
    this.writeRules();
    document.querySelectorAll<HTMLButtonElement>('#menu .mode').forEach((b) => {
      b.addEventListener('click', () => {
        this.setup.opponent = b.dataset.mode as Setup['opponent'];
        this.renderModes();
      });
    });
    this.renderModes();
    $('play').addEventListener('click', () => this.onPlay?.(this.read()));
    for (const id of ['priestHeal', 'powerMode']) {
      $(id).addEventListener('change', () => {
        this.read();
        this.renderHeroes();
      });
    }
    $('resume').addEventListener('click', () => this.onResume?.());
    $('howto').addEventListener('click', () => this.showRules());
    $('rematch').addEventListener('click', () => this.onRematch?.());
    $('endlog').addEventListener('click', () => this.toggleLog());
    $('tomenu').addEventListener('click', () => {
      this.endEl.hidden = true;
      this.show(false);
    });
    $('closelog').addEventListener('click', () => this.toggleLog(false));
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog')?.close()));
  }

  get open(): boolean {
    return !this.menuEl.hidden || !this.endEl.hidden || !!document.querySelector('dialog[open]');
  }

  /** El menú. `inGame`: hay una partida en curso que se puede seguir. */
  show(inGame: boolean): void {
    $('resume').hidden = !inGame;
    this.toggleLog(false);
    this.menuEl.hidden = false;
  }

  hide(): void {
    this.menuEl.hidden = true;
  }

  showRules(): void {
    $<HTMLDialogElement>('rules').showModal();
  }

  toggleLog(force?: boolean): void {
    this.logEl.hidden = force === undefined ? !this.logEl.hidden : !force;
    if (!this.logEl.hidden) this.logList.scrollTop = this.logList.scrollHeight;
  }

  showEnd(s: State, vsAI: boolean): void {
    const r = s.result as Result;
    const name = (j: 0 | 1) => s.players[j].name;
    let title = 'EMPATE';
    if (r.winner !== null) title = vsAI ? (r.winner === 0 ? '¡GANASTE!' : 'PERDISTE') : `¡GANA ${name(r.winner).toUpperCase()}!`;
    $('endtitle').textContent = title;
    $('endtitle').className = `title ${r.winner === null ? '' : r.winner === 0 ? 'p0' : 'p1'}`;
    const final = s.cfg.scoring === 'final';
    const dead = ([0, 1] as const).filter((j) => r.life[j] <= 0);
    $('endsub').textContent = final
      ? (r.early ? 'Alguien se quedó sin vida antes del final.' : 'Al final, cada unidad viva le pegó su nivel a la vida del rival.')
      : dead.length === 2 ? 'Los dos llegaron a 0: gana el que quedó más arriba.'
      : dead.length === 1 ? `${name(dead[0])} llegó a 0 de vida.` : 'Se terminaron las rondas: gana el que tiene más vida.';
    $('endscores').innerHTML = [0, 1].map((j) => {
      const side = j as 0 | 1;
      const hit = final ? `<div class="hit">golpe final: ${r.finalDamage[side]}</div>` : '';
      return `<div class="score p${side}"><div class="who">${esc(name(side))}</div><div class="life">❤ ${r.life[side]}</div>${hit}</div>`;
    }).join('<div class="vs">VS</div>');
    this.endEl.hidden = false;
  }

  hideEnd(): void {
    this.endEl.hidden = true;
  }

  // ───────────────────────── historial ─────────────────────────

  /** El historial de la partida, turno por turno. Se rehace solo si cambió algo. */
  renderLog(s: State, force = false): void {
    const key = `${s.log.length}:${s.record.length}`;
    if (!force && key === this.logged) return;
    this.logged = key;
    const open = new Set([...this.logList.querySelectorAll<HTMLDetailsElement>('details[open]')].map((d) => d.dataset.id));
    this.logList.innerHTML = s.record.map((r) => turnHtml(s, r)).join('') + (s.result ? endHtml(s) : '');
    // los ataques que estaban abiertos siguen abiertos
    this.logList.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
      if (open.has(d.dataset.id)) d.open = true;
    });
    this.logList.scrollTop = this.logList.scrollHeight;
  }

  // ───────────────────────── menú de inicio ─────────────────────────

  private renderModes(): void {
    document.querySelectorAll<HTMLButtonElement>('#menu .mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.setup.opponent));
    $('who1').textContent = this.setup.opponent === 'ai' ? 'IA · arriba' : 'J2 · arriba';
    $('who0').textContent = this.setup.opponent === 'ai' ? 'Vos · abajo' : 'J1 · abajo';
  }

  private renderDecks(): void {
    for (const side of [0, 1] as const) {
      const box = $(`decks${side}`);
      box.innerHTML = Object.values(DECKS).map((d) => `
        <button class="deck${this.setup.decks[side] === d.id ? ' on' : ''}" data-deck="${d.id}">
          <span class="art">${iconSvg(`mazo_${d.id}`)}</span><span class="name">${esc(d.name)}</span><span class="blurb">${esc(d.blurb)}</span>
        </button>`).join('');
      box.querySelectorAll<HTMLButtonElement>('.deck').forEach((b) => b.addEventListener('click', () => {
        this.setup.decks[side] = b.dataset.deck!;
        this.renderDecks();
      }));
    }
  }

  /** Los héroes de cada lado: uno por botón, más «sin héroe»; abajo, qué hace el elegido. */
  private renderHeroes(): void {
    for (const side of [0, 1] as const) {
      const box = $(`heroes${side}`);
      const ids: (string | null)[] = [...HERO_ORDER, null];
      box.innerHTML = ids.map((id) => {
        const h = id ? HEROES[id] : null;
        const on = this.setup.heroes[side] === id;
        return `<button class="hero${on ? ' on' : ''}" data-hero="${id ?? ''}" title="${esc(h ? `${h.name}: ${h.power.name}` : 'Sin héroe')}">
          <span class="art">${h ? iconSvg(`heroe_${h.id}`) : '∅'}</span><span class="name">${esc(h ? h.name : 'Sin héroe')}</span></button>`;
      }).join('');
      box.querySelectorAll<HTMLButtonElement>('.hero').forEach((b) => b.addEventListener('click', () => {
        this.setup.heroes[side] = b.dataset.hero || null;
        this.renderHeroes();
      }));
      const id = this.setup.heroes[side];
      const desc = $(`herodesc${side}`);
      if (!id) {
        desc.innerHTML = '<b>Sin héroe</b>: sin poder ni carta de clase (para comparar).';
        continue;
      }
      const h = HEROES[id];
      const mode = this.setup.config.powerMode;
      const off = mode === 'off';
      const fixed = mode === 'fixed' || mode === 'mana';
      const price = mode === 'mana' ? ' (cuesta 1 de maná, una vez por ataque)' : ` (cuesta ${POWER_MIN})`;
      const x = mode === 'mana' ? 1 : fixed ? POWER_MIN : null;
      // las nueve cartas de clase, en corto: el turno y el dibujo (el nombre, al pasar el mouse)
      const cards = h.cards.map((cid) => {
        const c = card(cid);
        return `<i title="${esc(`T${c.rank} ${c.name}${c.kind === 'spell' ? ' (hechizo)' : ''}`)}">${c.rank}${iconSvg(cid)}</i>`;
      }).join(' ');
      desc.innerHTML = `<b>${iconSvg(`poder_${h.power.kind}`)} ${esc(h.power.name)}</b>${off ? ' (apagado)' : fixed ? price : ''}: ${esc(powerText(id, x, 0, this.setup.config))}<br><span>${esc(h.blurb)} Cartas de clase: ${cards}</span>`;
    }
  }

  private load(): Setup {
    const base: Setup = { opponent: 'ai', decks: ['salvajes', 'pradera'], heroes: ['mago', 'cazador'], config: { ...DEFAULT_CONFIG } };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Setup & { rules?: number }) | null;
      if (saved) {
        const decks = saved.decks?.every((d) => DECKS[d]) ? saved.decks : base.decks;
        const heroes = saved.heroes?.length === 2 && saved.heroes.every((h) => h === null || HEROES[h]) ? saved.heroes : base.heroes;
        const config = saved.rules === RULES ? { ...base.config, ...saved.config } : base.config;
        return { opponent: saved.opponent ?? base.opponent, decks: [...decks] as [string, string], heroes: [...heroes] as Setup['heroes'], config };
      }
    } catch {
      // sin almacenamiento: valores por defecto
    }
    return base;
  }

  private writeRules(): void {
    const c = this.setup.config;
    $<HTMLSelectElement>('cards').value = c.cards;
    $<HTMLSelectElement>('pickMode').value = c.pickMode;
    $<HTMLSelectElement>('scoring').value = c.scoring;
    $<HTMLSelectElement>('faceValue').value = c.faceValue;
    $<HTMLSelectElement>('maxAttacks').value = String(c.maxAttacks);
    $<HTMLSelectElement>('priestHeal').value = c.priestHeal;
    $<HTMLSelectElement>('powerMode').value = c.powerMode;
    $<HTMLSelectElement>('summonSick').value = c.summonSick ? 'yes' : 'no';
    $<HTMLSelectElement>('firstAttacker').value = String(c.firstAttacker);
    $<HTMLSelectElement>('firstToResolve').value = c.firstToResolve;
    $<HTMLSelectElement>('shieldRenews').value = c.shieldRenews ? 'yes' : 'no';
    $<HTMLSelectElement>('shieldBreak').value = c.shieldBreak;
    $<HTMLSelectElement>('extraRounds').value = String(c.extraRounds);
    $<HTMLInputElement>('startingLife').value = String(c.startingLife);
  }

  /** Lee el menú (y lo recuerda para la próxima vez). */
  read(): Setup {
    this.setup.config = {
      cards: $<HTMLSelectElement>('cards').value as Config['cards'],
      pickMode: $<HTMLSelectElement>('pickMode').value as Config['pickMode'],
      scoring: $<HTMLSelectElement>('scoring').value as Config['scoring'],
      faceValue: $<HTMLSelectElement>('faceValue').value as Config['faceValue'],
      maxAttacks: Number($<HTMLSelectElement>('maxAttacks').value),
      priestHeal: $<HTMLSelectElement>('priestHeal').value as Config['priestHeal'],
      powerMode: $<HTMLSelectElement>('powerMode').value as Config['powerMode'],
      summonSick: $<HTMLSelectElement>('summonSick').value === 'yes',
      firstAttacker: Number($<HTMLSelectElement>('firstAttacker').value) as 0 | 1,
      firstToResolve: $<HTMLSelectElement>('firstToResolve').value as Config['firstToResolve'],
      shieldRenews: $<HTMLSelectElement>('shieldRenews').value === 'yes',
      shieldBreak: $<HTMLSelectElement>('shieldBreak').value as Config['shieldBreak'],
      extraRounds: Number($<HTMLSelectElement>('extraRounds').value),
      startingLife: Math.max(1, Number($<HTMLInputElement>('startingLife').value) || DEFAULT_CONFIG.startingLife),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.setup, rules: RULES }));
    } catch {
      // no se guarda, no pasa nada
    }
    return { ...this.setup, decks: [...this.setup.decks] as [string, string], heroes: [...this.setup.heroes] as Setup['heroes'], config: { ...this.setup.config } };
  }
}

// ───────────────────────── historial: html ─────────────────────────

function who(s: State, side: Side): string {
  return `<b class="p${side}">${esc(s.players[side].name)}</b>`;
}

function unitHtml(u: UnitTag): string {
  return `<b class="p${u.side}">${iconSvg(u.card)} ${esc(u.name)}</b>`;
}

/** La carta que jugó alguien: dibujo, nombre y números. */
function playHtml(s: State, side: Side, id: string | null): string {
  if (!id) return '';
  const c = card(id);
  const stats = c.kind === 'unit' ? cardStats(c) : 'hechizo';
  return `<div class="play p${side}"><span class="art">${iconSvg(id)}</span><span><b>${esc(c.name)}</b> <i>${esc(stats)}</i><small>${esc(s.players[side].name)}</small></span></div>`;
}

function attackHtml(a: AttackRecord, id: string): string {
  const fate = (u: UnitTag, hp: number | null) => (hp === null ? `<span class="dead">✝ ${esc(u.name)} muere</span>`
    : u.hero && hp <= 0 ? `<span class="dead">${esc(u.name)} llega a 0</span>` : `${esc(u.name)} queda en ${hp}`);
  const also = a.also.length ? ` · <span class="dead">también ${esc(a.also.join(', '))}</span>` : '';
  const steps = a.steps.map((t) => `<div>${esc(t)}</div>`).join('');
  return `<details class="atk" data-id="${id}"><summary>${unitHtml(a.a)} ⚔ ${unitHtml(a.d)}<div class="fate">${fate(a.d, a.dHp)} · ${fate(a.a, a.aHp)}${also}</div></summary><div class="steps">${steps}</div></details>`;
}

function turnHtml(s: State, r: TurnRecord): string {
  const summon = r.turn <= SUMMON_TURNS;
  const anyPlay = r.plays[0].length > 0 || r.plays[1].length > 0;
  const done = r.units !== null;
  const head = `<div class="th"><span class="tn">${summon ? `Turno ${r.turn}` : `Ronda ${r.turn}${anyPlay ? '' : ' · sin cartas'}`}</span><span>⚔ ataca ${who(s, r.attacker)}</span></div>`;
  // lo que jugó cada uno (con mano, pueden ser varias o ninguna)
  const col = (j: Side) => (r.plays[j].length ? r.plays[j].map((id) => playHtml(s, j, id)).join('') : `<div class="play p${j} nothing">${esc(s.players[j].name)}: nada</div>`);
  const plays = anyPlay ? `<div class="plays"><div>${col(0)}</div><div>${col(1)}</div></div>` : summon && !done ? '<div class="none">Eligiendo cartas…</div>' : '';
  const powerIcon = (side: Side) => {
    const h = s.players[side].hero;
    return h ? `${iconSvg(`poder_${HEROES[h].power.kind}`)} ` : '';
  };
  const powers = r.powers.map((p) => `<div class="pw">${who(s, p.side)} usa ${powerIcon(p.side)}${esc(p.text)}</div>`).join('');
  const attacks = r.attacks.length
    ? r.attacks.map((a, i) => attackHtml(a, `${r.turn}-${i}`)).join('')
    : done && !r.powers.length ? '<div class="none">No atacó.</div>' : '';
  const what = s.cfg.scoring === 'final' ? 'golpe final' : s.cfg.scoring === 'difference' ? 'mesa' : 'pega';
  const board = r.units && r.power
    ? `<div class="board">Quedan: ${who(s, 0)} ${r.units[0]} (${what} ${r.power[0]}) · ${who(s, 1)} ${r.units[1]} (${r.power[1]})</div>`
    : '';
  const lifeOf = (j: Side) => {
    const now = r.life![j], lost = r.lifeStart[j] - now;
    return `${who(s, j)} ${now}${lost > 0 ? ` <span class="dead">(−${lost})</span>` : lost < 0 ? ` (+${-lost})` : ''}`;
  };
  const life = r.life && (r.life[0] !== r.lifeStart[0] || r.life[1] !== r.lifeStart[1])
    ? `<div class="board">❤ Vida: ${lifeOf(0)} · ${lifeOf(1)}</div>`
    : '';
  return `<div class="t">${head}${plays}${powers}${attacks}${board}${life}</div>`;
}

function endHtml(s: State): string {
  const r = s.result!;
  const res = r.winner === null ? 'Empate' : `Gana ${who(s, r.winner)}`;
  const hit = s.cfg.scoring === 'final' ? `<div>Golpe final: ${who(s, 0)} ${r.finalDamage[0]} · ${who(s, 1)} ${r.finalDamage[1]}</div>` : '';
  return `<div class="t end"><div class="th"><span class="tn">Final</span></div>${hit}<div>Vida: ${who(s, 0)} ${r.life[0]} · ${who(s, 1)} ${r.life[1]}. ${res}.</div></div>`;
}
