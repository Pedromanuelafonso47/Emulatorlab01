# ElectroLab

Plataforma web para montar, simular e aprender eletrónica. Monta-se o circuito numa breadboard virtual,
liga-se um instrumento, carrega-se em **Simular** e vê-se a corrente e a tensão em cada ponto, no tempo.
Os microcontroladores Arduino correm o código real, compilado e executado num emulador do processador.

---

## O problema

Aprender eletrónica exige montar circuitos e medi-los. Na prática isso esbarra em três obstáculos:

1. **Custo e fragilidade.** Uma bancada completa (fonte, multímetro, osciloscópio, breadboard, componentes)
   custa caro, e os componentes queimam-se facilmente quando alguém se engana numa ligação.
2. **Erros invisíveis.** Um LED sem resistência, um condensador ligado ao contrário ou um pino de Arduino
   em curto não avisam por si. Só se percebe o erro depois de algo aquecer ou deixar de funcionar.
3. **Teoria sem prática visível.** A Lei de Ohm, um divisor de tensão ou um filtro RC são fórmulas no papel.
   Falta ver a corrente a passar e a tensão a cair.

Os simuladores existentes resolvem parte disto, mas muitos são pesados, pagos, ou não mostram o circuito
da forma como o construímos numa breadboard real.

## A solução

O ElectroLab junta quatro coisas num só ambiente, no navegador e sem instalação:

- **Um editor de circuitos com aspeto real:** biblioteca de 107 componentes desenhados à escala, breadboards
  com ligações internas corretas, fios com cores e ramificações, e verificação elétrica (ERC) que avisa de
  curtos, polaridades invertidas e componentes sem ligação.
- **Um motor de simulação de verdade:** análise nodal modificada com Newton-Raphson, em DC e no tempo
  (transitório, AC, condensadores, indutores, 555, lógica sequencial, tiristores, transformador).
  A simulação corre num Web Worker, por isso a interface não congela.
- **Instrumentos no próprio circuito:** multímetro, voltímetro, amperímetro, wattímetro, osciloscópio de
  dois canais e frequencímetro, ligados com pontas de prova como num laboratório.
- **Aprendizagem guiada:** aulas em quatro níveis (fundamentos, interruptores, semicondutores e
  microcontroladores). Cada passo só conta quando as peças existem e as ligações estão no netlist.

### Microcontroladores

Um programa de Arduino é compilado pelo `arduino-cli` e executado num emulador do processador
(**avr8js**): ATmega328P para o Uno e o Nano, ATmega2560 para o Mega. O núcleo oficial do Arduino corre
sem alterações, por isso `delay`, `millis`, PWM, `Serial` e `Servo` comportam-se como na placa real.
Os pinos do programa ligam-se ao circuito: um LED no D13 acende, um botão no D2 lê-se, um potenciómetro
no A0 mede-se.

Para placas que não têm emulador de processador (ESP32, ESP8266) existe um **interpretador próprio** de um
subconjunto de C/Arduino, com `Servo` e `DHT` como objetos. Serve para estudar a lógica de um programa.

---

## Estado do projeto

| Área | Estado |
|---|---|
| Editor, biblioteca, breadboard, netlist, ERC | ✅ Implementado |
| Simulação DC, transitória e AC | ✅ Implementado |
| Instrumentos (multímetro, osciloscópio, etc.) | ✅ Implementado |
| Arduino Uno e Nano (emulador ATmega328P) | ✅ Implementado |
| Arduino Mega (emulador ATmega2560) | ✅ Implementado |
| ESP32 e ESP8266 | 🟡 Só interpretador (sem emulador fiável do CPU Xtensa) |
| Raspberry Pi Pico (RP2040) | 🟡 Núcleo compila, mas o arranque precisa da bootrom do chip, que não está disponível |
| Aulas guiadas | 🟡 9 aulas em 4 níveis; falta mais conteúdo |
| Contas e projetos na nuvem (Supabase) | 🟡 Cliente e esquema prontos; falta aplicar o esquema e testar com um projeto real |
| Serviço de compilação em produção | 🟡 Imagem Docker escrita; falta publicar num fornecedor |

O detalhe fase a fase está em [`docs/PHASES.md`](docs/PHASES.md).

---

