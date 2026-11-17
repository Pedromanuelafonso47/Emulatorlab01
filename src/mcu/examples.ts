/** Ready-to-run sketches for the Arduino Uno / Nano, offered from the Programa tab. */
export interface SketchExample { id: string; title: string; hint: string; code: string }

export const SKETCH_EXAMPLES: SketchExample[] = [
  {
    id: 'blink', title: 'Piscar LED', hint: 'LED no pino D13 a piscar cada meio segundo.',
    code: `// Piscar um LED no pino 13 (o LED "L" da placa ou um LED externo)
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`,
  },
  {
    id: 'button', title: 'Botão com resistência interna', hint: 'Botão entre D2 e GND: LED no D13 acende enquanto o botão é premido.',
    code: `// Botão ligado entre D2 e GND. INPUT_PULLUP usa a resistência interna (≈45 kΩ).
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  int premido = digitalRead(2) == LOW;   // LOW = botão premido
  digitalWrite(13, premido ? HIGH : LOW);
  delay(10);
}
`,
  },
  {
    id: 'fade', title: 'Fade com PWM', hint: 'LED no D9 com intensidade a subir e descer (PWM).',
    code: `// PWM no pino 9: o LED aparece com intensidade variável.
int brilho = 0;
int passo = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brilho);
  brilho += passo;
  if (brilho <= 0 || brilho >= 255) passo = -passo;
  delay(20);
}
`,
  },
  {
    id: 'pot', title: 'Potenciómetro → LED (PWM)', hint: 'Liga o cursor do potenciómetro ao A0 e o LED ao D9.',
    code: `// Lê o potenciómetro em A0 (0–1023) e ajusta o brilho do LED no D9 (0–255).
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int leitura = analogRead(A0);
  int brilho = map(leitura, 0, 1023, 0, 255);
  analogWrite(9, brilho);
  Serial.print("A0 = ");
  Serial.print(leitura);
  Serial.print("  brilho = ");
  Serial.println(brilho);
  delay(200);
}
`,
  },
  {
    id: 'counter', title: 'Contador na consola série', hint: 'Escreve um número por segundo no monitor série.',
    code: `// Monitor série: uma linha por segundo com o tempo desde o arranque.
int contador = 0;

void setup() {
  Serial.begin(9600);
  Serial.println("Arduino pronto");
}

void loop() {
  contador++;
  Serial.print("Contador: ");
  Serial.print(contador);
  Serial.print("  (");
  Serial.print(millis() / 1000);
  Serial.println(" s)");
  delay(1000);
}
`,
  },
];
