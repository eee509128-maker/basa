<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';

requireLogin();

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $customer_name = $_POST['customer_name'] ?? '';
    $mobile = $_POST['mobile'] ?? '';

    $mobile = toEnglishDigits($mobile);

    if ($customer_name && $mobile) {
        $token = generateShortToken();
        $pdo = getDB();
        $stmt = $pdo->prepare("INSERT INTO orders (customer_name, mobile, file_path, amount, status, token) VALUES (:name, :mobile, '', 0, 'unpaid', :token)");
        $stmt->execute([
            'name'   => $customer_name,
            'mobile' => $mobile,
            'token'  => $token
        ]);
        $orderId = $pdo->lastInsertId();
        header('Location: edit_order.php?id=' . $orderId);
        exit;
    } else {
        $message = 'لطفاً همه فیلدها را پر کنید.';
    }
}
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>سفارش جدید</title>
    <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<div class="admin-body">
    <div class="sidebar">
        <div class="logo">پنل ادمین</div>
        <a href="dashboard.php">📊 داشبورد</a>
        <a href="add_order.php" class="active">➕ سفارش جدید</a>
        <a href="logout.php">🚪 خروج</a>
    </div>
    <div class="main-content">
        <h3>ایجاد سفارش جدید</h3>
        <?php if ($message): ?>
            <div class="alert success"><?= htmlspecialchars($message) ?></div>
        <?php endif; ?>
        <div class="form-card">
            <form method="POST">
                <div class="form-group">
                    <label>نام مشتری</label>
                    <input type="text" name="customer_name" required>
                </div>
                <div class="form-group">
                    <label>شماره موبایل</label>
                    <input type="text" name="mobile" id="mobile" required>
                </div>
                <button type="submit" class="btn btn-primary">ایجاد سفارش</button>
            </form>
        </div>
    </div>
</div>
<script src="../assets/script.js"></script>
</body>
</html>