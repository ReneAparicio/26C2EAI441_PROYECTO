<?php
// Entrada REST del mismo origen: PHP reenvía a la API local que posee el puerto USB.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function responderError(int $codigo, string $mensaje): void {
    http_response_code($codigo);
    echo json_encode(['ok' => false, 'error' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}
set_exception_handler(function (Throwable $error): void {
    error_log((string) $error);
    responderError(500, 'Error del servidor.');
});
$ruta = $_GET['route'] ?? '';
if (!is_string($ruta) || !in_array($ruta, ['status', 'modo', 'motor'], true)) responderError(404, 'Ruta no encontrada.');
$metodo = $ruta === 'status' ? 'GET' : 'POST';
if ($_SERVER['REQUEST_METHOD'] !== $metodo) { header('Allow: ' . $metodo); responderError(405, 'Método no permitido.'); }
$cuerpo = '';
if ($metodo === 'POST') {
    if (!session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'use_strict_mode' => true])) responderError(503, 'No se pudo iniciar la sesión.');
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $valido = isset($_SESSION['token']) && hash_equals($_SESSION['token'], $token);
    session_write_close();
    if (!$valido) responderError(403, 'Sesión inválida. Recargá la página.');
    $cuerpo = file_get_contents('php://input', false, null, 0, 1025);
    if (strlen($cuerpo) > 1024) responderError(413, 'Solicitud demasiado grande.');
    try { $datos = json_decode($cuerpo, true, 8, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { responderError(400, 'JSON inválido.'); }
    $clave = $ruta === 'modo' ? 'modo' : 'accion';
    $permitidos = $ruta === 'modo' ? ['automatico', 'manual'] : ['izquierda', 'derecha', 'adelante', 'atras', 'detener'];
    if (!is_array($datos) || count($datos) !== 1 || !isset($datos[$clave]) || !in_array($datos[$clave], $permitidos, true)) responderError(422, 'Modo o acción inválidos.');
}
if (!function_exists('curl_init')) responderError(503, 'Habilitá la extensión cURL de PHP para conectar la API.');
$curl = curl_init('http://127.0.0.1:8765/api/' . $ruta);
curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 1, CURLOPT_TIMEOUT => 4, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Bridge-Request: UNO-R4']]);
if ($metodo === 'POST') { curl_setopt($curl, CURLOPT_POST, true); curl_setopt($curl, CURLOPT_POSTFIELDS, $cuerpo); }
$respuesta = curl_exec($curl);
$codigo = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);
if ($respuesta === false || !$codigo) responderError(503, 'API USB no disponible. Iniciá el servidor de api.');
if (!is_array(json_decode($respuesta, true))) responderError(502, 'Respuesta inválida de la API.');
http_response_code($codigo);
echo $respuesta;
