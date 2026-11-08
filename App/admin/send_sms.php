<?php
require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';
requireLogin();

$id = $_GET['id'] ?? null;
if (!$id) {
    header('Location: dashboard.php');
    exit;
}

$pdo = getDB();
$stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
$stmt->execute(['id' => $id]);
$order = $stmt->fetch();

if (!$order) {
    echo 'سفارش یافت نشد.';
    exit;
}

// ساخت پیش‌نمایش پیامک بر اساس الگوی ۲۱۲۶۷
$smsPreview = "مشتری گرامی {$order['customer_name']}\nجهت مشاهده جواب آزمایش خود به لینک زیر مراجعه فرمائيد:\nhttp://basalaboratory.ir/view.php?code={$order['token']}\nلغو۱۱";

$result = sendTemplateSMS($order['mobile'], SMS_TEMPLATE_ID, [
    $order['customer_name'],   // param1
    $order['token']            // param2
]);
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نتیجه ارسال پیامک</title>
    <link rel="stylesheet" href="../assets/style.css">
    <style>
        .debug-box {
            background: #f8f9fa;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            font-size: 0.9rem;
            white-space: pre-wrap;
            word-break: break-all;
            direction: ltr;
            text-align: left;
        }
        .sms-preview {
            direction: rtl;
            text-align: right;
            background: #e8f0fe;
            border-color: #667eea;
        }
    </style>
</head>
<body>
<div class="admin-body">
    <div class="sidebar">
        <div class="logo">پنل ادمین</div>
        <a href="dashboard.php">📊 داشبورد</a>
        <a href="add_order.php">➕ سفارش جدید</a>
        <a href="logout.php">🚪 خروج</a>
    </div>
    <div class="main-content">
        <h3>نتیجه ارسال پیامک به <?= htmlspecialchars($order['mobile']) ?></h3>
        <p><strong>مشتری:</strong> <?= htmlspecialchars($order['customer_name']) ?></p>
        <p><strong>کد سفارش:</strong> <?= htmlspecialchars($order['token']) ?></p>
        <hr>

        <?php if ($result['success']): ?>
            <div class="alert success">✅ پیامک با موفقیت ارسال شد.</div>
        <?php else: ?>
            <div class="alert" style="background:#ffe3e3;color:#c0392b;">❌ خطا در ارسال پیامک</div>
        <?php endif; ?>

        <h4>پیش‌نمایش پیامک (مطابق الگوی ۲۱۲۶۷)</h4>
        <div class="debug-box sms-preview">
            <?= nl2br(htmlspecialchars($smsPreview)) ?>
        </div>

        <h4>جزئیات فنی</h4>
        <div class="debug-box">
            <strong>HTTP Code:</strong> <?= $result['httpCode'] ?><br>
            <?php if ($result['curlError']): ?>
                <strong>Curl Error:</strong> <?= htmlspecialchars($result['curlError']) ?><br>
            <?php endif; ?>
            <strong>Raw Response:</strong><br><?= htmlspecialchars($result['rawResponse']) ?>
        </div>

        <h4>پاسخ تحلیل شده</h4>
        <div class="debug-box">
            <?php if ($result['decoded']): ?>
                <?= htmlspecialchars(json_encode($result['decoded'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) ?>
            <?php else: ?>
                (پاسخ معتبر JSON نبود)
            <?php endif; ?>
        </div>

        <a href="dashboard.php" class="btn btn-secondary">بازگشت به داشبورد</a>
    </div>
</div>
</body>
</html>