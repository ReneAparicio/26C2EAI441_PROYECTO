# Control IoT — Arduino UNO R4

Proyecto con lecturas reales del HC-SR04 y control de un carro de dos motores DC por shield L293D. No genera lecturas ni estados ficticios. Si falta el Arduino, la API devuelve distancia, motor y modo como `null`, y el panel muestra sin conexión.

## Arquitectura

```text
Navegador (frontend PHP + HTML/CSS/JavaScript)
    ↕ HTTP JSON del mismo origen
API REST: api/index.php → servidor Node.js en 127.0.0.1:8765
    ↕ USB Serial, 115200 baudios
Arduino UNO R4 (sketch y lógica de modos)
    ├── HC-SR04: TRIG A0, ECHO A1
    └── Shield L293D V1: M1 → motor izquierdo; M2 → motor derecho
```

PHP reenvía peticiones a Node.js; Node mantiene abierto un único puerto COM. El navegador no accede al Arduino ni al puerto USB. El modo y el motor tienen como fuente de verdad el Arduino. Las respuestas de los comandos se entregan solamente después de recibir su confirmación Serial.

## Carpetas

```text
index.php                       Redirige al panel
frontend/
  index.php                     Panel y datos del equipo
  css/styles.css
  js/script.js
  img/integrante1.jpeg ... integrante4.jpeg
api/
  index.php                     Entrada REST para XAMPP
  .htaccess                     Rutas REST y protección de archivos
  server.js                     Servidor y enlace USB persistente
  protocol.js                   Validación de telemetría Serial
  ports.js                      Lista puertos COM
  package.json                  Dependencia serialport y comandos npm
  tests/system.test.js          Pruebas de protocolo, rangos y API sin hardware
arduino/
  control_robot/control_robot.ino
README.md
```

## Requisitos y librerías

- Arduino UNO R4 y cable USB de datos.
- HC-SR04, shield L293D tipo Adafruit Motor Shield V1 con registro 74HC595 y bornes M1–M4, dos motores DC y alimentación adecuada para ambos.
- Arduino IDE 2 con paquete **Arduino UNO R4 Boards**. Seleccionar **Arduino UNO R4 Minima**. El sketch usa únicamente `Arduino.h` y funciones estándar; no necesita instalar AFMotor ni otra librería del motor.
- Node.js 20 o superior, npm y la librería `serialport` indicada en `api/package.json`.
- PHP 7.4 o superior con cURL, JSON y sesiones habilitadas. XAMPP incluye esas extensiones habitualmente.
- Navegador moderno con JavaScript. Internet para descargar la dependencia y cargar el escudo; el control y las fotos funcionan por la red local.

El código utiliza únicamente el procesador del UNO R4 y la conexión USB. El pinout del shield es una condición del cableado: un módulo L293D suelto o un shield con otro esquema no se conecta con esta distribución. Verificá que tu shield tenga los bornes M1–M4 y un 74HC595 antes de energizarlo.

## Cableado

Realizá las conexiones con la alimentación desconectada. Colocá el shield sobre el UNO R4 alineando las cabeceras.

| Elemento | Conexión |
|---|---|
| HC-SR04 VCC | 5V del Arduino |
| HC-SR04 GND | GND común del Arduino/shield |
| HC-SR04 TRIG | A0 (utilizado como salida digital) |
| HC-SR04 ECHO | A1 (utilizado como entrada digital) |
| Motor izquierdo, dos cables | Bornes M1 del shield |
| Motor derecho, dos cables | Bornes M2 del shield |
| Alimentación del motor | EXT_PWR del shield, respetando polaridad y tensión del motor/shield |
| Arduino | USB de datos a la computadora que ejecuta la API |

El UNO R4 trabaja con lógica de 5V. A0 y A1 quedan libres en este shield. Internamente, el sketch utiliza D12 (latch), D4 (clock), D8 (data), D7 (enable), D11 (PWM de M1) y D3 (PWM de M2). Los bits de dirección del registro son 2/3 para M1 y 1/4 para M2; no son números de pines Arduino.

