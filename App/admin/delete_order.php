<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';
requireLogin();

$pdo = getDB();
$id = $_GET['id'] ?? null;

if ($id) {
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $order = $stmt->fetch();

    if ($order) {
        if (file_exists(__DIR__ . '/../' . $order['file_path'])) {
            unlink(__DIR__ . '/../' . $order['file_path']);
        }
        $stmt = $pdo->prepare("DELETE FROM orders WHERE id = :id");
        $stmt->execute(['id' => $id]);
    }
}

header('Location: dashboard.php');
exit;