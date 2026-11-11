<?php
// Basa Veterinary Laboratory - Root Web & API Bridge
if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

// If an API request reaches index.php, forward to api.php:
if (isset($_GET['route']) || (isset($_SERVER['REQUEST_URI']) && str_contains($_SERVER['REQUEST_URI'], '/api/'))) {
    require __DIR__ . '/api.php';
    exit();
}

// Read index.html
$html = @file_get_contents(__DIR__ . '/index.html');
if (!$html) {
    header('Location: /index.html');
    exit();
}

// Check session or cookie for user
$currentUser = $_SESSION['basa_user'] ?? null;
if (!$currentUser && !empty($_COOKIE['basa_user'])) {
    $rawVal = $_COOKIE['basa_user'];
    $candidates = [$rawVal, rawurldecode($rawVal), urldecode($rawVal)];
    foreach ($candidates as $cand) {
        $c = @json_decode($cand, true);
        if (is_array($c) && (!empty($c['fullName']) || !empty($c['username']) || !empty($c['mobile']))) {
            $currentUser = $c;
            $_SESSION['basa_user'] = $c;
            break;
        }
    }
}

if ($currentUser) {
    $userJson = json_encode($currentUser, JSON_UNESCAPED_UNICODE);
    $script = "<script>window.__PRELOADED_USER__ = {$userJson}; try { localStorage.setItem('basa_user', JSON.stringify({$userJson})); sessionStorage.setItem('basa_user', JSON.stringify({$userJson})); window.name = 'BASA_SESSION:' + JSON.stringify({user: {$userJson}, token: " . json_encode($currentUser['token'] ?? $currentUser['id'] ?? '1') . "}); } catch(e){} </script>";
    if (strpos($html, '</head>') !== false) {
        $html = str_replace('</head>', $script . "\n</head>", $html);
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: max-age=0, no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
echo $html;
exit();
?>