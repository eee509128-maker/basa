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
    $file = $_FILES['pdf_file'] ?? null;

    $mobile = toEnglishDigits($mobile);

    if ($customer_name && $mobile && $file && $file['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (strtolower($ext) === 'pdf') {
            $token = generateShortToken();
            $newName = $token . '.pdf';
            $dest = __DIR__ . '/../uploads/pdfs/' . $newName;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                $pdo = getDB();
                $stmt = $pdo->prepare("INSERT INTO orders (customer_name, mobile, file_path, amount, status, token) VALUES (:name, :mobile, :path, 0, 'unpaid', :token)");
                $stmt->execute([
                    'name'   => $customer_name,
                    'mobile' => $mobile,
                    'path'   => 'uploads/pdfs/' . $newName,
                    'token'  => $token
                ]);
                $orderId = $pdo->lastInsertId();
                header('Location: edit_order.php?id=' . $orderId);
                exit;
            } else {
                $message = 'خطا در آپلود فایل.';
            }
        } else {
            $message = 'فقط فایل PDF مجاز است.';
        }
    } else {
        $message = 'لطفاً تمام فیلدها را پر کنید و فایل PDF انتخاب نمایید.';
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
            <form method="POST" enctype="multipart/form-data" id="orderForm">
                <div class="form-group">
                    <label>نام مشتری</label>
                    <input type="text" name="customer_name" required>
                </div>
                <div class="form-group">
                    <label>شماره موبایل</label>
                    <input type="text" name="mobile" id="mobile" required>
                </div>
                <div class="form-group">
                    <label>فایل PDF</label>
                    <div class="drop-zone" id="dropZone">
                        <p>فایل را اینجا بکشید یا کلیک کنید</p>
                        <input type="file" name="pdf_file" id="pdf_file" accept=".pdf" required style="display: none;">
                        <span id="file-name"></span>
                    </div>
                    <div class="progress-wrapper" id="progressContainer">
                        <progress id="progressBar" value="0" max="100"></progress>
                        <span id="progressPercent">0%</span>
                    </div>
                </div>
                <button type="submit" id="submitBtn" class="btn btn-primary">ایجاد سفارش</button>
                <input type="hidden" name="temp_token" id="temp_token" value="">
                <div id="uploadingIndicator" style="display:none;">در حال آپلود فایل...</div>
            </form>
        </div>
    </div>
</div>
<script>
document.getElementById('dropZone').addEventListener('click', function() {
    document.getElementById('pdf_file').click();
});
</script>
<script src="../assets/script.js"></script>
</body>
</html>