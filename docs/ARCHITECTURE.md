# ElectroLab — Arquitetura do Sistema

> Documento vivo. Descreve a arquitetura-alvo completa (Fases 1–7) e assinala o que já existe.
> Estado atual: **Fases 1 e 2 implementadas** (ver `docs/PHASES.md`).

---

## 1. Arquitetura geral

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                          │
│  UI (React + Tailwind)                                                   │
│  ├─ TopBar · LibraryPanel · Canvas (SVG) · PropertiesPanel · BottomPanel │
│  └─ Learn (aulas, montagem guiada) · Code editor (Fase 5)                │
│            │  ações                     ▲ estado                         │
│            ▼                            │                                │
│  Store (Zustand + Immer)  ── documento do circuito + UI + histórico      │
│            │  documento (JSON puro, serializável)                        │
│            ▼                                                             │
│  Domínio puro (TypeScript, sem React)                                    │
│  ├─ library/   definições de componentes (pinos, props, modelo elétrico) │
│  ├─ engine/netlist   grafo de conectividade (union-find)                 │
│  ├─ engine/erc       verificação de regras elétricas                     │
│  ├─ engine/sim       MNA + Newton-Raphson + integração temporal (F2/F4)  │
│  └─ mcu/             emulação de microcontroladores (F5)                 │
│            │                                                             │
│  Web Workers: simulador e emuladores de MCU correm fora da thread de UI  │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ REST/JSON (Fase 7)
┌──────────────────────────────────▼───────────────────────────────────────┐
│  API Node.js (Fastify) · Prisma · PostgreSQL                             │
│  utilizadores, projetos (JSON do documento), partilha, progresso         │
│  (opcional) serviço de compilação Arduino (arduino-cli em contentor)     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Princípio central:** o *documento* do circuito é JSON puro (componentes, fios, junções).
Tudo o resto — netlist, simulação, ERC, BOM, exportação, validação das aulas — é uma
**função pura do documento**. Isto torna o sistema testável, permite undo/redo por snapshots,
guardar/partilhar projetos trivialmente e executar a simulação num Worker.

## 2. Estrutura de pastas

```
emulator/
├─ docs/                    ARCHITECTURE.md, PHASES.md
├─ public/
├─ src/
│  ├─ domain/               tipos do documento, geometria, unidades SI   (puro)
│  ├─ library/              biblioteca de componentes                    (puro + SVG)
│  │  ├─ registry.ts        registo central: registerComponent / getDef
│  │  ├─ categories.ts
│  │  ├─ parts/             definições por categoria (passive, semis, ics, ...)
│  │  └─ render/            primitivas e renderizadores SVG paramétricos
│  ├─ engine/               netlist, ERC  (F2+: sim/ MNA, modelos, solver)
│  ├─ store/                Zustand: documento, seleção, viewport, histórico
│  ├─ editor/               Canvas SVG, interação, fios, seleção
│  ├─ ui/                   painéis, barra superior, diálogos
│  ├─ persistence/          localStorage, import/export (JSON, SVG, PNG, BOM)
│  ├─ learn/      (F6)      aulas, motor de montagem guiada
│  ├─ mcu/        (F5)      avr8js, runtime de periféricos, editor
│  └─ main.tsx, App.tsx
└─ server/        (F7)      API Fastify + Prisma
```

O domínio (`domain/`, `library/` exceto `render/`, `engine/`) não importa React — pode ser
extraído para pacotes (`packages/sim-engine`, …) num monorepo quando o backend chegar.

## 3. Tecnologias e justificação