Retirá el jumper **PWR** del shield cuando uses alimentación independiente en EXT_PWR y Arduino por USB, según la guía del shield. No alimentes el motor desde un pin del Arduino ni desde su salida 5V. La fuente debe soportar la corriente de arranque/bloqueo del motor dentro de la capacidad del L293D; la referencia del shield V1 indica 0.6 A por canal y 1.2 A de pico. Compartí GND y respetá las características de tu shield y motor. La fuente de potencia no es otro microcontrolador.

`VELOCIDAD = 180` aplica el mismo PWM (escala 0–255) a M1 y M2. ADELANTE hace avanzar ambas ruedas; ATRÁS invierte ambas manteniendo ese PWM. IZQUIERDA hace retroceder la rueda izquierda y avanzar la derecha; DERECHA hace lo contrario para girar en su lugar. DETENER desenergiza ambos canales.

Antes de apoyar el carro, probá ADELANTE con las ruedas levantadas. Por el montaje enfrentado, una rueda puede necesitar polaridad inversa. Si una rueda retrocede, cambiá solamente su constante `INVERTIR_M1` o `INVERTIR_M2` a `true`, o intercambiá sus dos cables con la alimentación desconectada. No cambies ambas opciones a la vez. La fuente debe soportar la corriente conjunta de los dos motores y cada canal respetar su límite. El PWM igual es una velocidad configurada igual; sin realimentación de velocidad, diferencias mecánicas entre motores pueden desviar el carro. El estado reportado es la salida aplicada, no una medición de velocidad del eje.

## 1. Cargar Arduino

1. Instalá Arduino IDE y el paquete **Arduino UNO R4 Boards** desde el gestor de placas.
2. Abrí `arduino/control_robot/control_robot.ino`.
3. Elegí la placa UNO R4 Minima y el puerto en **Herramientas → Puerto**.
4. Verificá y cargá el sketch. Inicia en MANUAL y DETENER.
5. Cerrá el Monitor Serial y el Plotter Serial antes de iniciar la API: solamente un proceso puede ocupar el puerto COM.

Las mediciones se hacen cada 100 ms, con timeout de eco de 25 ms. La telemetría se envía cada 250 ms. Ausencia de eco o lectura fuera de 2–400 cm produce `distancia_cm: null`, nunca un valor inventado. En automático, una lectura inválida detiene el motor; en manual no modifica la orden del usuario.

## 2. Configurar puerto COM y ejecutar API

En PowerShell, abrí una terminal dentro de la carpeta `api`:

```powershell
npm.cmd install
npm.cmd run ports
$env:ARDUINO_PORT = 'COM3'
npm.cmd start
```

Reemplazá COM3 por el puerto que muestra Arduino IDE, el Administrador de dispositivos o `npm.cmd run ports`. Usamos `npm.cmd` para evitar restricciones de ejecución de `npm.ps1` en PowerShell. La API escucha exclusivamente en `127.0.0.1:8765`; dejá abierta esta terminal. El navegador y los teléfonos usan PHP, no ese puerto interno.

En CMD:

```bat
cd api
npm install
set ARDUINO_PORT=COM3
npm start
```

En Linux/macOS, usá `ARDUINO_PORT=/dev/ttyACM0 npm start` o el puerto real mostrado por `npm run ports` y otorgá permisos de acceso al dispositivo al usuario. No cambia el sketch.

La API reintenta abrir el USB cada tres segundos y no reenvía órdenes antiguas después de una desconexión. Esperá a ver **Arduino conectado** antes de operar. Un puerto equivocado, ocupado o sin permisos produce sin conexión. Si cerrás la API, el Arduino detiene el motor MANUAL después de tres segundos sin heartbeat. En AUTOMÁTICO sigue trabajando de manera autónoma con el HC-SR04 para conservar la lógica exclusivamente por distancia.

## 3. Ejecutar página web

**XAMPP:** copiá el proyecto completo a `C:\xampp\htdocs\iot-arduino`, iniciá Apache y visitá:

```text
http://localhost/iot-arduino/
```

