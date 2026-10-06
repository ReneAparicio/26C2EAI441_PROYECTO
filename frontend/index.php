<?php
ini_set('display_errors', '0');
if (!session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'use_strict_mode' => true])) {
    http_response_code(503); exit('No se pudo iniciar la sesión del panel.');
}
if (!isset($_SESSION['token'])) $_SESSION['token'] = bin2hex(random_bytes(32));
$token = $_SESSION['token'];
session_write_close();
$integrantes = [
    ['Marcelo Guerrero', 'GR241968'], ['Rene Aparicio', 'AR240329'],
    ['Diego Cruz', 'CC251293'], ['Maluma Londoño', 'LA241328'],
];
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="csrf-token" content="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>">
    <title>Control IoT | Arduino UNO R4</title>
    <link rel="stylesheet" href="css/styles.css"><script src="js/script.js" defer></script>
</head>
<body>
<header class="contenedor cabecera"><h1>Control IoT · Arduino UNO R4</h1><span id="conexion" role="status">Sin conexión</span></header>
<main class="contenedor">
    <div class="panel">
        <section class="tarjeta" aria-labelledby="controles"><h2 id="controles">CONTROLES</h2>
            <div class="modo"><label for="automatico">Modo automático</label><input type="checkbox" id="automatico" role="switch" disabled></div>
            <div class="botones"><button data-accion="adelante" disabled>ADELANTE</button><button data-accion="atras" disabled>ATRÁS</button><button data-accion="izquierda" disabled>IZQUIERDA</button><button data-accion="derecha" disabled>DERECHA</button><button data-accion="detener" class="detener" disabled>DETENER</button></div>
            <dl class="estado"><div><dt>MODO</dt><dd id="modo">Sin conexión</dd></div><div><dt>ESTADO DEL MOTOR</dt><dd id="motor">Sin conexión</dd></div></dl>
        </section>
        <section class="tarjeta" aria-labelledby="titulo-distancia"><h2 id="titulo-distancia">DISTANCIA</h2>
            <div class="display"><div><output id="distancia-cm" aria-label="Distancia en centímetros">—</output><span>cm</span></div><div class="metros"><output id="distancia-m" aria-label="Distancia en metros">—</output><span>m</span></div></div>
            <p id="sensor" role="status">Sin lectura del sensor</p>
        </section>
    </div>
    <p id="mensaje" role="status" hidden></p>
    <div class="barra"><span></span><img src="https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg" alt="Escudo oficial del F.C. Barcelona" width="90" height="90"><span></span></div>
    <section aria-labelledby="titulo-equipo"><h2 id="titulo-equipo" class="titulo-equipo">Nuestro equipo</h2><div class="integrantes">
    <?php foreach ($integrantes as $i => [$nombre, $carnet]): ?>
        <article class="miembro"><img src="img/integrante<?= $i + 1 ?>.jpeg" alt="Fotografía de <?= htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8') ?>" width="480" height="360"><div><h3><?= htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8') ?></h3><p>Carnet: <?= htmlspecialchars($carnet, ENT_QUOTES, 'UTF-8') ?></p></div></article>
    <?php endforeach; ?>
    </div></section>
    <noscript><p>Activá JavaScript para consultar el Arduino y utilizar los controles.</p></noscript>
</main>
</body>
</html>
