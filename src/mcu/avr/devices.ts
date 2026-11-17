/**
 * AVR device descriptions for avr8js: register addresses, interrupt vectors, port wiring and the
 * Arduino pin tables. Interrupt addresses are program-word addresses (vector number × 2), as avr8js expects.
 */
import {
  portAConfig, portBConfig, portCConfig, portDConfig, portEConfig, portFConfig, portGConfig, portHConfig,
  portJConfig, portKConfig, portLConfig, timer0Config, timer1Config, timer2Config, usart0Config, adcConfig,
  atmega328Channels,
  type AVRPortConfig, type AVRTimerConfig,
} from 'avr8js';
import { MEGA_PINS, type MegaPort } from './mega-pins';

export type PortLetter = MegaPort;

export interface AvrPinRef { port: PortLetter; bit: number }

export interface AvrDevice {
  name: string;
  flashBytes: number;
  sramBytes: number;
  ports: Partial<Record<PortLetter, AVRPortConfig>>;
  timers: AVRTimerConfig[];
  usart: typeof usart0Config;
  adc: typeof adcConfig;
  /** Board pin name (D0…, A0…) → port and bit. Analogue-only pins are absent. */
  pin: (name: string) => AvrPinRef | null;
  /** Analogue pin name → ADC channel. */
  analogChannel: (name: string) => number | null;
}

// ───────── ATmega328P (Arduino Uno, Nano) ─────────

const UNO_PORTS: Partial<Record<PortLetter, AVRPortConfig>> = { B: portBConfig, C: portCConfig, D: portDConfig };

function unoPin(name: string): AvrPinRef | null {
  const d = /^D(\d+)$/.exec(name);
  if (d) {
    const n = Number(d[1]);
    if (n <= 7) return { port: 'D', bit: n };
    if (n <= 13) return { port: 'B', bit: n - 8 };
    return null;
  }
  const a = /^A(\d+)$/.exec(name);
  if (a && Number(a[1]) <= 5) return { port: 'C', bit: Number(a[1]) };
  return null;
}

export const ATMEGA328P: AvrDevice = {
  name: 'ATmega328P',
  flashBytes: 32 * 1024,
  sramBytes: 2 * 1024,
  ports: UNO_PORTS,
  timers: [timer0Config, timer1Config, timer2Config],
  usart: usart0Config,
  adc: adcConfig,
  pin: unoPin,
  analogChannel: (name) => { const a = /^A(\d+)$/.exec(name); return a && Number(a[1]) <= 5 ? Number(a[1]) : null; },
};

// ───────── ATmega2560 (Arduino Mega) ─────────

/** Vector number × 2 (word address), from the ATmega2560 interrupt table. */
const v = (n: number) => n * 2;

const TIMER0_2560: AVRTimerConfig = {
  ...timer0Config,
  compAInterrupt: v(21), compBInterrupt: v(22), ovfInterrupt: v(23),
  compPortA: portBConfig.PORT, compPinA: 7,   // OC0A = PB7
  compPortB: portGConfig.PORT, compPinB: 5,   // OC0B = PG5
};
const TIMER1_2560: AVRTimerConfig = {
  ...timer1Config,
  captureInterrupt: v(16), compAInterrupt: v(17), compBInterrupt: v(18), compCInterrupt: v(19), ovfInterrupt: v(20),
  compPortA: portBConfig.PORT, compPinA: 5, compPortB: portBConfig.PORT, compPinB: 6, compPortC: portBConfig.PORT, compPinC: 7,
};
const TIMER2_2560: AVRTimerConfig = {
  ...timer2Config,
  compAInterrupt: v(13), compBInterrupt: v(14), ovfInterrupt: v(15),
  compPortA: portBConfig.PORT, compPinA: 4,   // OC2A = PB4
  compPortB: portHConfig.PORT, compPinB: 6,   // OC2B = PH6
};

/** Timers 3, 4 and 5 share the 16-bit layout of timer 1; only their addresses and pins differ. */
function timer16(regs: { tccra: number; tcnt: number; icr: number; ocra: number; tifr: number; timsk: number }, vec: number[], out: [AVRPortConfig, number, number, number]): AVRTimerConfig {
  const [capt, a, b, c, ovf] = vec;
  const [port, pa, pb, pc] = out;
  return {
    ...timer1Config,
    captureInterrupt: v(capt), compAInterrupt: v(a), compBInterrupt: v(b), compCInterrupt: v(c), ovfInterrupt: v(ovf),
    TIFR: regs.tifr, OCRA: regs.ocra, OCRB: regs.ocra + 2, OCRC: regs.ocra + 4, ICR: regs.icr, TCNT: regs.tcnt,
    TCCRA: regs.tccra, TCCRB: regs.tccra + 1, TCCRC: regs.tccra + 2, TIMSK: regs.timsk,
    compPortA: port.PORT, compPinA: pa, compPortB: port.PORT, compPinB: pb, compPortC: port.PORT, compPinC: pc,
    externalClockPort: portEConfig.PORT, externalClockPin: 6,
  };
}
const TIMER3_2560 = timer16({ tccra: 0x90, tcnt: 0x94, icr: 0x96, ocra: 0x98, tifr: 0x38, timsk: 0x71 }, [31, 32, 33, 34, 35], [portEConfig, 3, 4, 5]);
const TIMER4_2560 = timer16({ tccra: 0xa0, tcnt: 0xa4, icr: 0xa6, ocra: 0xa8, tifr: 0x39, timsk: 0x72 }, [41, 42, 43, 44, 45], [portHConfig, 3, 4, 5]);
const TIMER5_2560 = timer16({ tccra: 0x120, tcnt: 0x124, icr: 0x126, ocra: 0x128, tifr: 0x3a, timsk: 0x73 }, [46, 47, 48, 49, 50], [portLConfig, 3, 4, 5]);

const USART0_2560: typeof usart0Config = { ...usart0Config, rxCompleteInterrupt: v(25), dataRegisterEmptyInterrupt: v(26), txCompleteInterrupt: v(27) };
const ADC_2560: typeof adcConfig = { ...adcConfig, adcInterrupt: v(29), numChannels: 8, muxChannels: atmega328Channels };

const MEGA_PORTS: Partial<Record<PortLetter, AVRPortConfig>> = {
  A: portAConfig, B: portBConfig, C: portCConfig, D: portDConfig, E: portEConfig, F: portFConfig,
  G: portGConfig, H: portHConfig, J: portJConfig, K: portKConfig, L: portLConfig,
};

export const ATMEGA2560: AvrDevice = {
  name: 'ATmega2560',
  flashBytes: 256 * 1024,
  // avr8js allocates sramBytes + 256 for the data space; RAMEND is 0x21FF, so the data space must reach 0x2200.
  sramBytes: 0x2100,
  ports: MEGA_PORTS,
  timers: [TIMER0_2560, TIMER1_2560, TIMER2_2560, TIMER3_2560, TIMER4_2560, TIMER5_2560],
  usart: USART0_2560,
  adc: ADC_2560,
  pin: (name) => {
    const r = MEGA_PINS[name];
    return r ? { port: r.port, bit: r.bit } : null;
  },
  // Mega A0–A7 are ADC0–ADC7 (PF0–PF7); A8–A15 need MUX5 and are not emulated yet.
  analogChannel: (name) => { const a = /^A(\d+)$/.exec(name); return a && Number(a[1]) <= 7 ? Number(a[1]) : null; },
};