| Área | Escolha | Porquê |
|---|---|---|
| Build/SPA | **Vite + React 18 + TypeScript** | O editor é uma aplicação 100 % cliente, interativa, sem SEO. Next.js acrescentaria SSR/hidratação sem benefício no editor. As páginas públicas (partilha, perfil) podem viver no mesmo SPA; se SEO for necessário, um Next.js pode ser acrescentado só para essas páginas. |
| Estado | **Zustand + Immer** | Store mínima, seletores granulares (evita re-render do canvas inteiro), Immer dá atualizações imutáveis → undo/redo por snapshot barato (partilha estrutural). |
| Editor | **SVG** (não Canvas 2D/WebGL) | Componentes vetoriais nítidos a qualquer zoom, gradientes/filtros para realismo, hit-testing e acessibilidade nativos. Centenas de componentes e uma breadboard de 830 furos cabem confortavelmente. Os pinos usam hit-testing geométrico próprio (não um nó DOM por pino). |
| 3D | React Three Fiber — **não na Fase 1** | Útil para pré-visualização 3D de um componente/placa. O editor de montagem é 2D (como Tinkercad/Fritzing); 3D no editor prejudicaria precisão de ligação. |
| Estilos | Tailwind CSS | Painéis consistentes e rápidos de iterar. |
| Simulação | **Motor MNA próprio em TypeScript** (Fases 2/4), num Web Worker | Ver §4. ngspice-WASM avaliado como verificador/back-end avançado. |
| MCU | **avr8js** (ATmega328P/2560 ciclo-a-ciclo) | Ver §7. |
| Backend (F7) | Node.js + **Fastify** + Prisma + PostgreSQL | Projetos guardados como JSONB (o documento), relações para utilizadores/partilha/progresso. |
| Testes | Vitest | Mesmo pipeline do Vite; o domínio puro é testado sem DOM. |

## 4. Estratégia do motor de simulação

**Formulação:** *Modified Nodal Analysis* (MNA), a mesma base do SPICE.

1. **Netlist** (já implementado, `engine/netlist.ts`): union-find sobre pinos, junções,
   fios, ligações internas (breadboard, botões) e pinos coincidentes (componente inserido
   num furo). Produz nós elétricos; o nó que contém GND/terminal negativo de referência é o nó 0.
2. **Stamps:** cada definição de componente declara um `model` elétrico que "carimba" a
   matriz `G·x = b`: resistor (condutância), fonte de tensão (linha extra MNA), fonte de corrente,
   interruptor (R muito baixa/alta), condensador/indutor (modelo companheiro da integração),
   díodo/LED (Shockley linearizado), BJT (Ebers-Moll/Gummel-Poon simplificado), MOSFET (nível 1),
   amp-op (macro-modelo com ganho finito, saturação nos rails), reguladores (macro-modelo
   comportamental), lógica digital (fonte comportamental com limiares).
3. **Não-linear:** Newton-Raphson com *limiting* de tensão de junção (como no SPICE),
   *gmin stepping* e *source stepping* quando não converge.
4. **Transitório (Fase 4):** integração trapezoidal com recuo para Backward-Euler, passo
   adaptativo por estimativa de erro (LTE); eventos discretos para lógica/MCU.
5. **AC:** sinais AC simulados no domínio do tempo (transitório) → osciloscópio mostra a forma
   de onda real; análise AC de pequeno sinal (fasores complexos) como extra.
6. **Diagnóstico:** matriz singular → nó flutuante / circuito aberto identificado; laço de
   fontes de tensão → curto-circuito; componentes avaliam limites (I_max do LED, P do resistor,
   tensão inversa do eletrolítico) e geram avisos explicados em linguagem simples.
7. **Execução:** Worker dedicado; a UI envia o documento, recebe tensões de nó, correntes por
   ramo e estado dos componentes (LED aceso, motor a rodar) a ~30–60 Hz.
8. **Honestidade:** cada definição tem `sim.status: 'implemented' | 'partial' | 'none'`.
   Um componente sem modelo é assinalado e o simulador recusa-se a inventar valores.
9. **Validação:** testes comparam resultados com soluções analíticas (divisor, RC τ, retificador)
   e, offline, com ngspice para circuitos de referência.

**ngspice (WASM):** precisão de referência mas ~5–10 MB, arranque lento, sem integração natural
com MCU em tempo real e difícil de fazer interativo. Plano: motor próprio para tempo real;
ngspice como modo "análise avançada" opcional (DC sweep, AC, ruído) numa fase posterior.

## 5. Estratégia de representação visual dos componentes

