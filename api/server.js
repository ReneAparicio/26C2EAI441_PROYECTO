'use strict';
const http = require('node:http');
const { parsear, MOTORES, MODOS } = require('./protocol');
const PUERTO_HTTP = Number(process.env.API_PORT || 8765); // El puente PHP usa 8765.
const COM = process.env.ARDUINO_PORT;
let serial = null, ultimo = null, recibido = 0, buffer = '', secuencia = 0;
let SerialPort;
const pendientes = new Map();
const fresco = () => serial?.isOpen && ultimo && ultimo.enlace && Date.now() - recibido < 2500;
function estado() {
    if (!fresco()) return { conectado: false, distancia_cm: null, distancia_m: null, motor: null, modo: null, sensor_ok: false, actualizado: null };
    return { conectado: true, distancia_cm: ultimo.distancia_cm, distancia_m: ultimo.sensor_ok ? Number((ultimo.distancia_cm / 100).toFixed(3)) : null, motor: ultimo.motor, modo: ultimo.modo, sensor_ok: ultimo.sensor_ok, actualizado: new Date(recibido).toISOString() };
}
function desconectar() {
    ultimo = null; recibido = 0; buffer = '';
    for (const p of pendientes.values()) { clearTimeout(p.timer); p.reject(Object.assign(new Error('Arduino desconectado.'), { status: 503 })); }
    pendientes.clear();
}
function recibir(chunk) {
    buffer += chunk.toString('utf8');
    if (buffer.length > 4096) { buffer = ''; return; }
    let salto;
    while ((salto = buffer.indexOf('\n')) >= 0) {
        const linea = buffer.slice(0, salto).trim(); buffer = buffer.slice(salto + 1);
        const dato = parsear(linea);
        if (!dato) continue;
        ultimo = dato; recibido = Date.now();
        if (dato.tipo === 'ack') {
            const p = pendientes.get(dato.id);
            if (!p) continue;
            clearTimeout(p.timer); pendientes.delete(dato.id);
            if (dato.ok) p.resolve(estado());
            else p.reject(Object.assign(new Error(dato.error === 'modo_automatico' ? 'Los controles manuales están deshabilitados en automático.' : 'El Arduino rechazó el comando.'), { status: 409 }));
        }
    }
}
function conectar() {
    if (!SerialPort || !COM || serial?.isOpen || serial?.opening) return;
    const puerto = new SerialPort({ path: COM, baudRate: 115200, autoOpen: false });
    serial = puerto;
    puerto.on('data', recibir);
    puerto.on('error', error => { console.error('Serial:', error.message); desconectar(); if (puerto.isOpen) puerto.close(() => {}); });
    puerto.on('close', desconectar);
    puerto.open(error => {
        if (error) console.error(`No se pudo abrir ${COM}: ${error.message}`);
        else { desconectar(); console.log(`USB Serial abierto: ${COM}, 115200 baudios`); }
    });
}
function comando(tipo, valor) {
    if (!fresco()) return Promise.reject(Object.assign(new Error('Sin conexión con Arduino.'), { status: 503 }));
    if (pendientes.size) return Promise.reject(Object.assign(new Error('Hay otro comando pendiente. Reintentá.'), { status: 409 }));
    const id = secuencia = (secuencia % 1000000000) + 1;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendientes.delete(id);
            reject(Object.assign(new Error('Sin confirmación del Arduino. Consultá el estado antes de reintentar.'), { status: 504 }));
        }, 2000);
        pendientes.set(id, { resolve, reject, timer });
        // El contenido proviene de listas permitidas, nunca de texto sin validar.
        serial.write(`${id}:${tipo}:${valor.toUpperCase()}\n`, error => {
            if (error && pendientes.has(id)) { clearTimeout(timer); pendientes.delete(id); reject(Object.assign(new Error('No se pudo enviar al Arduino.'), { status: 503 })); }
        });
    });
}
function responder(res, status, datos) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(datos));
}
async function leerJson(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Usá application/json.'), { status: 415 });
    let cuerpo = '';
    for await (const chunk of req) {
        cuerpo += chunk;
        if (Buffer.byteLength(cuerpo) > 1024) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
    }
    try {
        const datos = JSON.parse(cuerpo);
        if (!datos || Array.isArray(datos) || typeof datos !== 'object') throw new Error();
        return datos;
    } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}
const server = http.createServer(async (req, res) => {
    try {
        const ruta = new URL(req.url, 'http://localhost').pathname;
        if (!['/api/status', '/api/modo', '/api/motor'].includes(ruta)) return responder(res, 404, { ok: false, error: 'Ruta no encontrada.' });
        const metodo = ruta === '/api/status' ? 'GET' : 'POST';
        if (req.method !== metodo) { res.setHeader('Allow', metodo); return responder(res, 405, { ok: false, error: 'Método no permitido.' }); }
        if (metodo === 'GET') return responder(res, 200, { ok: true, ...estado() });
        // El navegador pasa por PHP. Sin CORS ni cabeceras personalizadas autorizadas, un sitio externo no puede ordenar movimientos.
        if (req.headers['x-bridge-request'] !== 'UNO-R4' || req.headers.origin) return responder(res, 403, { ok: false, error: 'Acceso no permitido.' });
        const datos = await leerJson(req);
        const modo = ruta === '/api/modo';
        const valor = modo ? datos.modo : datos.accion;
        if (!(modo ? MODOS : MOTORES).includes(valor) || Object.keys(datos).length !== 1) return responder(res, 422, { ok: false, error: 'Modo o acción inválidos.' });
        if (!modo && fresco() && ultimo.modo === 'automatico') return responder(res, 409, { ok: false, error: 'Desactivá el modo automático para controlar el motor.' });
        const confirmado = await comando(modo ? 'MODO' : 'MOTOR', valor);
        responder(res, 200, { ok: true, ...confirmado });
    } catch (error) {
        if (!error.status) console.error(error);
        responder(res, error.status || 500, { ok: false, error: error.status ? error.message : 'Error del servidor.' });
    }
});
server.requestTimeout = 5000;
server.headersTimeout = 6000;
server.listen(PUERTO_HTTP, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${PUERTO_HTTP}/api/status`));
try { ({ SerialPort } = require('serialport')); }
catch { console.error('Falta serialport. Ejecutá npm.cmd install en api. Se mostrará sin conexión; no se generan datos.'); }
if (!COM) console.error('Configurá ARDUINO_PORT (por ejemplo COM3) antes de iniciar.');
conectar();
setInterval(conectar, 3000);
setInterval(() => {
    if (serial?.isOpen) serial.write('PING\n', error => { if (error) desconectar(); });
}, 500);
process.on('SIGINT', () => { if (serial?.isOpen) serial.close(() => process.exit(0)); else process.exit(0); });
