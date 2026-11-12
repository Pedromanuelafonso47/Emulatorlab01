/**
 * Built-in example circuits. Positions are on the 0.1" grid so pins land exactly on breadboard holes.
 * (Phase 8 "Projetos práticos" will extend this into a full project library with code and lessons.)
 */
import { emptyDocument, uid, type CircuitDocument, type Endpoint, type Point, type Rotation, type WireStyle } from '@/domain/types';
import { allDefs, defaultProps, getBBox, getDef } from '@/library/registry';

class Builder {
  doc: CircuitDocument;
  constructor(name: string) { this.doc = emptyDocument(name); }
  add(type: string, label: string, x: number, y: number, props: Record<string, number | string | boolean> = {}, rotation: Rotation = 0) {
    const def = getDef(type);
    if (!def) throw new Error(type);
    const id = uid('c');
    this.doc.components[id] = { id, type, label, x, y, rotation, props: { ...defaultProps(def), ...props } };
    return id;
  }
  wire(a: [string, string], b: [string, string], color: string, points: Point[] = [], style: WireStyle = 'wire') {
    const id = uid('w');
    const ep = ([compId, pinId]: [string, string]): Endpoint => ({ kind: 'pin', compId, pinId });
    this.doc.wires[id] = { id, from: ep(a), to: ep(b), points, color, style };
  }
}

export interface Example { id: string; name: string; description: string; build: () => CircuitDocument }

