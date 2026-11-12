import type { ReactNode } from 'react';
import { registerComponent } from '../registry';
import { HeaderPin, HeaderSocket, MountHole, Smd, SmdLed, Txt } from '../render/primitives';
import { guessRole } from '../render/packages';
import { registerDip } from './ics';
import type { PinDef, PinRole } from '../types';
import { sim } from './common';

interface RawPin { name: string; x: number; y: number; role?: PinRole; description?: string }

const PWM_UNO = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
const SHARED = /^(GND|5V|3V3|3\.3V|VIN|VBUS|AGND)$/;

/** Assign unique ids to board pins and group same-named power pins (internally tied on the PCB). */
function boardPins(raw: RawPin[]): { pins: PinDef[]; internal: string[][] } {
  const count: Record<string, number> = {};
  const seen: Record<string, number> = {};
  raw.forEach((p) => (count[p.name] = (count[p.name] ?? 0) + 1));
  const groups: Record<string, string[]> = {};
  const pins = raw.map((p) => {
    const base = p.name.replace(/[^A-Za-z0-9.+_-]/g, '_');
    seen[p.name] = (seen[p.name] ?? 0) + 1;
    const id = count[p.name] > 1 ? `${base}_${seen[p.name]}` : base;
    const n = p.name === '3.3V' ? '3V3' : p.name;
    if (SHARED.test(n)) (groups[n] ??= []).push(id);
    return { id, name: p.name, x: p.x, y: p.y, role: p.role ?? guessRole(p.name), description: p.description };
  });
  return { pins, internal: Object.values(groups).filter((g) => g.length > 1) };
}

const row = (names: string[], x0: number, y: number, dx = 10): RawPin[] => names.map((name, i) => ({ name, x: x0 + i * dx, y }));

function PinLabels({ pins, side, size = 3, color = '#f1f5f9' }: { pins: PinDef[]; side: 'above' | 'below'; size?: number; color?: string }) {
  return (
    <g>
      {pins.map((p) => (
        <Txt key={p.id} x={p.x} y={p.y + (side === 'below' ? 7 + p.name.length * size * 0.32 : -7 - p.name.length * size * 0.32)} size={size} fill={color} rotate={-90}>{p.name}</Txt>
      ))}
    </g>
  );
}

