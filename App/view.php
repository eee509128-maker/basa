<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/zibal.php';

$code = $_GET['code'] ?? null;
if (!$code) {
    die('دسترسی غیرمجاز');
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT * FROM orders WHERE token = :code");
$stmt->execute(['code' => $code]);
$order = $stmt->fetch();

if (!$order) {
    die('سفارش یافت نشد.');
}

// دریافت اقلام فاکتور
$items = $pdo->prepare("SELECT * FROM invoice_items WHERE order_id = :oid ORDER BY id ASC");
$items->execute(['oid' => $order['id']]);
$invoiceItems = $items->fetchAll();
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نتیجه آزمایش | باسا</title>
    <link rel="stylesheet" href="assets/style.css">
    <style>
        .invoice-view-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            text-align: right;
        }
        .invoice-view-table th {
            background: #f0f2f5;
            padding: 10px;
            font-weight: bold;
        }
        .invoice-view-table td {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .total-row {
            background: #fafafa;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="view-page">
        <div class="order-card">
            <?php if ($order['status'] === 'paid'): ?>
                <div class="icon-large text-success">✅</div>
                <h3><?= htmlspecialchars($order['customer_name']) ?> عزیز</h3>
                <p>نتیجه آزمایش شما آماده است.</p>
                <a href="<?= htmlspecialchars($order['file_path']) ?>" target="_blank" class="btn btn-success btn-lg">مشاهده نتیجه آزمایش</a>
            <?php else: ?>
                <div class="icon-large text-warning">⚠️</div>
                <h3><?= htmlspecialchars($order['customer_name']) ?> عزیز</h3>
                <p>برای مشاهده نتیجه آزمایش، لطفاً ابتدا فاکتور زیر را بررسی و پرداخت نمایید.</p>
            <?php endif; ?>

            <?php if ($invoiceItems): ?>
            <table class="invoice-view-table">
                <thead>
                    <tr>
                        <th>شرح</th>
                        <th>تعداد</th>
                        <th>قیمت واحد (تومان)</th>
                        <th>جمع</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($invoiceItems as $item): ?>
                    <tr>
                        <td><?= htmlspecialchars($item['description']) ?></td>
                        <td><?= $item['quantity'] ?></td>
                        <td><?= number_format($item['price']) ?></td>
                        <td><?= number_format($item['quantity'] * $item['price']) ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <tr class="total-row">
                        <td colspan="3">جمع کل</td>
                        <td><?= number_format($order['amount']) ?> تومان</td>
                    </tr>
                </tbody>
            </table>
            <?php endif; ?>

            <?php if ($order['status'] !== 'paid'): ?>
                <a href="<?= BASE_URL ?>callback.php?action=pay&code=<?= htmlspecialchars($order['token']) ?>" class="btn btn-primary btn-lg">پرداخت و مشاهده نتیجه</a>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>