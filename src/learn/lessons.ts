/**
 * Guided lessons. Each step names the parts it needs and the connections that must exist on the
 * netlist before the step counts as done. Parts are referenced by a key (R1, LED1, …): the k-th
 * component of the given type in label order.
 */
export interface LessonPart { key: string; type: string }
/** A pin is either an exact pin id or a regular expression matched against pin ids (e.g. "^GND"). */
export interface LessonEnd { part: string; pin: string }
export interface LessonStep { text: string; parts: LessonPart[]; connect: [LessonEnd, LessonEnd][] }
export interface Lesson { id: string; title: string; summary: string; steps: LessonStep[] }
export interface Level { id: number; title: string; lessons: Lesson[] }

export const LEVELS: Level[] = [
  {
    id: 1, title: 'Nível 1 — Fundamentos',
    lessons: [
      {
        id: 'led-resistor', title: 'LED com resistência limitadora',
        summary: 'Um LED precisa de uma resistência em série para limitar a corrente. Sem ela, queima.',
        steps: [
          {
            text: 'Coloque uma bateria de 9 V, um resistor e um LED. Ligue o positivo da bateria a um terminal do resistor.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'R1', type: 'resistor' }, { key: 'LED1', type: 'led' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'R1', pin: '1' }]],
          },
          {
            text: 'Ligue o outro terminal do resistor ao ânodo (+, terminal comprido) do LED.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'LED1', pin: 'A' }]],
          },
          {
            text: 'Ligue o cátodo (−, lado plano) do LED ao negativo da bateria. O LED deve acender.',
            parts: [],
            connect: [[{ part: 'LED1', pin: 'K' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
      {
        id: 'divider', title: 'Divisor de tensão',
        summary: 'Dois resistores em série dividem a tensão: V_meio = V · R2 / (R1 + R2).',
        steps: [
          {
            text: 'Coloque a bateria de 9 V e dois resistores. Ligue o positivo da bateria ao primeiro resistor.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'R1', type: 'resistor' }, { key: 'R2', type: 'resistor' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'R1', pin: '1' }]],
          },
          {
            text: 'Ligue os dois resistores em série: o ponto entre eles é a saída do divisor.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'R2', pin: '1' }]],
          },
          {
            text: 'Feche o circuito ligando o segundo resistor ao negativo da bateria.',
            parts: [],
            connect: [[{ part: 'R2', pin: '2' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
      {
        id: 'parallel', title: 'Resistores em paralelo',
        summary: 'Em paralelo, a resistência equivalente baixa: 1/Req = 1/R1 + 1/R2. A corrente total divide-se pelos ramos.',
        steps: [
          {
            text: 'Coloque a bateria de 9 V e dois resistores. Ligue o positivo da bateria a um terminal de cada resistor.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'R1', type: 'resistor' }, { key: 'R2', type: 'resistor' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'R1', pin: '1' }], [{ part: 'BAT', pin: '+' }, { part: 'R2', pin: '1' }]],
          },
          {
            text: 'Ligue os outros dois terminais dos resistores ao negativo da bateria.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'BAT', pin: '-' }], [{ part: 'R2', pin: '2' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
    ],
  },
  {
    id: 2, title: 'Nível 2 — Interruptores',
    lessons: [
      {
        id: 'button-pulldown', title: 'Botão com resistência pull-down',
        summary: 'Uma entrada flutuante lê valores aleatórios. Uma resistência para o negativo define um nível estável quando o botão está solto.',
        steps: [
          {
            text: 'Coloque a bateria, um botão tátil e um resistor de 10 kΩ. Ligue o positivo da bateria a um lado do botão.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'SW1', type: 'push-button' }, { key: 'R1', type: 'resistor' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'SW1', pin: '1A' }]],
          },
          {
            text: 'Ligue o outro lado do botão (2A) ao resistor de pull-down e ao ponto de leitura.',
            parts: [],
            connect: [[{ part: 'SW1', pin: '2A' }, { part: 'R1', pin: '1' }]],
          },
          {
            text: 'Ligue o resistor de pull-down ao negativo da bateria.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
      {
        id: 'rc-charge', title: 'Carga de um condensador (RC)',
        summary: 'Um condensador carrega-se através de um resistor com constante de tempo τ = R·C. Ao fim de 5τ está quase carregado.',
        steps: [
          {
            text: 'Coloque a bateria de 9 V, um resistor e um condensador eletrolítico (polarizado).',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'R1', type: 'resistor' }, { key: 'C1', type: 'capacitor-electrolytic' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'R1', pin: '1' }]],
          },
          {
            text: 'Ligue o resistor ao terminal positivo (+) do condensador.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'C1', pin: '1' }]],
          },
          {
            text: 'Ligue o terminal negativo (−) do condensador ao negativo da bateria. Atenção: o condensador só aceita tensão no sentido correto.',
            parts: [],
            connect: [[{ part: 'C1', pin: '2' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
    ],
  },
  {
    id: 3, title: 'Nível 3 — Semicondutores',
    lessons: [
      {
        id: 'transistor-switch', title: 'Transístor como interruptor',
        summary: 'Um pequeno sinal na base comanda a corrente grande entre coletor e emissor.',
        steps: [
          {
            text: 'Coloque a bateria, um LED e um transístor NPN (2N2222A). Ligue o ânodo do LED ao positivo.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'LED1', type: 'led' }, { key: 'Q1', type: 'bjt-npn' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'LED1', pin: 'A' }]],
          },
          {
            text: 'Ligue o cátodo do LED ao coletor (C) do transístor. Atenção: a ordem dos pinos depende do modelo.',
            parts: [],
            connect: [[{ part: 'LED1', pin: 'K' }, { part: 'Q1', pin: 'C' }]],
          },
          {
            text: 'Ligue o emissor (E) ao negativo da bateria.',
            parts: [],
            connect: [[{ part: 'Q1', pin: 'E' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
      {
        id: 'opamp-comparator', title: 'Comparador com amplificador operacional',
        summary: 'Sem realimentação, o amp-op compara as duas entradas: a saída vai para o positivo ou para o negativo da alimentação.',
        steps: [
          {
            text: 'Coloque a bateria de 9 V e um LM358. Alimente o LM358: VCC ao positivo e GND ao negativo da bateria.',
            parts: [{ key: 'BAT', type: 'battery-9v' }, { key: 'U1', type: 'lm358' }],
            connect: [[{ part: 'BAT', pin: '+' }, { part: 'U1', pin: '8' }], [{ part: 'BAT', pin: '-' }, { part: 'U1', pin: '4' }]],
          },
          {
            text: 'Ligue a entrada não-inversora (IN+) do primeiro amp-op ao positivo da bateria. A entrada inversora (IN−) fica ligada ao negativo: o amp-op compara os dois.',
            parts: [],
            connect: [[{ part: 'U1', pin: '3' }, { part: 'BAT', pin: '+' }], [{ part: 'U1', pin: '2' }, { part: 'BAT', pin: '-' }]],
          },
        ],
      },
    ],
  },
  {
    id: 4, title: 'Nível 4 — Microcontroladores',
    lessons: [
      {
        id: 'uno-blink', title: 'Piscar um LED com o Arduino',
        summary: 'O pino D13 liga e desliga o LED no programa. O GND da placa fecha o circuito.',
        steps: [
          {
            text: 'Coloque um Arduino Uno, um resistor e um LED. Ligue o pino D13 ao resistor.',
            parts: [{ key: 'U1', type: 'arduino-uno' }, { key: 'R1', type: 'resistor' }, { key: 'LED1', type: 'led' }],
            connect: [[{ part: 'U1', pin: 'D13' }, { part: 'R1', pin: '1' }]],
          },
          {
            text: 'Ligue o resistor ao ânodo do LED.',
            parts: [],
            connect: [[{ part: 'R1', pin: '2' }, { part: 'LED1', pin: 'A' }]],
          },
          {
            text: 'Ligue o cátodo do LED a um GND da placa.',
            parts: [],
            connect: [[{ part: 'LED1', pin: 'K' }, { part: 'U1', pin: '^GND' }]],
          },
          {
            text: 'Escreva o programa no separador Programa, carregue "Piscar LED" e clique em Aplicar. Ligue a simulação para ver o LED piscar.',
            parts: [],
            connect: [],
          },
        ],
      },
      {
        id: 'uno-button', title: 'Ler um botão com o Arduino',
        summary: 'Com INPUT_PULLUP, o pino fica em HIGH até o botão o ligar ao GND. Não é preciso resistor externo.',
        steps: [
          {
            text: 'Coloque um Arduino Uno e um botão tátil. Ligue o pino D2 a um lado do botão.',
            parts: [{ key: 'U1', type: 'arduino-uno' }, { key: 'SW1', type: 'push-button' }],
            connect: [[{ part: 'U1', pin: 'D2' }, { part: 'SW1', pin: '1A' }]],
          },
          {
            text: 'Ligue o outro lado do botão (2A) a um GND da placa.',
            parts: [],
            connect: [[{ part: 'SW1', pin: '2A' }, { part: 'U1', pin: '^GND' }]],
          },
          {
            text: 'No programa, use pinMode(2, INPUT_PULLUP) e leia digitalRead(2): LOW quer dizer botão premido.',
            parts: [],
            connect: [],
          },
        ],
      },
    ],
  },
];

export const allLessons = () => LEVELS.flatMap((l) => l.lessons.map((lesson) => ({ level: l.id, lesson })));