// ═════════════════════ Arduino Uno ═════════════════════
{
  const top = [...row(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], -50, -90), ...row(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], 60, -90)];
  const bottom = [...row(['NC', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'], -30, 100), ...row(['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], 60, 100)];
  top.forEach((p) => {
    if (p.name === 'D0') p.description = 'RX (Serial)';
    if (p.name === 'D1') p.description = 'TX (Serial)';
    if (PWM_UNO.has(p.name)) p.description = 'PWM ~';
    if (p.name === 'D13') p.description = 'LED "L" integrado';
  });
  const { pins, internal } = boardPins([...top, ...bottom]);
  const topPins = pins.filter((p) => p.y < 0), botPins = pins.filter((p) => p.y > 0);
  registerComponent({
    type: 'arduino-uno', name: 'Arduino Uno R3', category: 'mcu', subcategory: 'Placas Arduino', prefix: 'U',
    description: 'Placa com ATmega328P a 16 MHz: 14 E/S digitais (6 PWM), 6 entradas analógicas, USB.',
    tags: ['arduino', 'uno', 'atmega328p', 'microcontrolador', 'avr'],
    bbox: { x: -138, y: -101, w: 279, h: 212 },
    pins, internalConnections: internal,
    render: ({ state }) => (
      <g>
        <path d="M-128 -100 H128 L134 -94 V-60 L140 -54 V80 L134 86 V104 L128 110 H-128 Q-130 110 -130 108 V-98 Q-130 -100 -128 -100 Z" fill="url(#g-pcb-teal)" stroke="#063c44" strokeWidth={0.8} />
        <MountHole x={-115} y={95} r={6} /><MountHole x={-110} y={-90 + 4} r={6} /><MountHole x={130} y={-10} r={6} /><MountHole x={130} y={70} r={6} />
        {/* USB-B */}
        <rect x={-138} y={-68} width={48} height={46} rx={1.5} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.6} />
        <rect x={-134} y={-58} width={30} height={26} rx={1} fill="#c3c9d0" stroke="#7d858f" strokeWidth={0.4} />
        {/* DC jack */}
        <rect x={-136} y={28} width={56} height={36} rx={2} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} />
        <circle cx={-122} cy={46} r={8} fill="#0b0c0e" /><circle cx={-122} cy={46} r={2.6} fill="url(#g-metal-r)" />
        {/* reset button */}
        <rect x={-110} y={-96} width={18} height={18} rx={1} fill="url(#g-metal)" /><circle cx={-101} cy={-87} r={5.5} fill="#c8302a" stroke="#7d1612" strokeWidth={0.5} />
        {/* ATmega328P */}
        <rect x={-6} y={46} width={132} height={34} rx={1.5} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} />
        {Array.from({ length: 14 }, (_, i) => <g key={i}><rect x={-1 + i * 9.4} y={42} width={3.4} height={4} fill="#c7ccd1" /><rect x={-1 + i * 9.4} y={80} width={3.4} height={4} fill="#c7ccd1" /></g>)}
        <path d="M-6 59 A4 4 0 0 1 -6 67" fill="#000" stroke="#333" strokeWidth={0.4} />
        <Txt x={60} y={60} size={5} fill="#cfd3d8">ATMEGA328P-PU</Txt>
        {/* 16U2 + crystal + regulators */}
        <rect x={-80} y={-60} width={22} height={22} fill="url(#g-black-flat)" transform="rotate(45 -69 -49)" />
        <rect x={-46} y={-8} width={22} height={9} rx={4} fill="url(#g-metal)" stroke="#6f7782" strokeWidth={0.4} /><Txt x={-35} y={-3.5} size={2.4} fill="#333">16.000</Txt>
        <rect x={-74} y={70} width={20} height={14} fill="url(#g-black-flat)" /><rect x={-72} y={64} width={16} height={6} fill="url(#g-metal)" />
        <circle cx={-40} cy={42} r={8} fill="url(#g-metal-r)" stroke="#5f6670" strokeWidth={0.5} /><circle cx={-58} cy={42} r={8} fill="url(#g-metal-r)" stroke="#5f6670" strokeWidth={0.5} />
        {/* ICSP */}
        {[0, 1, 2].map((i) => [0, 1].map((j) => <HeaderPin key={`${i}${j}`} x={124 + j * 10 - 5} y={10 + i * 10} />))}
        {/* LEDs */}
        <SmdLed x={-22} y={-68} color="#ffb000" on={Boolean(state?.led13)} /><Txt x={-14} y={-68} size={3} fill="#fff">L</Txt>
        <SmdLed x={-22} y={-58} color="#ffb000" /><Txt x={-13} y={-58} size={3} fill="#fff">TX</Txt>
        <SmdLed x={-22} y={-48} color="#ffb000" /><Txt x={-13} y={-48} size={3} fill="#fff">RX</Txt>
        <SmdLed x={92} y={-38} color="#33dd55" on /><Txt x={102} y={-38} size={3} fill="#fff">ON</Txt>
        <Smd x={10} y={-40} /><Smd x={20} y={-40} /><Smd x={30} y={-32} w={5} h={2.4} color="#c9a43a" />
        {/* Branding-free silkscreen */}
        <Txt x={46} y={-14} size={20} fill="#ffffff" weight={800} family="sans">UNO</Txt>
        <Txt x={46} y={5} size={4} fill="#d9f4f6">R3 · ATmega328P · 16 MHz</Txt>
        <Txt x={10} y={-56} size={3.4} fill="#e6fbff">DIGITAL (PWM ~)</Txt>
        <Txt x={5} y={86} size={3.4} fill="#e6fbff">POWER</Txt><Txt x={85} y={86} size={3.4} fill="#e6fbff">ANALOG IN</Txt>
        {/* Headers */}
        {pins.map((p) => <HeaderSocket key={p.id} x={p.x} y={p.y} />)}
        <PinLabels pins={topPins.map((p) => ({ ...p, name: PWM_UNO.has(p.name) ? `~${p.name.slice(1)}` : p.name.replace(/^D/, '') }))} side="below" size={3.2} />
        <PinLabels pins={botPins} side="above" size={3.2} />
      </g>
    ),
    datasheet: {
      summary: 'Alimentação: USB (5 V) ou jack/VIN (7–12 V). Cada pino E/S fornece até 20 mA (máx. absoluto 40 mA); total ≤ 200 mA.',
      specs: { 'Microcontrolador': 'ATmega328P', 'Clock': '16 MHz', 'Flash': '32 KB', 'SRAM': '2 KB', 'EEPROM': '1 KB', 'ADC': '10 bits (0–1023)', 'Dimensões': '68,6 × 53,4 mm' },
      notes: ['PWM (~): 3, 5, 6, 9, 10, 11.', 'I²C: A4 (SDA), A5 (SCL). SPI: 10–13.', 'Interrupções externas: D2, D3.'],
    },
    sim: { model: 'avr-atmega328p', status: 'none', note: 'Emulação com avr8js prevista para a Fase 5.' },
  });
}

