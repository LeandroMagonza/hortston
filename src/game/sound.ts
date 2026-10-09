// Sonido: efectos y música, sintetizados con Web Audio (sin archivos de audio).
//
// Los efectos salen de los eventos del motor, en el mismo momento en que se anima cada uno (la embestida,
// el golpe, la muerte…), y cada poder de héroe tiene el suyo. La música es un loop tranquilo de taberna
// (La menor: Am, F, C, G), con un colchón de acordes, un arpegio punteado y un bajo; se arma nota por
// nota con un programador que mira un poco hacia adelante. El navegador no deja sonar nada hasta que
// tocás algo: el primer click o tecla lo habilita (`unlock`).
//
// S cambia entre «todo», «solo efectos» y «nada»; se recuerda para la próxima vez.
import type { PowerKind } from '../core/heroes';

export type Sfx =
  | 'click' | 'pick' | 'summon' | 'spell' | 'attack' | 'hit' | 'block' | 'death' | 'heal' | 'buff' | 'shield'
  | 'freeze' | 'silence' | 'face' | 'turn' | 'energy' | 'win' | 'lose';

export type SoundMode = 'all' | 'sfx' | 'off';

const KEY = 'hortston.sound';
const MUSIC_VOL = 0.16;
const SFX_VOL = 0.5;