Dejá Node.js ejecutándose en la misma computadora que Apache y el Arduino. En XAMPP, asegurate de que `extension=curl` esté habilitada en `php.ini` y reiniciá Apache si la modificás. Las sesiones de PHP necesitan una carpeta de almacenamiento con permisos de escritura.

**Servidor integrado de PHP:** desde la raíz del proyecto:

```powershell
php -S localhost:8000
```

Abrí `http://localhost:8000/`. JavaScript utiliza `api/index.php?route=status`, etc., por lo que también funciona sin reglas de Apache. Si PHP no puede escribir sus sesiones, podés especificar una carpeta temporal de pruebas fuera del directorio público:

```powershell
$carpetaSesionesIoT = Join-Path $env:TEMP 'iot-arduino-sesiones'
New-Item -ItemType Directory -Force $carpetaSesionesIoT
php -d "session.save_path=$carpetaSesionesIoT" -S localhost:8000
```

**Teléfono:** conectalo a la misma red de la computadora. Con XAMPP, abrí `http://IP-DE-LA-PC/iot-arduino/`. Permití Apache en la red privada del firewall. El Arduino sigue conectado por USB a la PC. Para PHP integrado en la red local usá `php -S 0.0.0.0:8000` y abrí `http://IP-DE-LA-PC:8000/`. Este servidor integrado es solamente para pruebas.

Las cuatro fotos originales están en `frontend/img/`; nombres y carnets se editan en `frontend/index.php`. Se muestran centradas y completas. El escudo oficial del F.C. Barcelona se carga desde Wikimedia; para trabajar sin Internet guardá ese SVG como `frontend/img/escudo-fcb.svg` y cambiá el `src` correspondiente. No se agregan logos de tecnologías.

## API REST

En Apache con `mod_rewrite` y `AllowOverride` habilitados:

```text
GET  /iot-arduino/api/status
POST /iot-arduino/api/modo     {"modo":"automatico"} o {"modo":"manual"}
POST /iot-arduino/api/motor    {"accion":"adelante"}, {"accion":"atras"}, {"accion":"izquierda"}, {"accion":"derecha"} o {"accion":"detener"}
```

También funcionan las rutas sin rewrite, usadas por el frontend:

```text
GET  /iot-arduino/api/index.php?route=status
POST /iot-arduino/api/index.php?route=modo
POST /iot-arduino/api/index.php?route=motor
```

Los POST llevan `Content-Type: application/json`, cookie de sesión del panel y `X-CSRF-Token` tomado del meta `csrf-token` de esa página. El frontend lo hace automáticamente. Se valida el tamaño, la estructura y las listas de valores en PHP, Node y Arduino. No se ejecuta texto recibido como instrucciones del sistema. Para probar Node directamente desde la PC, las rutas son `http://127.0.0.1:8765/api/...` y los POST requieren `X-Bridge-Request: UNO-R4`; este servidor interno no habilita CORS.

Ejemplo de formato cuando el Arduino realmente reporta 123 cm (no es una lectura predeterminada):

```json
{"ok":true,"conectado":true,"distancia_cm":123,"distancia_m":1.23,"motor":"derecha","modo":"automatico","sensor_ok":true,"actualizado":"fecha ISO de recepción"}
```

Sin telemetría reciente o USB:

```json
{"ok":true,"conectado":false,"distancia_cm":null,"distancia_m":null,"motor":null,"modo":null,"sensor_ok":false,"actualizado":null}
```

Errores: 400 JSON inválido, 403 sesión/acceso inválido, 405 método incorrecto, 409 automático/comando pendiente, 413 cuerpo grande, 422 valor inválido, 503 sin conexión y 504 sin confirmación. Un timeout puede ocurrir después de ejecutar una orden: el panel vuelve a consultar el estado real en lugar de asumir éxito o repetir la orden. Los detalles internos se registran solamente en la consola del servidor.

## Protocolo USB Serial

115200 baudios, 8 bits, sin paridad, 1 bit de parada. Una línea por mensaje terminada en `\n`. Comandos del servidor:

```text
PING
1:MODO:AUTOMATICO
2:MODO:MANUAL
3:MOTOR:IZQUIERDA
4:MOTOR:DERECHA
5:MOTOR:DETENER
6:MOTOR:ADELANTE
7:MOTOR:ATRAS
```

PING se envía cada 500 ms. El identificador es un entero positivo, utilizado para asociar cada respuesta con su petición. Arduino valida los comandos y devuelve una línea JSON `tipo: ack`, `id`, `ok`, distancia, motor y modo. Independientemente de los comandos, envía líneas `tipo: estado` cada 250 ms. `sensor_ok` indica si el eco es válido y `enlace` si hay heartbeat reciente. Una trama larga o inválida no ejecuta ninguna acción.

## Probar MANUAL

1. Conectá el hardware, iniciá API y PHP, y esperá conexión.
2. Dejá desactivado **Modo automático**; al cambiar a manual, el motor se detiene.
3. Presioná ADELANTE: ambas ruedas deben avanzar con PWM 180. Presioná ATRÁS: ambas deben invertir el sentido con el mismo PWM. Luego probá IZQUIERDA y DERECHA para verificar los giros en su lugar.
4. Mové un objeto delante del sensor: la distancia debe cambiar sin alterar el movimiento manual.
5. Presioná DERECHA y verificá el cambio de sentido.
6. Presioná DETENER y comprobá que las salidas de ambos motores quedan desenergizadas.
7. Cerrá la API o desconectá USB: la interfaz queda sin conexión. El watchdog del Arduino detiene el motor manual si la placa continúa alimentada.

## Probar AUTOMÁTICO

Activá **Modo automático**. Los cinco botones manuales se deshabilitan; el Arduino mide y decide localmente, sin esperar a la página. Usá una superficie plana delante del sensor y una cinta métrica:

| Distancia medida | Motor |
|---|---|
| 49 cm | Detener |
| 50 cm | Izquierda |
| 75 cm | Izquierda |
| 90 cm | Izquierda |
| 95 cm | Detener |
| 100 cm | Derecha |
| 125 cm | Derecha |
| 150 cm | Derecha |
| 151 cm | Detener |

La decisión usa la distancia sin redondearla: 50–90 cm inclusive = izquierda; 100–150 cm inclusive = derecha; todo lo demás = detener. El intervalo abierto entre 90 y 100 cm queda detenido, incluidos 91–99 cm. La precisión física del HC-SR04 y el blanco pueden hacer variar las lecturas cerca del límite; para una comprobación estable probá primero 75, 95 y 125 cm.

Quitá el objeto o interrumpí el eco: se muestra sin eco válido y se detiene en automático. Volvé a manual: se detiene al cambiar y habilita los botones. Las lecturas continúan en ambos modos.

## Verificación de software y límites

En `api`, ejecutá `npm.cmd test`. Las pruebas verifican tramas inválidas, todos los límites del bloque automático del sketch y las respuestas reales de la API sin un Arduino conectado. No emulan la comunicación USB ni sustituyen mediciones del hardware. Para verificación de compilación del firmware usá **Verificar** en Arduino IDE con UNO R4 seleccionado.

El panel está destinado al laboratorio/red local; no incluye cuentas de usuario. Todos los navegadores consultan el mismo Arduino y deben coordinar su uso. Se permite una sola orden pendiente para evitar confirmaciones mezcladas. No publiques el control físico en Internet sin autenticación.

## Referencias técnicas

- [Arduino UNO R4 Minima: hardware y documentación](https://docs.arduino.cc/hardware/uno-r4-minima/).
- [PWM del UNO R4](https://support.arduino.cc/hc/en-us/articles/9350537961500-Use-PWM-output-with-Arduino).
- [Shield Adafruit V1: pines, motor y alimentación](https://learn.adafruit.com/adafruit-motor-shield?view=all).
- [Distribución de bits y pines del shield V1](https://github.com/adafruit/Adafruit-Motor-Shield-library/blob/master/AFMotor.h).
- [SerialPort: conexión y manejo de errores](https://serialport.io/docs/guide-usage/).
- [Escudo del F.C. Barcelona, información del club](https://www.fcbarcelona.com/en/club/identitat/escut).