// ═════════════════════ Arduino Mega 2560 ═════════════════════
{
  const top = [
    ...row(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], -120, -90),
    ...row(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], -10, -90),
    ...row(['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'], 80, -90),
  ];
  const bottom = [
    ...row(['NC', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'], -100, 100),
    ...row(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], -10, 100),
    ...row(['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'], 80, 100),
  ];
  const dbl: RawPin[] = [];
  for (let r = 0; r < 18; r++) {
    const y = -80 + r * 10;
    if (r === 0) { dbl.push({ name: '5V', x: 170, y }, { name: '5V', x: 180, y }); continue; }
    if (r === 17) { dbl.push({ name: 'GND', x: 170, y }, { name: 'GND', x: 180, y }); continue; }
    const n = 22 + (r - 1) * 2;
    dbl.push({ name: `D${n}`, x: 170, y }, { name: `D${n + 1}`, x: 180, y });
  }
  const { pins, internal } = boardPins([...top, ...bottom, ...dbl]);
  registerComponent({
    type: 'arduino-mega', name: 'Arduino Mega 2560', category: 'mcu', subcategory: 'Placas Arduino', prefix: 'U',
    description: 'ATmega2560: 54 E/S digitais (15 PWM), 16 entradas analógicas, 4 portas série.',
    tags: ['arduino', 'mega', 'atmega2560', 'microcontrolador'],
    bbox: { x: -208, y: -101, w: 402, h: 212 },
    pins, internalConnections: internal,
    render: () => (
      <g>
        <path d="M-198 -100 H186 L192 -94 V104 L186 110 H-198 Q-200 110 -200 108 V-98 Q-200 -100 -198 -100 Z" fill="url(#g-pcb-teal)" stroke="#063c44" strokeWidth={0.8} />
        <MountHole x={-185} y={95} r={6} /><MountHole x={-180} y={-86} r={6} /><MountHole x={150} y={-60} r={6} /><MountHole x={150} y={80} r={6} />
        <rect x={-208} y={-68} width={48} height={46} rx={1.5} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.6} />
        <rect x={-206} y={28} width={56} height={36} rx={2} fill="url(#g-black-flat)" />
        <circle cx={-192} cy={46} r={8} fill="#0b0c0e" />
        <rect x={-10} y={-40} width={70} height={70} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} transform="rotate(45 25 -5)" />
        <Txt x={25} y={-8} size={4.6} fill="#cfd3d8">ATMEGA2560</Txt><Txt x={25} y={-1} size={3} fill="#8d939b">16AU</Txt>
        <Txt x={-100} y={-20} size={20} fill="#fff" weight={800} family="sans">MEGA</Txt>
        <Txt x={-100} y={0} size={4} fill="#d9f4f6">2560 · 16 MHz</Txt>
        <Txt x={-60} y={-60} size={3.4} fill="#e6fbff">DIGITAL (PWM ~)</Txt><Txt x={115} y={-60} size={3.4} fill="#e6fbff">COMMUNICATION</Txt>
        <Txt x={-65} y={86} size={3.4} fill="#e6fbff">POWER</Txt><Txt x={70} y={86} size={3.4} fill="#e6fbff">ANALOG IN</Txt>
        {pins.map((p) => <HeaderSocket key={p.id} x={p.x} y={p.y} />)}
        <PinLabels pins={pins.filter((p) => p.y === -90).map((p) => ({ ...p, name: p.name.replace(/^D/, '') }))} side="below" size={3} />
        <PinLabels pins={pins.filter((p) => p.y === 100)} side="above" size={3} />
        {pins.filter((p) => p.x === 170).map((p) => <Txt key={p.id} x={156} y={p.y} size={2.6} fill="#fff" anchor="end">{p.name.replace(/^D/, '')}</Txt>)}
      </g>
    ),
    datasheet: { summary: 'Mesma tensão lógica (5 V) e compatível com shields do Uno.', specs: { Flash: '256 KB', SRAM: '8 KB', 'Portas série': '4', 'Dimensões': '101,5 × 53,3 mm' } },
    sim: { model: 'avr-atmega2560', status: 'none', note: 'Emulação avr8js prevista para a Fase 5.' },
  });
}

