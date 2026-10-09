// Mouse y teclado.
// El mouse hace todo: elegir carta, elegir objetivo, seleccionar una unidad tuya y tocar a quién
// atacar. Atajos: 1 a 9 eligen carta de la mano; ← y → mueven el lugar donde va; Espacio o Enter la
// ubican, juegan lo elegido o terminan el turno; P usa el poder del héroe; S cambia el sonido; Escape suelta la
// selección (o vuelve a la mesa, o abre el menú); Z deshace; M muestra los mazos; H (o L) el historial; R las
// reglas; N arranca otra partida igual.

export interface InputEvents {
  move(clientX: number, clientY: number): void;
  click(clientX: number, clientY: number): void;
  pickKey(index: number): void;
  /** Corre el lugar de la carta que se está ubicando. */
  nudge(delta: number): void;
  endTurn(): void;
  /** El poder del héroe del que ataca. */
  power(): void;
  /** Sonido: todo, solo efectos o nada. */
  sound(): void;
  cancel(): void;
  undo(): void;
  decks(): void;
  log(): void;
  rules(): void;
  newGame(): void;
}

export class Input {
  constructor(private ev: InputEvents, target: HTMLElement, private blocked: () => boolean) {
    target.addEventListener('mousemove', (e) => this.ev.move(e.clientX, e.clientY));
    target.addEventListener('mouseleave', () => this.ev.move(-1e4, -1e4));
    target.addEventListener('click', (e) => this.ev.click(e.clientX, e.clientY));
    target.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.ev.cancel();
    });
    addEventListener('keydown', (e) => this.keydown(e));
  }

  private keydown(e: KeyboardEvent): void {
    // escribiendo en el panel, el teclado es del panel
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.repeat) return;
    // con el menú o el cartel del final abiertos, solo Escape (para volver a la partida)
    if (this.blocked() && e.code !== 'Escape') return;
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
        this.ev.pickKey(Number(e.code.slice(-1)) - 1);
        break;
      case 'Space': case 'Enter': case 'NumpadEnter':
        this.ev.endTurn();
        e.preventDefault();
        break;
      case 'KeyP': this.ev.power(); break;
      case 'KeyS': this.ev.sound(); break;
      case 'ArrowLeft': this.ev.nudge(-1); break;
      case 'ArrowRight': this.ev.nudge(1); break;
      case 'Escape': this.ev.cancel(); break;
      case 'KeyZ': this.ev.undo(); break;
      case 'KeyM': this.ev.decks(); break;
      case 'KeyL': case 'KeyH': this.ev.log(); break;
      case 'KeyR': this.ev.rules(); break;
      case 'KeyN': this.ev.newGame(); break;
    }
  }
}
