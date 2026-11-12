# ElectroLab — Plano de fases e estado

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

## Fase 2 — Modelo elétrico + motor DC
MNA em Web Worker; resistores, fontes, interruptores, díodos/LEDs (Newton-Raphson), BJT/MOSFET simples; tensões de nó, correntes, potência, deteção de nós flutuantes/matriz singular; LED acende pela corrente calculada; avisos quantitativos (sobrecorrente real, P > P nominal).

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