// ═════════════════════ Dual-row DIP-style boards ═════════════════════
interface DualRow {
  type: string; name: string; description: string; tags: string[]; subcategory: string;
  w: number; h: number; yTop: number; yBot: number; top: string[]; bottom: string[];
  pcb: string; usbSide: 'left' | 'right'; deco: (bx: number, by: number) => ReactNode;
  specs: Record<string, string>; summary: string; model: string; note: string;
}
function dualRow(d: DualRow) {
  const n = d.top.length;
  const x0 = -Math.floor((n - 1) / 2) * 10;
  const { pins, internal } = boardPins([...row(d.top, x0, d.yTop), ...row(d.bottom, x0, d.yBot)]);
  const cx = x0 + ((n - 1) * 10) / 2;
  const bx = cx - d.w / 2, by = (d.yTop + d.yBot) / 2 - d.h / 2;
  registerComponent({
    type: d.type, name: d.name, category: 'mcu', subcategory: d.subcategory, prefix: 'U', description: d.description, tags: d.tags,
    bbox: { x: bx - 8, y: by, w: d.w + 16, h: d.h },
    pins, internalConnections: internal,
    render: () => (
      <g>
        <rect x={bx} y={by} width={d.w} height={d.h} rx={3} fill={`url(#g-pcb-${d.pcb})`} stroke="#0008" strokeWidth={0.6} />
        {d.deco(bx, by)}
        <rect x={d.usbSide === 'left' ? bx - 8 : bx + d.w - 22} y={by + d.h / 2 - 12} width={30} height={24} rx={2} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
        {pins.map((p) => <HeaderPin key={p.id} x={p.x} y={p.y} />)}
        <PinLabels pins={pins.filter((p) => p.y === d.yTop)} side="below" size={2.6} />
        <PinLabels pins={pins.filter((p) => p.y === d.yBot)} side="above" size={2.6} />
      </g>
    ),
    datasheet: { summary: d.summary, specs: d.specs },
    sim: { model: d.model, status: 'none', note: d.note },
  });
}

