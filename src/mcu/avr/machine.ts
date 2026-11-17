/**
 * ATmega328P machine (Arduino Uno / Nano) built on avr8js: the CPU executes the compiled sketch
 * instruction by instruction; GPIO ports, USART, ADC and timers are the real peripherals, so the
 * Arduino core (millis, delay, PWM, Serial, Servo) runs unchanged.
 */
import {
  CPU, avrInstruction, AVRIOPort, AVRUSART, AVRADC, AVRTimer, PinState,
  portBConfig, portCConfig, portDConfig, usart0Config, adcConfig, timer0Config, timer1Config, timer2Config,
} from 'avr8js';

export const CPU_HZ = 16_000_000;
const FLASH_BYTES = 32 * 1024;
const SRAM_BYTES = 2 * 1024;

/** Intel HEX → 16-bit program words (little-endian), as avr8js expects. */
export function parseIntelHex(hex: string, flashBytes = FLASH_BYTES): Uint16Array {
  const bytes = new Uint8Array(flashBytes).fill(0xff);
  let base = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error('Linha HEX inválida.');
    const count = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 0x00) {
      for (let i = 0; i < count; i++) {
        const at = base + addr + i;
        if (at >= flashBytes) throw new Error('Programa maior do que a memória flash do ATmega328P.');
        bytes[at] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      }
    } else if (type === 0x02) {
      base = parseInt(line.slice(9, 13), 16) << 4;
    } else if (type === 0x01) {
      break;
    }
  }
  const words = new Uint16Array(flashBytes / 2);
  for (let i = 0; i < words.length; i++) words[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8);
  return words;
}

export type PortLetter = 'B' | 'C' | 'D';

/** Arduino pin names (D0–D13, A0–A7) → port and bit. Nano A6/A7 are analogue-only (no port). */
export function arduinoPin(name: string): { port: PortLetter; bit: number } | { analog: number } | null {
  const d = /^D(\d+)$/.exec(name);
  if (d) {
    const n = Number(d[1]);
    if (n <= 7) return { port: 'D', bit: n };
    if (n <= 13) return { port: 'B', bit: n - 8 };
    return null;
  }
  const a = /^A(\d+)$/.exec(name);
  if (a) {
    const n = Number(a[1]);
    if (n <= 5) return { port: 'C', bit: n };
    if (n <= 7) return { analog: n };
  }
  return null;
}

export class AvrMachine {
  readonly cpu: CPU;
  readonly ports: Record<PortLetter, AVRIOPort>;
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  /** Serial text transmitted by the sketch since the last drain. */
  private txText = '';
  private startCycles: number;

  constructor(hex: string) {
    this.cpu = new CPU(parseIntelHex(hex), SRAM_BYTES);
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.usart = new AVRUSART(this.cpu, usart0Config, CPU_HZ);
    this.usart.onByteTransmit = (b) => { this.txText += String.fromCharCode(b); };
    this.adc = new AVRADC(this.cpu, adcConfig);
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.startCycles = this.cpu.cycles;
  }

  /** Runs the CPU until the simulated clock reaches `seconds` since start. */
  runUntil(seconds: number) {
    const target = this.startCycles + Math.floor(seconds * CPU_HZ);
    const { cpu } = this;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  /** Pin state as the port reports it: output level, input, or input with pull-up. */
  pinState(name: string): { mode: 'out' | 'in' | 'pullup'; high: boolean } | null {
    const p = arduinoPin(name);
    if (!p || !('port' in p)) return null;
    const s = this.ports[p.port].pinState(p.bit);
    if (s === PinState.High) return { mode: 'out', high: true };
    if (s === PinState.Low) return { mode: 'out', high: false };
    if (s === PinState.InputPullUp) return { mode: 'pullup', high: true };
    return { mode: 'in', high: false };
  }

  /** Sets the level the pin presents to the port when it is an input (from the circuit). */
  setInput(name: string, high: boolean) {
    const p = arduinoPin(name);
    if (p && 'port' in p) this.ports[p.port].setPin(p.bit, high);
  }

  /** Analogue input voltage for an A-channel (0…5 V on the 5 V Uno). */
  setAnalog(name: string, volts: number) {
    const p = arduinoPin(name);
    if (!p) return;
    const ch = 'analog' in p ? p.analog : 'port' in p && p.port === 'C' ? p.bit : -1;
    if (ch >= 0) this.adc.channelValues[ch] = volts;
  }

  /** Bytes received on the serial line from the host (the sketch reads them with Serial.read). */
  receive(text: string) {
    for (const ch of text) this.usart.writeByte(ch.charCodeAt(0) & 0xff);
  }

  /** Serial text sent by the sketch since the last call. */
  drainSerial(): string {
    const t = this.txText;
    this.txText = '';
    return t;
  }
}