export const EXAMPLES: Example[] = [
  {
    id: 'led-9v',
    name: 'LED com resistência e bateria 9 V',
    description: 'O circuito mais simples: bateria → resistência limitadora (470 Ω) → LED → bateria.',
    build: () => {
      const b = new Builder('LED com bateria 9 V');
      const bat = b.add('battery-9v', 'BT1', -80, 0);
      const r = b.add('resistor', 'R1', 0, -60, { resistance: 470 });
      const led = b.add('led', 'D1', 60, -40, { color: 'red' });
      b.wire([bat, '+'], [r, '1'], '#e53935', [{ x: -90, y: -60 }]);
      b.wire([r, '2'], [led, 'A'], '#e53935', [{ x: 60, y: -60 }]);
      b.wire([led, 'K'], [bat, '-'], '#212121', [{ x: 70, y: 30 }, { x: -70, y: 30 }]);
      return b.doc;
    },
  },
  {
    id: 'uno-blink-bb',
    name: 'Arduino Uno + LED na breadboard',
    description: 'D13 → resistência 220 Ω → LED → barramento GND. Base para o "Blink" (execução de código na Fase 5).',
    build: () => {
      const b = new Builder('Arduino Blink na breadboard');
      const bb = b.add('breadboard-half', 'BB1', 0, 0);
      const uno = b.add('arduino-uno', 'U1', -300, 0);
      b.add('resistor', 'R1', -80, -30, { resistance: 220 });        // c5 – c9
      b.add('led', 'D1', -60, -70, { color: 'green' });               // anode b9, cathode b10
      b.wire([uno, 'D13'], [bb, 'a5'], '#fb8c00', [{ x: -310, y: -130 }, { x: -100, y: -130 }], 'jumper-mm');
      b.wire([uno, 'GND_1'], [bb, 'TN3'], '#212121', [{ x: -320, y: -120 }, { x: -120, y: -120 }], 'jumper-mm');
      b.wire([bb, 'a10'], [bb, 'TN10'], '#212121');
      return b.doc;
    },
  },
  {
    id: 'divider',
    name: 'Divisor de tensão',
    description: 'Fonte de 12 V com dois resistores (10 kΩ / 4,7 kΩ). Vout = Vin · R2 / (R1 + R2) ≈ 3,84 V.',
    build: () => {
      const b = new Builder('Divisor de tensão');
      const ps = b.add('dc-supply', 'PS1', -100, 40, { voltage: 12 });
      const r1 = b.add('resistor', 'R1', 40, -60, { resistance: 10000 }, 1);
      const r2 = b.add('resistor', 'R2', 40, 20, { resistance: 4700 }, 1);
      b.wire([ps, '+'], [r1, '1'], '#e53935', [{ x: -110, y: -100 }, { x: 40, y: -100 }]);
      b.wire([r1, '2'], [r2, '1'], '#fdd835');
      b.wire([r2, '2'], [ps, '-'], '#212121', [{ x: 40, y: 70 }, { x: -90, y: 70 }]);
      return b.doc;
    },
  },
  {
    id: 'ne555-bb',
    name: 'NE555 astável na breadboard',
    description: 'Oscilador com NE555 a fazer piscar um LED: R1 = 1 kΩ, R2 = 10 kΩ, C1 = 47 µF → f = 1,44 / ((R1 + 2·R2)·C1) ≈ 1,46 Hz. O CI atravessa o canal central.',
    build: () => {
      // Breadboard column n is at x = −150 + 10·n. NE555 pins: top row (e) 8 VCC c8, 7 DIS c9, 6 THR c10, 5 CTRL c11;
      // bottom row (f) 1 GND c8, 2 TRIG c9, 3 OUT c10, 4 RESET c11.
      const b = new Builder('NE555 astável');
      const bb = b.add('breadboard-half', 'BB1', 0, 0);
      b.add('ne555', 'U1', -60, 0);
      const bat = b.add('battery-9v', 'BT1', -240, -40);
      b.add('resistor', 'R1', -80, -40, { resistance: 1000 });          // b5 – b9   (VCC rail → DIS)
      b.add('resistor', 'R2', -30, -30, { resistance: 10000 });         // c10 – c14 (THR ↔ DIS via wire)
      b.add('capacitor-electrolytic', 'C1', -10, 30, { capacitance: 47e-6, voltage: 16 }); // + i13, − i15
      b.add('resistor', 'R3', -30, 30, { resistance: 470 });            // g10 – g14 (OUT → LED)
      b.add('led', 'D1', -10, 10, { color: 'red' });                    // A h14, K h15
      // power
      b.wire([bat, '+'], [bb, 'TP3'], '#e53935', [{ x: -250, y: -100 }, { x: -120, y: -100 }]);
      b.wire([bat, '-'], [bb, 'BN3'], '#212121', [{ x: -230, y: 110 }, { x: -120, y: 110 }]);
      b.wire([bb, 'TP29'], [bb, 'BP29'], '#e53935', [{ x: 165, y: -70 }, { x: 165, y: 80 }]);
      b.wire([bb, 'a5'], [bb, 'TP5'], '#e53935');                     // R1 top → +9 V
      b.wire([bb, 'a8'], [bb, 'TP9'], '#e53935');                     // pin 8 VCC → +9 V
      b.wire([bb, 'j8'], [bb, 'BN7'], '#212121');                     // pin 1 GND
      b.wire([bb, 'j11'], [bb, 'BP11'], '#e53935');                   // pin 4 RESET → +9 V
      // timing network
      b.wire([bb, 'd9'], [bb, 'd14'], '#1e88e5', [{ x: -60, y: -16 }, { x: -10, y: -16 }]); // DIS ↔ R2
      b.wire([bb, 'd10'], [bb, 'g9'], '#43a047', [{ x: -46, y: -16 }, { x: -46, y: 5 }, { x: -64, y: 5 }]); // THR ↔ TRIG
      b.wire([bb, 'h9'], [bb, 'h13'], '#43a047');                     // TRIG → C1 +
      b.wire([bb, 'j15'], [bb, 'BN15'], '#212121');                   // C1 − and LED K → GND
      return b.doc;
    },
  },
  {
    id: 'npn-button',
    name: 'Transístor NPN como interruptor (com botão)',
    description: 'Premir o botão injeta ≈0,8 mA na base (Rb = 10 kΩ); o 2N2222A satura e acende o LED. Inicie a simulação e prima o botão no laboratório.',
    build: () => {
      const b = new Builder('Transístor como interruptor');
      const bat = b.add('battery-9v', 'BT1', -160, 0);
      const sw = b.add('push-button', 'SW1', -80, -60);
      const rb = b.add('resistor', 'R1', 0, -70, { resistance: 10000 });
      const rl = b.add('resistor', 'R2', 40, -150, { resistance: 470 });
      const q = b.add('bjt-npn', 'Q1', 60, -40, { model: '2N2222A' });
      const led = b.add('led', 'D1', 110, -120, { color: 'yellow' });
      b.wire([bat, '+'], [rl, '1'], '#e53935', [{ x: -170, y: -150 }]);
      b.wire([bat, '+'], [sw, '1A'], '#e53935', [{ x: -170, y: -70 }]);
      b.wire([sw, '2A'], [rb, '1'], '#1e88e5');
      b.wire([rb, '2'], [q, 'B'], '#1e88e5', [{ x: 60, y: -70 }]);
      b.wire([rl, '2'], [led, 'A'], '#fb8c00', [{ x: 110, y: -150 }]);
      b.wire([led, 'K'], [q, 'C'], '#fb8c00', [{ x: 120, y: -35 }, { x: 70, y: -35 }]);
      b.wire([q, 'E'], [bat, '-'], '#212121', [{ x: 50, y: 20 }, { x: -150, y: 20 }]);
      return b.doc;
    },
  },
  {
    id: 'reg-7805',
    name: 'Fonte regulada 5 V com 7805',
    description: 'Bateria de 9 V → regulador 7805 → 5 V estáveis → LED com 330 Ω. Experimente baixar a tensão da bateria abaixo de 7 V para ver o dropout.',
    build: () => {
      const b = new Builder('Fonte regulada 7805');
      const bat = b.add('battery-9v', 'BT1', -140, 0);
      const u = b.add('lm7805', 'U1', -40, -40);
      const r = b.add('resistor', 'R1', 40, -60, { resistance: 330 });
      const led = b.add('led', 'D1', 90, -60, { color: 'green' });
      b.wire([bat, '+'], [u, 'IN'], '#e53935', [{ x: -150, y: 10 }, { x: -50, y: 10 }]);
      b.wire([u, 'GND'], [bat, '-'], '#212121', [{ x: -40, y: 40 }, { x: -130, y: 40 }]);
      b.wire([u, 'OUT'], [r, '1'], '#fdd835', [{ x: -30, y: 0 }, { x: 20, y: 0 }]);
      b.wire([r, '2'], [led, 'A'], '#fdd835', [{ x: 90, y: -60 }]);
      b.wire([led, 'K'], [bat, '-'], '#212121', [{ x: 100, y: 50 }, { x: -130, y: 50 }]);
      return b.doc;
    },
  },
  {
    id: 'catalog',
    name: 'Catálogo visual de componentes',
    description: 'Todos os componentes da biblioteca dispostos numa grelha — útil para explorar a biblioteca e ver a disposição real dos pinos.',
    build: () => {
      const b = new Builder('Catálogo de componentes');
      const defs = allDefs().filter((d) => !d.tool && !d.comingSoon);
      let x = 0, y = 0, rowH = 0;
      const maxW = 1400;
      let lastCat = '';
      for (const d of defs) {
        const bb = getBBox(d, defaultProps(d));
        if (d.category !== lastCat && x > 0) { x = 0; y += rowH + 60; rowH = 0; }
        lastCat = d.category;
        if (x + bb.w > maxW) { x = 0; y += rowH + 50; rowH = 0; }
        const ox = Math.round((x - bb.x) / 10) * 10, oy = Math.round((y - bb.y) / 10) * 10;
        const n = Object.keys(b.doc.components).length + 1;
        b.add(d.type, d.prefix + n, ox, oy);
        x += bb.w + 40;
        rowH = Math.max(rowH, bb.h);
      }
      return b.doc;
    },
  },
];