dualRow({
  type: 'arduino-nano', name: 'Arduino Nano', subcategory: 'Placas Arduino', model: 'avr-atmega328p', note: 'Emulação avr8js prevista para a Fase 5.',
  description: 'Versão compacta do Uno (ATmega328P), encaixa diretamente numa breadboard.', tags: ['arduino', 'nano', 'atmega328p', 'breadboard'],
  w: 172, h: 72, yTop: -30, yBot: 30, pcb: 'blue', usbSide: 'left',
  top: ['D13', '3V3', 'REF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'],
  bottom: ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', 'RX0', 'TX1'],
  deco: (bx, by) => (<g>
    <rect x={bx + 70} y={by + 22} width={28} height={28} fill="url(#g-black-flat)" transform={`rotate(45 ${bx + 84} ${by + 36})`} />
    <Txt x={bx + 84} y={by + 36} size={2.4} fill="#aaa">328P</Txt>
    <rect x={bx + 120} y={by + 28} width={10} height={16} rx={1} fill="url(#g-metal)" /><circle cx={bx + 125} cy={by + 36} r={3} fill="#eee" />
    <SmdLed x={bx + 44} y={by + 30} color="#33dd55" on /><SmdLed x={bx + 44} y={by + 42} color="#ffb000" />
    <Txt x={bx + 140} y={by + 52} size={4} fill="#fff" weight={800}>NANO</Txt>
  </g>),
  specs: { MCU: 'ATmega328P', Clock: '16 MHz', 'Dimensões': '45 × 18 mm' }, summary: 'Mesmos recursos do Uno + A6/A7 (apenas analógicos).',
});

dualRow({
  type: 'esp32-devkit', name: 'ESP32 DevKit V1', subcategory: 'Espressif (Wi-Fi/BT)', model: 'esp32-hal', note: 'Execução ao nível da API Arduino (sem emular o CPU Xtensa) prevista para a Fase 5.',
  description: 'Dual-core 240 MHz com Wi-Fi e Bluetooth. Lógica de 3,3 V (pinos NÃO toleram 5 V).', tags: ['esp32', 'wifi', 'bluetooth', 'iot', 'espressif'],
  w: 205, h: 112, yTop: -40, yBot: 50, pcb: 'black', usbSide: 'right',
  top: ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'],
  bottom: ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'],
  deco: (bx, by) => (<g>
    <rect x={bx + 2} y={by + 26} width={72} height={60} rx={1} fill="url(#g-metal)" stroke="#6f7782" strokeWidth={0.5} />
    <path d={`M${bx + 4} ${by + 30} h10 v10 h-6 v10 h6 v10 h-6 v10 h6`} fill="none" stroke="#c9a43a" strokeWidth={1.4} />
    <rect x={bx + 20} y={by + 34} width={50} height={44} rx={1} fill="url(#g-metal-h)" opacity={0.7} />
    <Txt x={bx + 45} y={by + 50} size={4} fill="#333" weight={800}>ESP32-WROOM</Txt><Txt x={bx + 45} y={by + 58} size={2.6} fill="#555">Wi-Fi + BT</Txt>
    <rect x={bx + 120} y={by + 44} width={12} height={10} fill="url(#g-black-flat)" /><rect x={bx + 140} y={by + 44} width={14} height={10} fill="url(#g-black-flat)" />
    <SmdLed x={bx + 110} y={by + 64} color="#ff3b30" on /><SmdLed x={bx + 120} y={by + 64} color="#3d8bff" />
    <rect x={bx + 160} y={by + 28} width={8} height={8} rx={1} fill="#ddd" /><rect x={bx + 160} y={by + 76} width={8} height={8} rx={1} fill="#ddd" />
    <Txt x={bx + 164} y={by + 41} size={2.2} fill="#ddd">EN</Txt><Txt x={bx + 164} y={by + 72} size={2.2} fill="#ddd">BOOT</Txt>
  </g>),
  specs: { CPU: 'Xtensa LX6 dual-core 240 MHz', Flash: '4 MB', SRAM: '520 KB', ADC: '12 bits (18 canais)', 'Lógica': '3,3 V' },
  summary: 'D2 tem LED azul integrado na maioria das placas. GPIO34–39 são apenas entradas. ADC2 indisponível com Wi-Fi ativo.',
});

