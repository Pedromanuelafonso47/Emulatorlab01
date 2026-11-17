/**
 * AVR machine (Arduino Uno / Nano: ATmega328P; Mega: ATmega2560) built on avr8js: the CPU executes the
 * compiled sketch instruction by instruction; GPIO ports, USART, ADC and timers are the real peripherals,
 * so the Arduino core (millis, delay, PWM, Serial, Servo) runs unchanged.
 */
import { CPU, avrInstruction, AVRIOPort, AVRUSART, AVRADC, AVRTimer, PinState } from 'avr8js';
import { ATMEGA328P, ATMEGA2560, type AvrDevice, type PortLetter } from './devices';

export const CPU_HZ = 16_000_000;

/** Intel HEX → 16-bit program words (little-endian), as avr8js expects. */
export function parseIntelHex(hex: string, flashBytes = ATMEGA328P.flashBytes): Uint16Array {
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
        if (at >= flashBytes) throw new Error('Programa maior do que a memória flash do microcontrolador.');
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

export class AvrMachine {
  readonly cpu: CPU;
  readonly device: AvrDevice;
  readonly ports: Partial<Record<PortLetter, AVRIOPort>> = {};
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  /** Serial text transmitted by the sketch since the last drain. */
  private txText = '';
  private startCycles: number;

  constructor(hex: string, device: AvrDevice = ATMEGA328P) {
    this.device = device;
    this.cpu = new CPU(parseIntelHex(hex, device.flashBytes), device.sramBytes);
    for (const [letter, cfg] of Object.entries(device.ports)) {
      this.ports[letter as PortLetter] = new AVRIOPort(this.cpu, cfg!);
    }
    this.usart = new AVRUSART(this.cpu, device.usart, CPU_HZ);
    this.usart.onByteTransmit = (b) => { this.txText += String.fromCharCode(b); };
    this.adc = new AVRADC(this.cpu, device.adc);
    for (const t of device.timers) new AVRTimer(this.cpu, t);
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

  private port(name: string) {
    const p = this.device.pin(name);
    if (!p) return null;
    const io = this.ports[p.port];
    return io ? { io, bit: p.bit } : null;
  }

  /** Pin state as the port reports it: output level, input, or input with pull-up. */
  pinState(name: string): { mode: 'out' | 'in' | 'pullup'; high: boolean } | null {
    const p = this.port(name);
    if (!p) return null;
    const s = p.io.pinState(p.bit);
    if (s === PinState.High) return { mode: 'out', high: true };
    if (s === PinState.Low) return { mode: 'out', high: false };
    if (s === PinState.InputPullUp) return { mode: 'pullup', high: true };
    return { mode: 'in', high: false };
  }

  /** Sets the level the pin presents to the port when it is an input (from the circuit). */
  setInput(name: string, high: boolean) {
    const p = this.port(name);
    if (p) p.io.setPin(p.bit, high);
  }

  /** Analogue input voltage for an A-channel (0…5 V on the 5 V boards). */
  setAnalog(name: string, volts: number) {
    const ch = this.device.analogChannel(name);
    if (ch !== null) this.adc.channelValues[ch] = volts;
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

/** Device for an Arduino board type (Uno/Nano → ATmega328P, Mega → ATmega2560). */
export function deviceForBoard(board: string): AvrDevice | null {
  if (board === 'arduino-uno' || board === 'arduino-nano') return ATMEGA328P;
  if (board === 'arduino-mega') return ATMEGA2560;
  return null;
}

export { ATMEGA2560 };
