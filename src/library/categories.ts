import type { CategoryId } from './types';

export const CATEGORIES: { id: CategoryId; name: string; short: string }[] = [
  { id: 'passive', name: 'Componentes passivos', short: 'Passivos' },
  { id: 'semis', name: 'Semicondutores', short: 'Semicond.' },
  { id: 'ics', name: 'Circuitos integrados', short: 'CIs' },
  { id: 'power', name: 'Fontes de alimentação', short: 'Fontes' },
  { id: 'sensors', name: 'Sensores', short: 'Sensores' },
  { id: 'actuators', name: 'Atuadores e saídas', short: 'Atuadores' },
  { id: 'mcu', name: 'Microcontroladores', short: 'MCU' },
  { id: 'assembly', name: 'Montagem e ligação', short: 'Montagem' },
  { id: 'instruments', name: 'Instrumentos', short: 'Instrum.' },
];
