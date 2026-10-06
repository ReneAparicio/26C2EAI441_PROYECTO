'use strict';
const MOTORES = ['izquierda', 'derecha', 'adelante', 'atras', 'detener'];
const MODOS = ['automatico', 'manual'];
// Se aceptan únicamente mensajes completos provenientes del sketch.
function parsear(linea) {
    if (linea.length > 512) return null;
    let dato;
    try { dato = JSON.parse(linea); } catch { return null; }
    if (!dato || !['estado', 'ack'].includes(dato.tipo)) return null;
    if (!MOTORES.includes(dato.motor) || !MODOS.includes(dato.modo)) return null;
    if (typeof dato.sensor_ok !== 'boolean' || typeof dato.enlace !== 'boolean') return null;
    if (dato.sensor_ok) {
        if (typeof dato.distancia_cm !== 'number' || !Number.isFinite(dato.distancia_cm) || dato.distancia_cm < 2 || dato.distancia_cm > 400) return null;
    } else if (dato.distancia_cm !== null) return null;
    if (dato.tipo === 'ack' && (!Number.isSafeInteger(dato.id) || dato.id < 1 || typeof dato.ok !== 'boolean')) return null;
    return dato;
}
module.exports = { parsear, MOTORES, MODOS };
