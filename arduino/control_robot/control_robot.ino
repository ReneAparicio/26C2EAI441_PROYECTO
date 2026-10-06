// Arduino UNO R4 + HC-SR04 + shield L293D V1, M1 izquierdo y M2 derecho.
// Únicamente funciones estándar de Arduino: no se usa AFMotor.
#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

const uint8_t TRIG = A0, ECHO = A1;
const uint8_t LATCH = 12, CLOCK_PIN = 4, ENABLE = 7, DATA_PIN = 8;
const uint8_t PWM_M1 = 11, PWM_M2 = 3;
const uint8_t M1_A = 2, M1_B = 3, M2_A = 1, M2_B = 4; // Bits del registro, no pines.
// Si una rueda retrocede al pedir ADELANTE, invertir su polaridad aquí o sus cables.
const bool INVERTIR_M1 = false, INVERTIR_M2 = false;
const uint8_t VELOCIDAD = 180;
const unsigned long TIMEOUT_ENLACE = 3000;
enum Movimiento { DETENER, IZQUIERDA, DERECHA, ADELANTE, ATRAS };
Movimiento motor = DETENER;
bool automatico = false, sensorOk = false, enlace = false;
float distancia = 0;
unsigned long ultimoPing = 0, ultimaMedicion = 0, ultimoReporte = 0;
char entrada[80];
uint8_t longitud = 0;
bool descartando = false;

void registro(uint8_t bits) {
  digitalWrite(LATCH, LOW);
  shiftOut(DATA_PIN, CLOCK_PIN, MSBFIRST, bits);
  digitalWrite(LATCH, HIGH);
}

uint8_t direccionMotor(int8_t sentido, uint8_t bitA, uint8_t bitB, bool invertir) {
  if (invertir) sentido = -sentido;
  return sentido > 0 ? (1 << bitA) : (sentido < 0 ? (1 << bitB) : 0);
}

void mover(Movimiento nuevo) {
  if (nuevo == motor) return;
  // Desenergizar brevemente antes de invertir el sentido.
  analogWrite(PWM_M1, 0);
  analogWrite(PWM_M2, 0);
  registro(0);
  if (motor != DETENER && nuevo != DETENER) delay(50);
  int8_t izquierdo = 0, derecho = 0;
  if (nuevo == ADELANTE) { izquierdo = 1; derecho = 1; }
  else if (nuevo == ATRAS) { izquierdo = -1; derecho = -1; }
  else if (nuevo == IZQUIERDA) { izquierdo = -1; derecho = 1; }
  else if (nuevo == DERECHA) { izquierdo = 1; derecho = -1; }
  uint8_t bits = direccionMotor(izquierdo, M1_A, M1_B, INVERTIR_M1)
               | direccionMotor(derecho, M2_A, M2_B, INVERTIR_M2);
  registro(bits);
  analogWrite(PWM_M1, nuevo == DETENER ? 0 : VELOCIDAD);
  analogWrite(PWM_M2, nuevo == DETENER ? 0 : VELOCIDAD); // Mismo PWM en ambas ruedas.
  motor = nuevo;
}

void medir() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duracion = pulseIn(ECHO, HIGH, 25000UL);
  distancia = duracion * 0.0343f / 2.0f;
  sensorOk = duracion != 0 && distancia >= 2 && distancia <= 400;
}

void aplicarAutomatico() {
  if (!sensorOk) mover(DETENER);
  else if (distancia >= 50 && distancia <= 90) mover(IZQUIERDA);
  else if (distancia >= 100 && distancia <= 150) mover(DERECHA);
  else mover(DETENER);
}

const char* nombreMotor() {
  switch (motor) {
    case IZQUIERDA: return "izquierda";
    case DERECHA: return "derecha";
    case ADELANTE: return "adelante";
    case ATRAS: return "atras";
    default: return "detener";
  }
}

