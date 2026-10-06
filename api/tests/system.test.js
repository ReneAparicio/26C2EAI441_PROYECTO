'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { parsear } = require('../protocol');

test('El protocolo rechaza mensajes incompletos, valores inválidos y comandos arbitrarios', () => {
    const mensaje = { tipo: 'estado', distancia_cm: 123, sensor_ok: true, motor: 'derecha', modo: 'manual', enlace: true };
    assert.equal(parsear(JSON.stringify(mensaje)).distancia_cm, 123);
    for (const motor of ['adelante', 'atras']) assert.equal(parsear(JSON.stringify({ ...mensaje, motor })).motor, motor);
    assert.equal(parsear(JSON.stringify({ ...mensaje, distancia_cm: null, sensor_ok: false })).distancia_cm, null);
    for (const cambio of [{ motor: 'ejecutar' }, { modo: 'otro' }, { distancia_cm: -1 }, { distancia_cm: '123' }, { sensor_ok: false }, { enlace: null }, { tipo: 'ack', id: -1, ok: true }]) {
        assert.equal(parsear(JSON.stringify({ ...mensaje, ...cambio })), null);
    }
    assert.equal(parsear('DISTANCIA:123'), null);
    assert.equal(parsear('{'), null);
});

test('La lógica automática del propio sketch respeta todos los límites y la ausencia de eco', () => {
    const sketch = fs.readFileSync(path.join(__dirname, '../../arduino/control_robot/control_robot.ino'), 'utf8');
    const cuerpo = sketch.match(/void aplicarAutomatico\(\) \{([\s\S]*?)\n\}/)[1];
    // Este bloque del sketch usa una sintaxis compartida con JavaScript: se prueba el bloque real.
    const aplicar = new Function('distancia', 'sensorOk', 'mover', 'DETENER', 'IZQUIERDA', 'DERECHA', cuerpo);
    for (const [cm, esperado] of [[49, 'detener'], [50, 'izquierda'], [75, 'izquierda'], [90, 'izquierda'], [90.01, 'detener'], [91, 'detener'], [95, 'detener'], [99, 'detener'], [99.99, 'detener'], [100, 'derecha'], [125, 'derecha'], [150, 'derecha'], [151, 'detener']]) {
        let accion;
        aplicar(cm, true, valor => { accion = valor; }, 'detener', 'izquierda', 'derecha');
        assert.equal(accion, esperado, `${cm} cm`);
    }
    let accion;
    aplicar(75, false, valor => { accion = valor; }, 'detener', 'izquierda', 'derecha');
    assert.equal(accion, 'detener');
});

test('El sketch controla ambas ruedas con PWM igual e invierte ambas al retroceder', () => {
    const sketch = fs.readFileSync(path.join(__dirname, '../../arduino/control_robot/control_robot.ino'), 'utf8');
    const direccion = sketch.match(/uint8_t direccionMotor\([^)]*\) \{([\s\S]*?)\n\}/)[1];
    const direccionMotor = new Function('sentido', 'bitA', 'bitB', 'invertir', direccion);
    const cuerpo = sketch.match(/void mover\(Movimiento nuevo\) \{([\s\S]*?)\n\}/)[1].replace(/\b(?:int8_t|uint8_t)\b/g, 'let');
    const ejecutar = new Function('motor', 'nuevo', 'analogWrite', 'registro', 'delay', 'direccionMotor', `
        const DETENER = 0, IZQUIERDA = 1, DERECHA = 2, ADELANTE = 3, ATRAS = 4;
        const PWM_M1 = 11, PWM_M2 = 3, VELOCIDAD = 180;
        const M1_A = 2, M1_B = 3, M2_A = 1, M2_B = 4;
        const INVERTIR_M1 = false, INVERTIR_M2 = false;
        ${cuerpo}
        return motor;
    `);
    for (const [nuevo, bits, potencia] of [[3, 6, 180], [4, 24, 180], [1, 10, 180], [2, 20, 180], [0, 0, 0]]) {
        const pwm = new Map(), registros = [], pausas = [];
        assert.equal(ejecutar(nuevo === 3 ? 4 : 3, nuevo, (pin, valor) => pwm.set(pin, valor), valor => registros.push(valor), ms => pausas.push(ms), direccionMotor), nuevo);
        assert.equal(pwm.get(11), potencia);
        assert.equal(pwm.get(3), potencia);
        assert.equal(registros.at(-1), bits);
        if (nuevo !== 0) assert.deepEqual(pausas, [50]);
    }
    assert.equal(direccionMotor(1, 1, 4, true), 16);
});

test('La API real sin Arduino no inventa datos y valida solicitudes', async () => {
    const proceso = spawn(process.execPath, [path.join(__dirname, '../server.js')], { env: { ...process.env, API_PORT: '18765', ARDUINO_PORT: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        await Promise.race([once(proceso.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('API no inició')), 5000))]);
        const base = 'http://127.0.0.1:18765/api/';
        const estado = await (await fetch(base + 'status')).json();
        assert.equal(estado.conectado, false);
        for (const clave of ['distancia_cm', 'distancia_m', 'modo', 'motor']) assert.equal(estado[clave], null);
        const post = (ruta, body, cabeceras = {}) => fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Request': 'UNO-R4', ...cabeceras }, body });
        assert.equal((await post('motor', '{"accion":"izquierda"}')).status, 503);
        assert.equal((await post('motor', '{"accion":"adelante"}')).status, 503);
        assert.equal((await post('motor', '{"accion":"atras"}')).status, 503);
        assert.equal((await post('motor', '{"accion":"arbitrario"}')).status, 422);
        assert.equal((await post('modo', '{"modo":"otro"}')).status, 422);
        assert.equal((await post('motor', '{')).status, 400);
        assert.equal((await post('motor', '{"accion":"derecha"}', { Origin: 'https://externo.example' })).status, 403);
        assert.equal((await fetch(base + 'motor')).status, 405);
        assert.equal((await fetch(base + 'desconocido')).status, 404);
    } finally { proceso.kill(); }
});
