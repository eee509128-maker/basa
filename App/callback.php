<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/zibal.php';

$action = $_GET['action'] ?? '';

if ($action === 'pay') {
    $code = $_GET['code'] ?? null;
    if (!$code) {
        die('کد نامعتبر.');
    }
    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE token = :token AND status = 'unpaid'");
    $stmt->execute(['token' => $code]);
    $order = $stmt->fetch();
    if (!$order) {
        die('سفارش معتبر نیست یا قبلاً پرداخت شده است.');
    }
    $callbackUrl = BASE_URL . 'callback.php?action=verify&order_id=' . $order['id'];
    $amountInRials = $order['amount'] * 10;
    $result = zibalRequest($amountInRials, $order['id'], $callbackUrl, 'پرداخت سفارش');
    if ($result['result'] == 100) {
        $trackId = $result['trackId'];
        header('Location: ' . ZIBAL_GATEWAY . $trackId);
        exit;
    } else {
        die('خطا در اتصال به درگاه پرداخت: ' . ($result['message'] ?? ''));
    }
} elseif ($action === 'verify') {
    $orderId = $_GET['order_id'] ?? null;
    $success = $_GET['success'] ?? 0;
    $trackId = $_GET['trackId'] ?? null;

    if (!$orderId || !$trackId) {
        die('پارامترهای نامعتبر.');
    }

    $pdo = getDB();
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
    $stmt->execute(['id' => $orderId]);
    $order = $stmt->fetch();
    if (!$order) {
        die('سفارش یافت نشد.');
    }

    $paid = false;
    $message = '';

    if ($success == 1) {
        $verifyResult = zibalVerify($trackId);

        // بررسی موفقیت‌آمیز بودن پرداخت
        if (isset($verifyResult['result']) && $verifyResult['result'] == 100 && isset($verifyResult['status']) && $verifyResult['status'] == 1) {
            $stmt = $pdo->prepare("UPDATE orders SET status = 'paid' WHERE id = :id");
            $stmt->execute(['id' => $orderId]);
            $paid = true;
            $message = 'پرداخت با موفقیت انجام شد.';
        } else {
            $message = 'پرداخت ناموفق بود: ' . ($verifyResult['message'] ?? 'پاسخی از درگاه دریافت نشد.');
        }
    } else {
        $message = 'پرداخت توسط کاربر لغو شد یا ناموفق بود.';
    }

    $redirectUrl = BASE_URL . 'view.php?code=' . $order['token'];
    $icon = $paid ? '✅' : '⚠️';
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نتیجه پرداخت</title>
    <link rel="stylesheet" href="assets/style.css">
    <style>
        .callback-message {
            background: #fff;
            border-radius: 20px;
            padding: 2rem;
            max-width: 450px;
            margin: 5rem auto;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.1);
        }
        .callback-message .icon { font-size: 3rem; margin-bottom: 1rem; }
        .callback-message p { margin-bottom: 1.5rem; color: #555; }
        .callback-message .btn { margin: 0.5rem; }
    </style>
</head>
<body style="background:#f5f7fa;">
    <div class="callback-message">
        <div class="icon"><?= $icon ?></div>
        <h3><?= htmlspecialchars($message) ?></h3>
        <p>در حال انتقال به صفحه سفارش...<br><small>چنانچه هدایت نشدید روی دکمه زیر کلیک کنید.</small></p>
        <a href="<?= $redirectUrl ?>" class="btn btn-primary">مشاهده سفارش</a>
    </div>
    <script>
        setTimeout(function() {
            window.location.href = '<?= $redirectUrl ?>';
        }, 10000);
    </script>
</body>
</html>
<?php
    exit;
} else {
    die('عملیات نامعتبر.');
}