void reportar(unsigned long id = 0, bool ok = true, const char* error = "") {
  Serial.print("{\"tipo\":\""); Serial.print(id ? "ack" : "estado"); Serial.print("\"");
  if (id) {
    Serial.print(",\"id\":"); Serial.print(id);
    Serial.print(",\"ok\":"); Serial.print(ok ? "true" : "false");
    if (!ok) { Serial.print(",\"error\":\""); Serial.print(error); Serial.print("\""); }
  }
  Serial.print(",\"distancia_cm\":");
  if (sensorOk) Serial.print(distancia, 2); else Serial.print("null");
  Serial.print(",\"sensor_ok\":"); Serial.print(sensorOk ? "true" : "false");
  Serial.print(",\"motor\":\""); Serial.print(nombreMotor());
  Serial.print("\",\"modo\":\""); Serial.print(automatico ? "automatico" : "manual");
  Serial.print("\",\"enlace\":"); Serial.print(enlace ? "true" : "false");
  Serial.println("}");
}

void procesar(char* linea) {
  if (strcmp(linea, "PING") == 0) {
    ultimoPing = millis(); enlace = true; return;
  }
  // Protocolo: identificador:MODO:AUTOMATICO o identificador:MOTOR:DERECHA.
  char* fin;
  if (linea[0] < '1' || linea[0] > '9') return;
  unsigned long id = strtoul(linea, &fin, 10);
  if (!id || id > 1000000000UL || *fin != ':') return;
  char* comando = fin + 1;
  if (!enlace) { reportar(id, false, "sin_enlace"); return; }
  if (strcmp(comando, "MODO:AUTOMATICO") == 0) {
    automatico = true;
    medir(); aplicarAutomatico();
  } else if (strcmp(comando, "MODO:MANUAL") == 0) {
    automatico = false; mover(DETENER);
  } else if (strcmp(comando, "MOTOR:IZQUIERDA") == 0 || strcmp(comando, "MOTOR:DERECHA") == 0 || strcmp(comando, "MOTOR:ADELANTE") == 0 || strcmp(comando, "MOTOR:ATRAS") == 0 || strcmp(comando, "MOTOR:DETENER") == 0) {
    if (automatico) { reportar(id, false, "modo_automatico"); return; }
    Movimiento movimiento = DETENER;
    if (strcmp(comando, "MOTOR:IZQUIERDA") == 0) movimiento = IZQUIERDA;
    else if (strcmp(comando, "MOTOR:DERECHA") == 0) movimiento = DERECHA;
    else if (strcmp(comando, "MOTOR:ADELANTE") == 0) movimiento = ADELANTE;
    else if (strcmp(comando, "MOTOR:ATRAS") == 0) movimiento = ATRAS;
    mover(movimiento);
  } else { reportar(id, false, "comando_invalido"); return; }
  reportar(id);
}

void leerSerial() {
  // Límite por vuelta para que una entrada continua no impida medir el sensor.
  for (uint8_t n = 0; n < 128 && Serial.available(); n++) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!descartando && longitud) { entrada[longitud] = '\0'; procesar(entrada); }
      longitud = 0; descartando = false;
    } else if (!descartando) {
      if (longitud < sizeof(entrada) - 1) entrada[longitud++] = c;
      else { longitud = 0; descartando = true; }
    }
  }
}

void setup() {
  pinMode(ENABLE, OUTPUT); digitalWrite(ENABLE, HIGH);
  pinMode(LATCH, OUTPUT); pinMode(CLOCK_PIN, OUTPUT); pinMode(DATA_PIN, OUTPUT);
  pinMode(PWM_M1, OUTPUT); analogWriteResolution(8); analogWrite(PWM_M1, 0);
  pinMode(PWM_M2, OUTPUT); analogWrite(PWM_M2, 0);
  // Los demás canales del shield quedan desenergizados.
  pinMode(5, OUTPUT); pinMode(6, OUTPUT);
  analogWrite(5, 0); analogWrite(6, 0);
  registro(0); digitalWrite(ENABLE, LOW);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); digitalWrite(TRIG, LOW);
  Serial.begin(115200); // No bloquear esperando que se abra el puerto USB.
}

void loop() {
  leerSerial();
  unsigned long ahora = millis();
  if (enlace && ahora - ultimoPing > TIMEOUT_ENLACE) {
    enlace = false;
    // En manual, pérdida de API = detener. Automático permanece autónomo por sensor.
    if (!automatico) mover(DETENER);
  }
  if (ahora - ultimaMedicion >= 100) {
    ultimaMedicion = ahora;
    medir();
    if (automatico) aplicarAutomatico(); // En manual el sensor nunca cambia el motor.
  }
  if (ahora - ultimoReporte >= 250) {
    ultimoReporte = ahora;
    reportar();
  }
}