dualRow({
  type: 'esp8266-nodemcu', name: 'ESP8266 NodeMCU', subcategory: 'Espressif (Wi-Fi/BT)', model: 'esp8266-hal', note: 'Execução ao nível da API Arduino prevista para a Fase 5.',
  description: 'ESP-12E com Wi-Fi 2,4 GHz, lógica 3,3 V, 1 entrada analógica (A0).', tags: ['esp8266', 'nodemcu', 'wifi', 'iot'],
  w: 196, h: 112, yTop: -40, yBot: 50, pcb: 'black', usbSide: 'right',
  top: ['A0', 'RSV', 'RSV', 'SD3', 'SD2', 'SD1', 'CMD', 'SD0', 'CLK', 'GND', '3V3', 'EN', 'RST', 'GND', 'VIN'],
  bottom: ['D0', 'D1', 'D2', 'D3', 'D4', '3V3', 'GND', 'D5', 'D6', 'D7', 'D8', 'RX', 'TX', 'GND', '3V3'],
  deco: (bx, by) => (<g>
    <rect x={bx + 4} y={by + 28} width={64} height={56} rx={1} fill="#1a3a8a" stroke="#0d1f4a" strokeWidth={0.5} />
    <path d={`M${bx + 6} ${by + 32} h10 v8 h-6 v8 h6 v8 h-6 v8 h6`} fill="none" stroke="#c9a43a" strokeWidth={1.4} />
    <rect x={bx + 22} y={by + 36} width={42} height={40} rx={1} fill="url(#g-metal-h)" opacity={0.8} />
    <Txt x={bx + 43} y={by + 52} size={3.6} fill="#333" weight={800}>ESP-12E</Txt>
    <Txt x={bx + 120} y={by + 56} size={4} fill="#fff" weight={800}>NodeMCU</Txt>
  </g>),
  specs: { CPU: 'Tensilica L106 80/160 MHz', Flash: '4 MB', ADC: '10 bits, 0–1 V (divisor na placa → 3,3 V)' },
  summary: 'Os nomes Dx da placa não coincidem com os GPIO (ex.: D4 = GPIO2, LED integrado).',
});

dualRow({
  type: 'rpi-pico', name: 'Raspberry Pi Pico', subcategory: 'Raspberry Pi', model: 'rp2040', note: 'Emulação com rp2040js prevista para a Fase 5.',
  description: 'RP2040 dual-core Cortex-M0+ 133 MHz, 26 GPIO, 3 ADC, lógica 3,3 V.', tags: ['pico', 'rp2040', 'raspberry', 'micropython'],
  w: 204, h: 84, yTop: -30, yBot: 40, pcb: 'green', usbSide: 'left',
  top: ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'],
  bottom: ['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16'],
  deco: (bx, by) => (<g>
    <rect x={bx + 90} y={by + 26} width={30} height={30} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.4} />
    <Txt x={bx + 105} y={by + 41} size={3.4} fill="#bbb">RP2040</Txt>
    <rect x={bx + 130} y={by + 30} width={20} height={14} fill="url(#g-black-flat)" />
    <rect x={bx + 30} y={by + 30} width={12} height={10} rx={1} fill="#eee" /><Txt x={bx + 36} y={by + 46} size={2.2} fill="#fff">BOOTSEL</Txt>
    <SmdLed x={bx + 20} y={by + 54} color="#33dd55" />
    <Txt x={bx + 170} y={by + 42} size={4.4} fill="#fff" weight={800}>Pico</Txt>
  </g>),
  specs: { CPU: 'Dual Cortex-M0+ 133 MHz', SRAM: '264 KB', Flash: '2 MB', ADC: '12 bits (3 canais)' },
  summary: 'LED integrado em GP25. Programável em C/C++ (SDK, Arduino) ou MicroPython.',
});

