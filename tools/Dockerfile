# Compile service image: arduino-cli + the AVR and RP2040 cores + tools/compile-server.mjs.
# Build from the repository root:  docker build -f tools/Dockerfile -t electrolab-compile .
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

ARG ARDUINO_CLI_VERSION=1.6.0
RUN curl -fsSL "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
  | tar -xz -C /usr/local/bin arduino-cli

WORKDIR /app
COPY tools/arduino-cli.docker.yaml /app/tools/arduino-cli.docker.yaml

# Cores are installed at build time, so runtime needs no network access to the core index.
RUN arduino-cli --config-file /app/tools/arduino-cli.docker.yaml core update-index \
 && arduino-cli --config-file /app/tools/arduino-cli.docker.yaml core install arduino:avr \
 && arduino-cli --config-file /app/tools/arduino-cli.docker.yaml core install rp2040:rp2040

COPY tools/compile-server.mjs /app/tools/compile-server.mjs
RUN mkdir -p /app/tools/work && chown -R node:node /app

ENV HOST=0.0.0.0 \
    PORT=8080 \
    ARDUINO_CLI=/usr/local/bin/arduino-cli \
    ARDUINO_CLI_CONFIG=/app/tools/arduino-cli.docker.yaml \
    MAX_CONCURRENT=2 \
    COMPILE_TIMEOUT_S=120 \
    RATE_PER_MINUTE=30

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/compile',{method:'OPTIONS'}).then(r=>process.exit(r.status===403||r.status===204?0:1)).catch(()=>process.exit(1))"
CMD ["node", "tools/compile-server.mjs"]
