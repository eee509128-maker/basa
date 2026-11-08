<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';
requireLogin();

$pdo = getDB();
$orders = $pdo->query("SELECT * FROM orders ORDER BY created_at DESC")->fetchAll();
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>پنل مدیریت</title>
    <link rel="stylesheet" href="../assets/style.css">
    <style>
        body { background: #f4f6f9; }
        .sidebar { background: #2c3e50; color: #fff; min-height: 100vh; }
        .sidebar a { color: #bdc3c7; padding: 10px 20px; display: block; text-decoration: none; border-radius: 10px; margin: 5px 10px; transition: 0.3s; }
        .sidebar a:hover, .sidebar a.active { background: #34495e; color: #fff; }
        .sidebar .logo { padding: 20px; text-align: center; font-size: 1.5rem; font-weight: bold; }
    </style>
</head>

<body>
<div class="admin-body">
    <div class="sidebar">
        <div class="logo">پنل ادمین</div>
        <a href="dashboard.php" class="active">📊 داشبورد</a>
        <a href="add_order.php">➕ سفارش جدید</a>
        <a href="logout.php">🚪 خروج</a>
    </div>
    <div class="main-content">
        <div class="flex-between">
            <h3>لیست سفارش‌ها</h3>
            <?php if (isset($_GET['msg']) && $_GET['msg'] === 'sms_sent'): ?>
                <div class="alert success">پیامک با موفقیت ارسال شد.</div>
            <?php elseif (isset($_GET['msg']) && $_GET['msg'] === 'sms_failed'): ?>
                <div class="alert" style="background:#ffe3e3;color:#c0392b;">خطا در ارسال پیامک.</div>
            <?php endif; ?>
            <a href="add_order.php" class="btn btn-primary">➕ سفارش جدید</a>
        </div>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>شماره</th>
                        <th>نام مشتری</th>
                        <th>موبایل</th>
                        <th>مبلغ (تومان)</th>
                        <th>وضعیت</th>
                        <th>تاریخ</th>
                        <th>عملیات</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($orders as $order): ?>
                    <tr>
                        <td><?= $order['id'] ?></td>
                        <td><?= htmlspecialchars($order['customer_name']) ?></td>
                        <td><?= htmlspecialchars($order['mobile']) ?></td>
                        <td><?= number_format($order['amount']) ?></td>
                        <td>
                            <?php if ($order['status'] === 'paid'): ?>
                                <span class="badge badge-success">پرداخت‌شده</span>
                            <?php else: ?>
                                <span class="badge badge-warning">پرداخت‌نشده</span>
                            <?php endif; ?>
                        </td>
                        <td><?= shamsi_date('Y/m/d H:i', strtotime($order['created_at'])) ?></td>
                        <td>
                            <a href="edit_order.php?id=<?= $order['id'] ?>" class="btn btn-sm btn-warning">✏️</a>
                            <a href="send_sms.php?id=<?= $order['id'] ?>" class="btn btn-sm btn-primary" onclick="return confirm('لینک پرداخت برای مشتری پیامک شود؟')">📩</a>
                            <a href="delete_order.php?id=<?= $order['id'] ?>" class="btn btn-sm btn-danger" onclick="return confirm('مطمئن هستید؟')">🗑️</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
</body>



</html>