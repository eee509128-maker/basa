<?php
session_start();

function isLoggedIn() {
    return isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;
}

function requireLogin() {
    if (!isLoggedIn()) {
        header('Location: login.php');
        exit;
    }
}

function generateShortToken() {
    $chars = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ'; // بدون صفر و O برای خوانایی
    $length = 6;
    $pdo = getDB();
    do {
        $token = '';
        for ($i = 0; $i < $length; $i++) {
            $token .= $chars[random_int(0, strlen($chars) - 1)];
        }
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE token = :token");
        $stmt->execute(['token' => $token]);
    } while ($stmt->fetchColumn() > 0);
    return $token;
}

function sendTemplateSMS($mobile, $templateID, $params = []) {
    $url = 'https://api.msgway.com/send';
    $data = [
        'mobile'     => $mobile,
        'method'     => 'sms',
        'templateID' => (int) $templateID,
        'params'     => $params
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_HTTPHEADER     => [
            'apiKey: ' . MSG_APIKEY,
            'Content-Type: application/json'
        ],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $responseBody = curl_exec($ch);
    $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error        = curl_error($ch);
    curl_close($ch);

    $decoded = json_decode($responseBody, true);
    $success = ($httpCode === 200 && isset($decoded['status']) && $decoded['status'] === 'success');

    return [
        'success'      => $success,
        'httpCode'     => $httpCode,
        'curlError'    => $error,
        'rawResponse'  => $responseBody,
        'decoded'      => $decoded,
    ];
}

function gregorian_to_jalali($g_y, $g_m, $g_d) {
    $g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    $j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

    $gy = $g_y - 1600;
    $gm = $g_m - 1;
    $gd = $g_d - 1;

    $g_day_no = 365 * $gy + (int)(($gy + 3) / 4) - (int)(($gy + 99) / 100) + (int)(($gy + 399) / 400);

    for ($i = 0; $i < $gm; ++$i) {
        $g_day_no += $g_days_in_month[$i];
    }
    if ($gm > 1 && (($gy % 4 == 0 && $gy % 100 != 0) || ($gy % 400 == 0))) {
        $g_day_no++;
    }
    $g_day_no += $gd;

    $j_day_no = $g_day_no - 79;

    $j_np = (int)($j_day_no / 12053);
    $j_day_no %= 12053;

    $jy = 979 + 33 * $j_np + 4 * (int)($j_day_no / 1461);
    $j_day_no %= 1461;

    if ($j_day_no >= 366) {
        $jy += (int)(($j_day_no - 1) / 365);
        $j_day_no = ($j_day_no - 1) % 365;
    }

    for ($i = 0; $i < 11 && $j_day_no >= $j_days_in_month[$i]; ++$i) {
        $j_day_no -= $j_days_in_month[$i];
    }
    $jm = $i + 1;
    $jd = $j_day_no + 1;

    return [$jy, $jm, $jd];
}

function shamsi_date($format, $timestamp = null) {
    if ($timestamp === null) {
        $timestamp = time();
    }
    $g_y = (int)date('Y', $timestamp);
    $g_m = (int)date('m', $timestamp);
    $g_d = (int)date('d', $timestamp);
    list($jy, $jm, $jd) = gregorian_to_jalali($g_y, $g_m, $g_d);

    $H = (int)date('H', $timestamp);
    $i = (int)date('i', $timestamp);
    $s = (int)date('s', $timestamp);

    $result = $format;
    $result = str_replace('Y', $jy, $result);
    $result = str_replace('m', str_pad($jm, 2, '0', STR_PAD_LEFT), $result);
    $result = str_replace('d', str_pad($jd, 2, '0', STR_PAD_LEFT), $result);
    $result = str_replace('H', str_pad($H, 2, '0', STR_PAD_LEFT), $result);
    $result = str_replace('i', str_pad($i, 2, '0', STR_PAD_LEFT), $result);
    $result = str_replace('s', str_pad($s, 2, '0', STR_PAD_LEFT), $result);

    return $result;
}

function toEnglishDigits($text) {
    $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    $arabic  = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    $english = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return str_replace($persian, $english, str_replace($arabic, $english, $text));
}