/** Las notas en Hz (La 4 = 440). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** La progresión: cada acorde dura dos compases. Notas MIDI: raíz del bajo y el acorde. */
const CHORDS = [
  { bass: 45, notes: [57, 60, 64] }, // La menor
  { bass: 41, notes: [57, 60, 65] }, // Fa
  { bass: 48, notes: [55, 60, 64] }, // Do
  { bass: 43, notes: [55, 59, 62] }, // Sol
];
const BPM = 84;
/** El arpegio de cada compás (índices sobre las notas del acorde, +3 es una octava arriba), en corcheas. */
const ARP = [[0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 3, 4, 3, 2, 1, 2]];

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private timer: number | null = null;
  /** Por dónde va la música: el próximo octavo de compás a programar y cuándo suena. */
  private step = 0;
  private nextAt = 0;
  mode: SoundMode = 'all';

  constructor() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'all' || saved === 'sfx' || saved === 'off') this.mode = saved;
    } catch {
      // sin almacenamiento: todo prendido
    }
  }

  /** Arranca el audio (hace falta un click o una tecla antes). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      // ruido blanco fijo (siempre el mismo: también acá, sin azar)
      let x = 12345;
      for (let i = 0; i < len; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (x / 0x7fffffff) * 2 - 1;
      }
      this.apply();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.syncMusic();
  }

  /** Pasa a la próxima opción (todo → solo efectos → nada) y la recuerda. */
  cycle(): SoundMode {
    this.mode = this.mode === 'all' ? 'sfx' : this.mode === 'sfx' ? 'off' : 'all';
    try {
      localStorage.setItem(KEY, this.mode);
    } catch {
      // no se guarda, no pasa nada
    }
    this.apply();
    this.syncMusic();
    return this.mode;
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus!.gain.setTargetAtTime(this.mode === 'off' ? 0 : SFX_VOL, t, 0.05);
    this.musicBus!.gain.setTargetAtTime(this.mode === 'all' ? MUSIC_VOL : 0, t, 0.3);
  }

  // ───────────────────────── efectos ─────────────────────────

  /** Un efecto, dentro de `delayMs`. Los repetidos muy juntos (diez golpes a la vez) suenan una vez. */
  play(name: Sfx, delayMs = 0): void {
    if (!this.ctx || this.mode === 'off') return;
    const when = this.ctx.currentTime + Math.max(0, delayMs) / 1000;
    const prev = this.last.get(name) ?? -1;
    if (Math.abs(when - prev) < 0.045) return;
    this.last.set(name, when);
    const t = when;
    switch (name) {
      case 'click': this.tone(880, 0.05, 'sine', 0.15, t, { to: 1100 }); break;
      case 'pick': this.tone(660, 0.07, 'triangle', 0.22, t, { to: 990 }); break;
      case 'summon':
        this.noise(0.12, t, { freq: 400, type: 'lowpass', gain: 0.35 });
        this.tone(196, 0.18, 'triangle', 0.3, t, { to: 294 });
        this.tone(587, 0.12, 'sine', 0.12, t + 0.06);
        break;
      case 'spell':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.16, t + i * 0.05));
        this.noise(0.4, t, { freq: 3000, type: 'highpass', gain: 0.06 });
        break;
      case 'attack': this.noise(0.18, t, { freq: 500, to: 2400, type: 'bandpass', gain: 0.45, q: 1.5 }); break;
      case 'hit':
        this.tone(140, 0.14, 'sine', 0.5, t, { to: 55 });
        this.noise(0.05, t, { freq: 1800, type: 'lowpass', gain: 0.35 });
        break;
      case 'block':
        this.tone(1250, 0.18, 'triangle', 0.18, t);
        this.tone(1870, 0.14, 'sine', 0.1, t);
        break;
      case 'death':
        this.tone(320, 0.35, 'sawtooth', 0.16, t, { to: 70, filter: 900 });
        this.noise(0.3, t + 0.05, { freq: 600, type: 'lowpass', gain: 0.18 });
        break;
      case 'heal': this.tone(523, 0.25, 'sine', 0.18, t, { to: 784 }); this.tone(1047, 0.2, 'sine', 0.06, t + 0.08); break;
      case 'buff': this.tone(440, 0.09, 'triangle', 0.16, t); this.tone(660, 0.12, 'triangle', 0.16, t + 0.08); break;
      case 'shield': this.tone(988, 0.25, 'sine', 0.14, t, { trem: 18 }); break;
      case 'freeze':
        [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.08, t + i * 0.04, { trem: 24 }));
        this.noise(0.25, t, { freq: 6000, type: 'highpass', gain: 0.08 });
        break;
      case 'silence': this.tone(700, 0.25, 'sine', 0.14, t, { to: 350, filter: 1500 }); break;
      case 'face':
        this.tone(90, 0.3, 'sine', 0.6, t, { to: 45 });
        this.noise(0.18, t, { freq: 300, type: 'lowpass', gain: 0.4 });
        break;
      case 'turn':
        this.tone(392, 0.9, 'sine', 0.14, t);
        this.tone(784, 0.7, 'sine', 0.06, t);
        this.tone(587, 0.8, 'triangle', 0.05, t + 0.02);
        break;
      case 'energy': this.tone(1318, 0.12, 'sine', 0.1, t); this.tone(1760, 0.12, 'sine', 0.08, t + 0.05); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, t + i * 0.12)); break;
      case 'lose': [440, 392, 349, 262].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, t + i * 0.18)); break;
    }
  }

  /** El sonido del poder de cada héroe. */
  power(kind: PowerKind, delayMs = 0): void {
    if (!this.ctx || this.mode === 'off') return;
    const t = this.ctx.currentTime + Math.max(0, delayMs) / 1000;
    switch (kind) {
      case 'fireblast': // whoosh de fuego y un estallido
        this.noise(0.35, t, { freq: 300, to: 3000, type: 'bandpass', gain: 0.5, q: 0.8 });
        this.tone(110, 0.3, 'sawtooth', 0.2, t + 0.25, { to: 50, filter: 600 });
        break;
      case 'steadyShot': // cuerda de arco y la flecha
        this.tone(620, 0.12, 'triangle', 0.3, t, { to: 300 });
        this.noise(0.25, t + 0.05, { freq: 2500, to: 900, type: 'bandpass', gain: 0.25, q: 3 });
        break;
      case 'heal': // un acorde que se abre
        [523, 659, 784].forEach((f) => this.tone(f, 0.8, 'sine', 0.12, t, { attack: 0.15 }));
        break;
      case 'armor': // chapa contra chapa
        this.tone(210, 0.12, 'square', 0.12, t, { filter: 1200 });
        this.tone(330, 0.1, 'square', 0.1, t + 0.06, { filter: 1600 });
        this.noise(0.15, t, { freq: 4000, type: 'highpass', gain: 0.15 });
        break;
      case 'reinforce': // corneta
        this.tone(392, 0.18, 'sawtooth', 0.14, t, { filter: 1400 });
        this.tone(523, 0.35, 'sawtooth', 0.14, t + 0.17, { filter: 1600 });
        break;
      case 'dagger': // corte rápido
        this.noise(0.1, t, { freq: 6000, to: 2000, type: 'bandpass', gain: 0.4, q: 4 });
        this.tone(1500, 0.06, 'triangle', 0.1, t + 0.04);
        break;
      case 'totem': // dos golpes de tambor
        this.tone(120, 0.25, 'sine', 0.5, t, { to: 60 });
        this.tone(120, 0.25, 'sine', 0.4, t + 0.22, { to: 60 });
        break;
      case 'shapeshift': // rugido
        this.tone(85, 0.5, 'sawtooth', 0.25, t, { to: 60, filter: 700, trem: 9 });
        this.noise(0.4, t, { freq: 500, type: 'lowpass', gain: 0.25 });
        break;
      case 'claws': // dos zarpazos
        this.noise(0.08, t, { freq: 3500, type: 'bandpass', gain: 0.4, q: 3 });
        this.noise(0.08, t + 0.1, { freq: 4500, type: 'bandpass', gain: 0.4, q: 3 });
        break;
      case 'ghoul': // quejido de ultratumba
        this.tone(160, 0.6, 'sawtooth', 0.14, t, { to: 95, filter: 800, trem: 6 });
        break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, at: number,
    o: { to?: number; filter?: number; trem?: number; attack?: number } = {}): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur);
    const g = ctx.createGain();
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node.connect(f);
      node = f;
    }
    if (o.trem) {
      // temblor: una oscilación lenta en el volumen
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.trem;
      depth.gain.value = gain * 0.5;
      lfo.connect(depth).connect(g.gain);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    node.connect(g).connect(this.sfxBus!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noise(dur: number, at: number, o: { freq: number; to?: number; type: BiquadFilterType; gain: number; q?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, at);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, at + dur);
    if (o.q) f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  // ───────────────────────── música ─────────────────────────

  private syncMusic(): void {
    if (!this.ctx) return;
    if (this.mode === 'all' && this.timer === null) {
      this.nextAt = this.ctx.currentTime + 0.3;
      this.timer = window.setInterval(() => this.schedule(), 100);
    } else if (this.mode !== 'all' && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Programa las corcheas que caen en el próximo medio segundo. */
  private schedule(): void {
    const ctx = this.ctx!;
    const eighth = 60 / BPM / 2;
    // con la pestaña oculta el reloj de la página se frena: no se tocan de golpe las notas atrasadas
    if (this.nextAt < ctx.currentTime - 0.2) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + 0.5) {
      const bar = Math.floor(this.step / 8), pos = this.step % 8;
      const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
      const t = this.nextAt;
      if (pos === 0 && bar % 2 === 0) {
        // el colchón: el acorde entero, suave, durante dos compases
        for (const n of chord.notes) this.pad(hz(n), t, eighth * 16);
      }
      if (pos === 0 || pos === 4) this.pluck(hz(chord.bass), t, eighth * 3.5, 0.32, 'sine');
      const arp = ARP[bar % 2][pos];
      const note = chord.notes[arp % 3] + 12 * (1 + Math.floor(arp / 3));
      // de vez en cuando (siempre en los mismos lugares) el arpegio descansa
      if (!(bar % 4 === 3 && pos >= 6)) this.pluck(hz(note), t, eighth * 1.6, 0.13, 'triangle');
      this.step++;
      this.nextAt += eighth;
    }
  }

  private pad(freq: number, at: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.07, at + 0.8);
    g.gain.setValueAtTime(0.07, at + dur - 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    for (const d of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = d;
      osc.connect(f);
      osc.start(at);
      osc.stop(at + dur + 0.1);
    }
    f.connect(g).connect(this.musicBus!);
  }

  private pluck(freq: number, at: number, dur: number, gain: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.musicBus!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}
