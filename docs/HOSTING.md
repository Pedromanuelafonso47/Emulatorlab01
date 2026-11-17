# Hospedagem do serviço de compilação

O simulador (a aplicação web) é estático. O serviço de compilação (`tools/compile-server.mjs`) precisa de
correr num sítio com o `arduino-cli` instalado. Os dois são independentes: a aplicação só precisa do URL
do serviço.

## 1. Construir a imagem

Na raiz do repositório:

    docker build -f tools/Dockerfile -t electrolab-compile .
    docker run -p 8080:8080 -e ALLOWED_ORIGINS=https://o-seu-site.exemplo electrolab-compile

A imagem instala o `arduino-cli`, o núcleo `arduino:avr` (Uno, Nano, Mega) e o núcleo `rp2040:rp2040`
(Pico) durante a construção; em execução não precisa de aceder ao índice de placas.

## 2. Variáveis do serviço

| Variável | Predefinido | Função |
|---|---|---|
| `PORT` | 8080 (imagem) / 8787 | Porta de escuta |
| `HOST` | 0.0.0.0 (imagem) / 127.0.0.1 | Endereço de escuta |
| `ALLOWED_ORIGINS` | localhost | Origens do browser permitidas, separadas por vírgulas. **Defina sempre em produção.** |
| `MAX_CONCURRENT` | 2 | Compilações em paralelo |
| `COMPILE_TIMEOUT_S` | 120 | Tempo máximo por compilação |
| `RATE_PER_MINUTE` | 30 | Pedidos de compilação por IP e por minuto |

O serviço não guarda o código das sketches: o HEX é guardado numa cache em memória e os ficheiros de
trabalho são apagados depois de cada compilação.

## 3. Ligar a aplicação ao serviço

Na construção da aplicação (`npm run build`), defina:

    VITE_COMPILE_URL=https://o-seu-servico.exemplo

Sem esta variável, a aplicação usa `http://127.0.0.1:8787` (desenvolvimento local).

## 4. Escolher o sítio

A imagem precisa de um serviço que corra contentores com HTTPS (por exemplo Render, Fly.io ou Railway).
Escolha um plano com memória suficiente para o toolchain (recomendado: 1 GB de RAM). Crie a conta e o
serviço no fornecedor escolhido; as credenciais são suas e não devem ser partilhadas no código.

## 5. Verificação depois de publicar

    curl -s -X POST https://o-seu-servico.exemplo/compile \
      -H "Origin: https://o-seu-site.exemplo" -H "Content-Type: application/json" \
      -d '{"fqbn":"arduino:avr:uno","code":"void setup(){} void loop(){}"}'

A resposta deve ser `{"ok":true,"hex":...}`. Um pedido de uma origem não permitida recebe `403`.
