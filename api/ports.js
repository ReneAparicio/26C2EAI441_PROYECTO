'use strict';
const { SerialPort } = require('serialport');
SerialPort.list().then(puertos => console.table(puertos.map(p => ({ puerto: p.path, fabricante: p.manufacturer || '', serial: p.serialNumber || '' })))).catch(error => { console.error(error.message); process.exitCode = 1; });