## Como correr

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev              # aplicação em http://localhost:5173
```

Para compilar sketches Arduino (Uno, Nano, Mega) é preciso também o serviço de compilação, em
outro terminal:

```bash
npm run compile-service  # compilação em http://127.0.0.1:8787
```

O serviço usa o `arduino-cli` instalado em `tools/bin/` (ver abaixo). Sem ele, a aplicação continua a
funcionar, mas as placas Arduino passam a correr no interpretador e a consola avisa.

### Instalar o arduino-cli (uma vez)

1. Descarregue o `arduino-cli` para o seu sistema em <https://arduino.github.io/arduino-cli/>.
2. Coloque o executável em `tools/bin/` (no Windows, `arduino-cli.exe`).
3. Crie `tools/arduino-cli.yaml` com `arduino-cli config init` e, dentro da pasta `tools/`, instale os
   núcleos:

   ```bash
   tools/bin/arduino-cli --config-file tools/arduino-cli.yaml core update-index
   tools/bin/arduino-cli --config-file tools/arduino-cli.yaml core install arduino:avr
   ```

Os binários e a pasta de trabalho não entram no git (ver `.gitignore`).

### Testes

```bash
npm test                 # suíte completa (Vitest): simulador, interpretador, emulador AVR, aulas, nuvem
npm run build            # verificação de tipos e build de produção em dist/
```

---

## Arquitetura

```
src/
  domain/        modelo do documento (componentes, fios, junções) e geometria
  library/       biblioteca de componentes: registo, pinos, desenho SVG, modelos
    parts/       definições por categoria (passivos, semicondutores, sensores, atuadores, MCU, CIs, …)
    render/      primitivos e encapsulamentos partilhados (DIP, TO-92, TO-220, módulos)
  editor/        área de trabalho (SVG): zoom, seleção, arrastar, fios
  engine/
    netlist.ts   ligações elétricas (union-find) a partir do desenho
    erc.ts       verificação elétrica (curtos, polaridade, nós flutuantes)
    sim/         simulador: compile → solver (MNA + Newton-Raphson) → runner em tempo real → worker
  mcu/           microcontroladores
    lang/        parser e interpretador de sketches (subconjunto de C/Arduino)
    avr/         emulador AVR (avr8js), dispositivos ATmega328P/2560, compilação, pinos do Mega
    host.ts      liga o programa aos pinos do circuito (drivers de saída, pull-ups, ADC, serial)
  learn/         aulas guiadas e validação contra o netlist
  cloud/         cliente Supabase (projetos na nuvem)
  store/         estado (Zustand): editor e simulação
  ui/            interface: barra superior, bibliotecas, propriedades, painel inferior (consola, Programa,
                 Monitor série, Aprender, osciloscópio, medições)
tools/
  compile-server.mjs   serviço de compilação (arduino-cli → HEX)
  gen-avr-pins.mjs     gera a tabela de pinos do Mega a partir do núcleo AVR
  Dockerfile           imagem do serviço de compilação
supabase/schema.sql    esquema da base de dados e regras de acesso (RLS)
```

**Como um circuito é simulado.** O desenho gera um netlist; o netlist gera um conjunto de elementos
elétricos (resistências, fontes, díodos, transístores, …). O solver resolve as tensões nos nós em cada
instante e o runner avança o tempo a uma velocidade proporcional ao relógio real. A interface lê os
resultados por componente e por pino.

**Como um programa Arduino é executado.** A sketch é enviada para o serviço de compilação, que devolve um
ficheiro HEX. O HEX é carregado no emulador do processador. Antes de cada passo da simulação, o host
avança o processador até ao tempo simulado, lê o estado dos pinos e aplica-o aos drivers do circuito; o
ADC lê a tensão real dos nós.

---

## Nuvem (Supabase, opcional)

Sem configuração, os projetos ficam guardados no navegador. Para ativar a nuvem:

1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor. Cria a tabela `projects` e as regras de acesso: cada
   utilizador só vê e altera os seus projetos, e os marcados como públicos podem ser lidos por qualquer pessoa.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (a chave anónima/publicável; nunca a chave de serviço).

O `.env.local` está no `.gitignore`.

## Publicar

- **Aplicação:** `npm run build` gera `dist/`, que é estático e pode ser servido por qualquer alojamento.
  Defina `VITE_COMPILE_URL` com o endereço do serviço de compilação, e `VITE_SUPABASE_*` se usar a nuvem.
- **Serviço de compilação:** imagem Docker em `tools/Dockerfile`. Passos e variáveis de ambiente em
  [`docs/HOSTING.md`](docs/HOSTING.md). Defina sempre `ALLOWED_ORIGINS` com o endereço da aplicação.

## Limitações conhecidas

- O interpretador próprio cobre um subconjunto de C; bibliotecas externas não estão disponíveis nele.
- Nas placas emuladas, as bibliotecas que não estão no núcleo do Arduino (por exemplo `DHT`) não compilam.
- O emulador não modela o comportamento analógico de todos os periféricos (por exemplo, A8–A15 do Mega).
- Os modelos elétricos são aproximações úteis para aprender, não substituem medições em hardware real.

## Contribuir

Para acrescentar uma peça, crie a definição em `src/library/parts/` com `registerComponent({...})`
(pinos na grelha de 0,1″, propriedades, desenho SVG e modelo elétrico em `src/engine/sim/models.ts`).
O teste `library integrity` verifica a grelha e o desenho; o teste de estado garante que a biblioteca
mostra o estado do modelo.

Para acrescentar uma aula, acrescente um objeto em `src/learn/lessons.ts`. O teste de conteúdo verifica
que cada pino citado existe na peça da biblioteca.
