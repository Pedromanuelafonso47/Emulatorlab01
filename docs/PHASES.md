# ElectroLab — Plano de fases e estado

## Estado atual (resumo honesto)

| Fase | Estado | O que falta |
|---|---|---|
| 1 Interface e biblioteca | ✅ | — |
| 2 Modelo DC | ✅ | — |
| 3 Instrumentos | ✅ | — |
| 4 Transitório e AC | ✅ | — (modelos de cada componente estão em `engine/sim/models.ts`; a biblioteca lê o estado deles) |
| 5 Microcontroladores | 🟡 em curso | **Uno, Nano e Mega** executam o programa compilado no emulador (avr8js: ATmega328P e ATmega2560, pinos do núcleo oficial do Arduino). Compilação pelo `arduino-cli` no serviço `tools/compile-server.mjs` (`npm run compile-service`; imagem e guia em `docs/HOSTING.md`). Quando o serviço não responde, ou a sketch precisa de uma biblioteca que o compilador não tem (ex.: DHT), a placa corre no interpretador próprio. **ESP32 e ESP8266:** usam o CPU Xtensa, para o qual não há emulador JavaScript fiável; ficam no interpretador. **Pico:** ver estado no commit mais recente. |
| 6 Aprender | 🟡 parcial | 9 aulas em 4 níveis, passos validados contra o netlist; os pinos citados são verificados contra a biblioteca. Falta mais conteúdo. |
| 7 Plataforma | 🟡 código pronto, não verificado | Cliente Supabase (`src/cloud/supabase.ts`), esquema com RLS (`supabase/schema.sql`) e secção Nuvem. Testado só contra servidor simulado. Falta um projeto Supabase real e as suas credenciais. |

Padrões de qualidade usados: os testes da suíte (`npm test`) cobrem o simulador, o interpretador, o host, as aulas e o cliente da nuvem; a folha de peças (`src/library/render/sheet.test.ts`) é uma ferramenta de revisão visual, ativada por variáveis de ambiente.

## Fase 1 — Interface, área de trabalho, biblioteca, ligações ✅ (implementada)

**Implementado e testado**
- Interface profissional: barra superior, biblioteca (esquerda), laboratório (centro), propriedades (direita), consola/erros/netlist (inferior, redimensionável). Painéis recolhíveis; em ecrãs estreitos passam a gavetas sobrepostas.
- Laboratório SVG: zoom (roda / pinch), pan (botão do meio, botão direito, Espaço+arrastar, ferramenta mão), grelha de 0,1″ com encaixe, seleção por clique / Shift / retângulo, mover, rodar (R), espelhar (M), apagar, copiar/colar/duplicar (com os fios internos), setas para ajuste fino, menu de contexto.
- **Biblioteca de 107 entradas** (92 colocáveis + 4 ferramentas de fio + 9 instrumentos anunciados), 9 categorias, pesquisa sem acentos, favoritos, miniaturas geradas a partir da arte real. Desenhos SVG à escala real com gradientes, terminais na posição real (resistor 0,4″, DIP 0,3″, Arduino 68,6 × 53,3 mm).
  - Resistor com **bandas de cor calculadas** (4 bandas ±5 %, 5 bandas ±1 %), condensador cerâmico com código de 3 dígitos, LED com 6 cores, transístores com **ordem de pinos por modelo** (2N2222A EBC vs BC547 CBE).
- Fios: clique num pino → curvas → pino/fio/junção. **Ramificações** (terminar sobre um fio ou duplo clique num fio cria uma junção). Pontos de dobra editáveis, 12 cores, 4 tipos (fio, jumper M-M, M-F, F-F) com pontas desenhadas.
- Identificação de pinos: tooltip com nome, descrição, polaridade e nó elétrico; realce dos pinos ligados.
- **Breadboard funcional** (400 e 830 pontos, barramentos opcionalmente divididos), placa perfurada e placa de tiras: ligações internas reais; um terminal inserido num furo fica ligado (sem fio). Passar o rato num furo realça toda a tira.
- **Netlist** (union-find) e **verificação topológica (ERC)**: curto-circuito direto numa fonte, LED ligado diretamente a uma fonte sem resistência ("Possível sobrecorrente!"), polaridade invertida (LED/eletrolítico), componente com os dois terminais na mesma coluna, CI com pinos em curto na breadboard (não atravessa o canal), CI sem VCC/GND, componentes sem ligação.
- Interruptores, botão e DIP switch alteram a conectividade de acordo com o estado.
- Desfazer/refazer (150 níveis, snapshots imutáveis), guardar automático + projetos locais (abrir, duplicar, apagar), importar/exportar JSON, exportar **SVG**, **PNG** (4×) e **BOM (CSV)**.
- 5 exemplos: LED + 9 V, Arduino + LED na breadboard, divisor de tensão, NE555 astável na breadboard, catálogo visual. `?example=<id>` no URL abre um exemplo.
- 19 testes unitários (unidades SI, bandas de cor, integridade da biblioteca, conectividade da breadboard, ERC, ligações do 555).