- **Escala real:** 1 unidade = 0,254 mm, **grelha = 10 unidades = 0,1″ (2,54 mm)**, o passo
  real dos pinos. Um resistor de ¼ W ocupa 0,4″, um DIP tem filas a 0,3″, o Arduino Uno tem
  as dimensões reais (68,6 × 53,3 mm) — por isso os componentes encaixam fisicamente na breadboard.
- **Pinos sempre na grelha** relativamente à origem do componente; a rotação é feita em
  torno da origem (múltiplos de 90°) → os pinos continuam na grelha após rodar.
- **Renderizadores paramétricos em SVG** com gradientes partilhados (`<defs>` globais):
  resistor com **bandas de cor calculadas a partir do valor**, DIP genérico (N pinos, entalhe,
  marcação), TO-92, TO-220, módulos PCB com headers, LEDs com cor e brilho reais, etc.
  Isto permite acrescentar dezenas de CIs/sensores com poucas linhas.
- **Registo extensível:** `registerComponent(def)` — cada definição declara pinos (nome,
  função, polaridade), propriedades (tipo, unidade, limites), ligações internas, modelo
  elétrico, ficha técnica e renderizador. Acrescentar um componente = um ficheiro.
- **Estado visual dinâmico:** o renderizador recebe `state` (ex. `brightness`, `segments`,
  `angle`) vindo da simulação — mesma função desenha o LED apagado ou aceso.

## 6. Estratégia da breadboard

- A breadboard é **um componente normal** com 400/830 pinos (furos) e
  `internalConnections`: cada coluna a–e, cada coluna f–j e cada barramento de alimentação
  formam um grupo. O union-find junta esses grupos → a conectividade real é respeitada pelo
  mesmo código que trata os fios.
- **Inserção:** um pino de componente que coincide (mesma posição na grelha) com um furo fica
  ligado a esse furo — não é preciso fio. Como tudo está à escala 0,1″, um DIP colocado sobre o
  canal central fica com cada pino na sua coluna.
- **Visualização:** ao passar o rato sobre um furo, todo o grupo interno é realçado; furos
  ocupados por pinos são marcados.
- **Erros de montagem (ERC):** pinos do mesmo componente na mesma coluna (curto, ex. LED
  inserido na vertical), CI sem atravessar o canal, barramentos sem alimentação, etc.
- Barramentos divididos a meio (comum em breadboards de 830) serão uma propriedade.

## 7. Estratégia para executar código Arduino e ESP32

- **Arduino Uno/Nano/Mega/ATmega328P — emulação real com avr8js:** o código é compilado
  para `.hex` por um serviço `arduino-cli` (contentor no backend; o mesmo modelo usado pelo
  Wokwi). O `.hex` corre no avr8js num Worker, ciclo-a-ciclo, com timers, USART (monitor
  serial), ADC e GPIO reais. Os registos de porta são mapeados para os pinos do componente no
  circuito → o simulador elétrico vê um pino como fonte de tensão (OUTPUT) ou alta impedância
  com leitura de limiar (INPUT), e o ADC lê a tensão do nó.
- **Modo offline/educativo:** um interpretador de um subconjunto de C++/Arduino
  (`pinMode`, `digitalWrite`, `analogRead`, `delay`, `millis`, `Serial`, `if/for/while`,
  funções) para correr sem servidor; claramente identificado como "interpretado".
- **ESP32/ESP8266:** não existe emulador Xtensa/RISC-V leve e fiável no browser. Plano:
  executar o *sketch* sobre a mesma camada de API Arduino (HAL virtual: GPIO, ADC, PWM/LEDC,
  Serial, WiFi simulado), sem emular o CPU. Será indicado explicitamente como "emulação a nível
  de API". Raspberry Pi Pico: rp2040js (emulação real, também usado pelo Wokwi) + MicroPython.
- **PIC:** a avaliar (gpsim não existe em WASM maduro) → inicialmente sem execução, assinalado.
- **Separação:** `mcu/` expõe `McuRuntime { load, step(ns), pins, serial }`; o editor de código
  (CodeMirror 6, leve, com syntax highlighting e lint) apenas produz código/firmware.

## 8. Plano de implementação

Ver `docs/PHASES.md`.