// ═════════════════════ Bare MCUs (DIP) ═════════════════════
registerDip({
  type: 'atmega328p', name: 'ATmega328P (DIP-28)', label: 'ATMEGA328P', sub: 'AVR 8-bit', category: 'mcu', subcategory: 'Microcontroladores (chip)', model: 'avr-atmega328p',
  description: 'O microcontrolador do Arduino Uno, isolado. Requer cristal 16 MHz + 2×22 pF (ou oscilador interno 8 MHz).',
  tags: ['atmega328p', 'avr', 'microcontrolador', 'standalone'],
  pins: ['PC6 RESET', 'PD0 RXD', 'PD1 TXD', 'PD2 INT0', 'PD3 INT1', 'PD4', { name: 'VCC', role: 'power' }, { name: 'GND', role: 'ground' }, 'PB6 XTAL1', 'PB7 XTAL2', 'PD5', 'PD6', 'PD7', 'PB0', 'PB1', 'PB2 SS', 'PB3 MOSI', 'PB4 MISO', 'PB5 SCK', { name: 'AVCC', role: 'power' }, 'AREF', { name: 'GND', role: 'ground' }, 'PC0 ADC0', 'PC1 ADC1', 'PC2 ADC2', 'PC3 ADC3', 'PC4 SDA', 'PC5 SCL'],
  summary: 'Pino Arduino D13 = PB5 (pino 19). D0–D7 = PD0–PD7; D8–D13 = PB0–PB5; A0–A5 = PC0–PC5.',
});
registerDip({
  type: 'pic16f877a', name: 'PIC16F877A (DIP-40)', label: 'PIC16F877A', sub: 'MICROCHIP', category: 'mcu', subcategory: 'Microcontroladores (chip)', model: 'pic16',
  description: 'Microcontrolador PIC de 8 bits clássico: 33 E/S, 8 canais ADC 10 bits, USART, I²C/SPI.',
  tags: ['pic', 'pic16f877a', 'microchip', 'microcontrolador'],
  pins: ['MCLR̅/VPP', 'RA0/AN0', 'RA1/AN1', 'RA2/AN2', 'RA3/AN3', 'RA4/T0CKI', 'RA5/AN4', 'RE0/AN5', 'RE1/AN6', 'RE2/AN7', { name: 'VDD', role: 'power' }, { name: 'VSS', role: 'ground' }, 'OSC1', 'OSC2', 'RC0', 'RC1', 'RC2/CCP1', 'RC3/SCK', 'RD0', 'RD1', 'RD2', 'RD3', 'RC4/SDA', 'RC5/SDO', 'RC6/TX', 'RC7/RX', 'RD4', 'RD5', 'RD6', 'RD7', { name: 'VSS', role: 'ground' }, { name: 'VDD', role: 'power' }, 'RB0/INT', 'RB1', 'RB2', 'RB3/PGM', 'RB4', 'RB5', 'RB6/PGC', 'RB7/PGD'],
  summary: 'Execução de código PIC ainda não suportada (sem emulador PIC maduro para o browser).',
});
registerDip({
  type: 'pic16f628a', name: 'PIC16F628A (DIP-18)', label: 'PIC16F628A', sub: 'MICROCHIP', category: 'mcu', subcategory: 'Microcontroladores (chip)', model: 'pic16',
  description: 'PIC de 8 bits com oscilador interno 4 MHz, 16 E/S, comparadores e USART.',
  tags: ['pic', 'pic16f628a', 'microchip'],
  pins: ['RA2/AN2', 'RA3/AN3', 'RA4/T0CKI', 'RA5/MCLR̅', { name: 'VSS', role: 'ground' }, 'RB0/INT', 'RB1/RX', 'RB2/TX', 'RB3/CCP1', 'RB4/PGM', 'RB5', 'RB6/PGC', 'RB7/PGD', { name: 'VDD', role: 'power' }, 'RA6/OSC2', 'RA7/OSC1', 'RA0/AN0', 'RA1/AN1'],
});

void sim;
