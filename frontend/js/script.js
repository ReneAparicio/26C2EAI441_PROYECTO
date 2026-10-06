'use strict';
const botones = [...document.querySelectorAll('[data-accion]')];
const automatico = document.querySelector('#automatico');
const mensaje = document.querySelector('#mensaje');
let ultimo = null, ocupado = false, consultando = false;
let version = 0;
const nombresMotor = { izquierda: 'Girando a la izquierda', derecha: 'Girando a la derecha', adelante: 'Avanzando', atras: 'Retrocediendo', detener: 'Detenido' };
const numero = valor => valor.toLocaleString('es-MX', { maximumFractionDigits: 2 });
function habilitar() {
    automatico.disabled = ocupado || !ultimo?.conectado;
    botones.forEach(b => { b.disabled = ocupado || !ultimo?.conectado || ultimo.modo !== 'manual'; });
}
function pintar(dato) {
    ultimo = dato;
    const conectado = dato.conectado === true;
    const conexion = document.querySelector('#conexion');
    conexion.textContent = conectado ? 'Arduino conectado' : 'Sin conexión con Arduino';
    conexion.classList.toggle('conectado', conectado);
    document.querySelector('#modo').textContent = conectado ? (dato.modo === 'automatico' ? 'Automático' : 'Manual') : 'Sin conexión';
    document.querySelector('#motor').textContent = conectado ? nombresMotor[dato.motor] : 'Sin conexión';
    automatico.checked = conectado && dato.modo === 'automatico';
    const lectura = conectado && dato.sensor_ok && typeof dato.distancia_cm === 'number';
    document.querySelector('#distancia-cm').textContent = lectura ? numero(dato.distancia_cm) : '—';
    document.querySelector('#distancia-m').textContent = lectura ? numero(dato.distancia_m) : '—';
    document.querySelector('#sensor').textContent = !conectado ? 'Sin lectura del sensor' : (lectura ? 'Lectura del HC-SR04' : 'Sin eco válido del HC-SR04');
    habilitar();
}
async function pedir(ruta, datos) {
    const opciones = { cache: 'no-store', signal: AbortSignal.timeout(6000) };
    if (datos) {
        opciones.method = 'POST';
        opciones.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content };
        opciones.body = JSON.stringify(datos);
    }
    const respuesta = await fetch(`../api/index.php?route=${ruta}`, opciones);
    const resultado = await respuesta.json();
    if (!respuesta.ok || resultado.ok !== true) throw new Error(resultado.error || 'Error de comunicación.');
    return resultado;
}
async function consultar() {
    if (consultando || ocupado) return;
    consultando = true;
    const actual = version;
    try {
        const datos = await pedir('status');
        if (actual === version) pintar(datos);
    } catch {
        if (actual === version) pintar({ conectado: false });
    } finally { consultando = false; }
}
async function enviar(ruta, datos) {
    if (ocupado || !ultimo?.conectado) return;
    ocupado = true; version++;
    habilitar();
    mensaje.hidden = false; mensaje.classList.remove('error'); mensaje.textContent = 'Esperando confirmación del Arduino…';
    try {
        pintar(await pedir(ruta, datos));
        mensaje.hidden = true;
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.classList.add('error');
        // Un timeout no garantiza que el comando no se ejecutó: consultamos el estado real.
        pintar({ conectado: false });
    } finally {
        ocupado = false; habilitar(); consultar();
    }
}
automatico.addEventListener('change', () => {
    const modo = automatico.checked ? 'automatico' : 'manual';
    automatico.checked = ultimo?.modo === 'automatico';
    enviar('modo', { modo });
});
botones.forEach(b => b.addEventListener('click', () => enviar('motor', { accion: b.dataset.accion })));
async function ciclo() { await consultar(); setTimeout(ciclo, 500); }
ciclo();
