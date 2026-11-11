<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/functions.php';
requireLogin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['pdf_file'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'درخواست نامعتبر'], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES['pdf_file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'message' => 'خطا در دریافت فایل'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
if (strtolower($ext) !== 'pdf') {
    echo json_encode(['success' => false, 'message' => 'فقط فایل PDF مجاز است.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tempToken = 'temp_' . bin2hex(random_bytes(16));
$tempDir = __DIR__ . '/../uploads/temp/';
if (!is_dir($tempDir)) {
    mkdir($tempDir, 0755, true);
}
$dest = $tempDir . $tempToken . '.pdf';

if (move_uploaded_file($file['tmp_name'], $dest)) {
    echo json_encode([
        'success' => true,
        'temp_token' => $tempToken,
        'file_path' => 'uploads/temp/' . $tempToken . '.pdf'
    ], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(['success' => false, 'message' => 'خطا در ذخیره فایل'], JSON_UNESCAPED_UNICODE);
}