**Ainda NÃO implementado (de propósito, sem simulação fingida)**
- Nenhum valor de tensão/corrente é calculado nem mostrado. O botão "Simular" informa que o motor chega na Fase 2.
- Os instrumentos aparecem na biblioteca como "Fase 3/4/5" e não podem ser colocados.
- Os estados visuais (LED aceso, motor a rodar, segmentos) já existem nos renderizadores, mas só são acionados pelo simulador.
- Interação direta com componentes durante a simulação (premir o botão no canvas) → Fase 2. Por agora usa-se o painel de propriedades.
- Rotas automáticas de fios: não há (os fios são desenhados à mão, como no Tinkercad).

## Fase 2 — Modelo elétrico + motor DC ✅ (implementada)

**Arquitetura:** `engine/sim/models.ts` (modelo de cada componente) → `compile.ts` (documento + netlist → elementos) → `solver.ts` (MNA + Newton-Raphson, puro, corre num Web Worker) → `interpret.ts` (valores por pino, estados visuais, avisos). A sessão (`store/sim.ts`) recalcula a cada alteração enquanto a simulação está ativa; se o Worker falhar, resolve na thread principal.

**Solver:** análise nodal modificada; díodos/LEDs (Shockley + resistência série + rutura Zener), BJT (Ebers–Moll), MOSFET/JFET (lei quadrática), limitação de junção estilo SPICE (pnjlim), gmin stepping e source stepping; elementos com modos discretos (saturação de amp-ops, dropout de reguladores, níveis lógicos, fonte CV/CC, relés, fusíveis); deteção de nós flutuantes e de sistemas sem solução (laços de fontes).

**Componentes simulados (DC):** resistor, potenciómetro (linear/log), NTC, PTC (aprox.), LDR, fusível, condensadores (abertos em DC), indutores (resistência DC), díodos, Zener, Schottky, LEDs (6 cores), ponte retificadora, NPN/PNP, MOSFET N/P, JFET, LM358/LM324/LM741, 74HC00/08/32/04, ULN2003, 7805/7812/LM317, pilhas/baterias com resistência interna, fonte de bancada CV/CC, fonte de tensão e de corrente, painel solar, LM35, PIR, sensor IR, humidade do solo, MQ-2, módulo LDR, ACS712, sensor de tensão, placa de chuva, motores/ventoinha/solenoide/lâmpada (cargas), relé, buzzer, display de 7 segmentos, Arduino/ESP/Pico (rails de alimentação USB). Interruptores, botões e breadboards via netlist.

**Interface:** botão Simular/Parar; LED acende pela corrente calculada, motores rodam, relé/solenoide/buzzer/fusível mostram o estado; tensão e corrente em cada etiqueta (componentes de 2 terminais); tooltip com V e I em qualquer pino ou furo; painel de propriedades com V/I/P por pino; separador “Simulação” com tensões dos nós e tabela de correntes e potências; botões, interruptores, PIR e sensor IR operáveis com o rato durante a simulação.

**Avisos quantitativos (com valores reais):** sobrecorrente no LED, potência acima da nominal (resistores, Zener, transístores, reguladores), condensador eletrolítico invertido/sobretensão, corrente excessiva da bateria, bateria a ser carregada, fonte em limitação CC, regulador em dropout, corrente de base excessiva, fusível queimado, consumo excessivo no pino 5 V do Arduino, nós flutuantes.

**Testes:** 23 testes do simulador contra soluções analíticas (divisor, resistência interna, LED, díodo, Zener, BJT saturado/ativo, PNP, MOSFET, 7805 com dropout, LM317, amp-op seguidor/comparador, fonte CC, NAND, ponte, relé, fusível, nó flutuante, Arduino 5 V, exemplos). Total: 42 testes.

**Ainda NÃO implementado (assinalado na interface, nunca simulado de forma falsa)**
- Comportamento temporal: carga/descarga de condensadores, indutores, 555, flip-flops/contadores, TRIAC/SCR, fontes AC e gerador de sinais, transformador → Fase 4. Estes componentes aparecem como “não simulado” e são tratados como circuito aberto.
- Pinos de E/S dos microcontroladores (sem código) → Fase 5. DHT, HC-SR04, encoder, servo e passo: apenas consumo.
- Força contra-eletromotriz dos motores e resistência a frio das lâmpadas.
- Temperatura dos componentes (os avisos de potência são por limiar, sem modelo térmico).

## Fase 3 — Instrumentos e análise
Multímetro com pontas de prova, voltímetro/amperímetro/wattímetro, análise explicada do circuito (assistente baseado no netlist + resultados), mais regras ERC para a breadboard.

## Fase 4 — Simulação dinâmica e AC
Transitório (trapezoidal/BE, passo adaptativo), condensadores/indutores, RC/RL, retificadores, transformador, fontes AC e gerador de funções, osciloscópio, frequencímetro; macro-modelos de amp-op, 555, reguladores e lógica.

## Fase 5 — Microcontroladores
Editor CodeMirror, compilação arduino-cli (serviço), avr8js para Uno/Nano/Mega, rp2040js para Pico, ESP32/ESP8266 ao nível da API Arduino, monitor serial, analisador lógico.

## Fase 6 — Aprender Eletrónica
Aulas em 4 níveis, montagem guiada passo a passo validada contra o netlist (o netlist já permite verificar "o pino X está ligado ao pino Y").

## Fase 7 — Plataforma
API Fastify + Prisma + PostgreSQL, autenticação, projetos na nuvem públicos/privados, partilha por link, progresso, desafios, calculadoras, glossário e fórmulas.
