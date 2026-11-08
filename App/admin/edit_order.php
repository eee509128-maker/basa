<?php


ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);



require_once __DIR__ . '/../includes/config.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/functions.php';
requireLogin();

$pdo = getDB();
$id = $_GET['id'] ?? null;
if (!$id) { header('Location: dashboard.php'); exit; }

$stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
$stmt->execute(['id' => $id]);
$order = $stmt->fetch();
if (!$order) { header('Location: dashboard.php'); exit; }

// دریافت اقلام فاکتور موجود
$itemsStmt = $pdo->prepare("SELECT * FROM invoice_items WHERE order_id = :oid ORDER BY id ASC");
$itemsStmt->execute(['oid' => $id]);
$invoiceItems = $itemsStmt->fetchAll();

$isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $customer_name = $_POST['customer_name'] ?? '';
    $mobile = $_POST['mobile'] ?? '';
    $status = $_POST['status'] ?? 'unpaid';
    $newFile = $_FILES['pdf_file'] ?? null;
    $sendSms = isset($_POST['send_sms']);

    $mobile = toEnglishDigits($mobile);

    $response = ['success' => false, 'message' => ''];
    $token = $order['token'];
    $filePath = $order['file_path'];

    if ($newFile && $newFile['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($newFile['name'], PATHINFO_EXTENSION);
        if (strtolower($ext) !== 'pdf') {
            $response['message'] = 'فقط فایل PDF مجاز است.';
            if ($isAjax) {
                header('Content-Type: application/json');
                echo json_encode($response, JSON_UNESCAPED_UNICODE);
                exit;
            }
            $message = $response['message'];
        } else {
            if (!empty($filePath) && file_exists(__DIR__ . '/../' . $filePath) && is_file(__DIR__ . '/../' . $filePath)) {
                unlink(__DIR__ . '/../' . $filePath);
            }
            $token = generateShortToken();
            $newName = $token . '.pdf';
            $dest = __DIR__ . '/../uploads/pdfs/' . $newName;
            if (move_uploaded_file($newFile['tmp_name'], $dest)) {
                $filePath = 'uploads/pdfs/' . $newName;
            } else {
                $response['message'] = 'خطا در آپلود فایل جدید.';
                if ($isAjax) {
                    header('Content-Type: application/json');
                    echo json_encode($response, JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $message = $response['message'];
            }
        }
    }
    
    
    
    
    
    

    
    if (empty($response['message'])) {
    try {
        $descs  = $_POST['item_desc'] ?? [];
        $qtys   = $_POST['item_qty'] ?? [];
        $prices = $_POST['item_price'] ?? [];
        $totalAmount = 0;

        $pdo->beginTransaction();

        $pdo->prepare("DELETE FROM invoice_items WHERE order_id = :oid")->execute(['oid' => $id]);

        $stmtItem = $pdo->prepare("INSERT INTO invoice_items (order_id, description, quantity, price) VALUES (:oid, :desc, :qty, :price)");
        for ($i = 0; $i < count($descs); $i++) {
            $desc  = trim($descs[$i]);
            $qty   = (int)$qtys[$i];
            $price = (float)$prices[$i];
            if ($desc !== '' && $qty > 0 && $price > 0) {
                $stmtItem->execute(['oid' => $id, 'desc' => $desc, 'qty' => $qty, 'price' => $price]);
                $totalAmount += $qty * $price;
            }
        }

        $stmt = $pdo->prepare("UPDATE orders SET customer_name = :name, mobile = :mobile, amount = :amount, status = :status, file_path = :path, token = :token WHERE id = :id");
        $stmt->execute([
            'name'   => $customer_name,
            'mobile' => $mobile,
            'amount' => $totalAmount,
            'status' => $status,
            'path'   => $filePath,
            'token'  => $token,
            'id'     => $id
        ]);

        $pdo->commit();

        $response['success'] = true;
        $response['message'] = 'تغییرات با موفقیت ذخیره شد.';

        if ($sendSms) {
            sendTemplateSMS($mobile, SMS_TEMPLATE_ID, [$customer_name, $token]);
            $response['message'] .= ' پیامک نیز ارسال شد.';
        }
    } catch (PDOException $e) {
        $pdo->rollBack();
        $response['message'] = 'خطای پایگاه داده: ' . $e->getMessage();
    }
}


    
    
    
    
    
    

    if ($isAjax) {
        header('Content-Type: application/json');
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }
    $message = $response['message'];
}

// بازخوانی مجدد سفارش و اقلام (برای نمایش بروز)
$stmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
$stmt->execute(['id' => $id]);
$order = $stmt->fetch();

$itemsStmt->execute(['oid' => $id]);
$invoiceItems = $itemsStmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ویرایش سفارش</title>
    <link rel="stylesheet" href="../assets/style.css">
    <style>
        .invoice-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        .invoice-table th, .invoice-table td { padding: 8px; border-bottom: 1px solid #ddd; }
        .invoice-table th { background: #f4f4f4; }
        .row-total, #grandTotal { font-weight: bold; }
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
        <h3>ویرایش سفارش #<?= $order['id'] ?></h3>
        <?php if (isset($message) && $message): ?>
            <div class="alert success"><?= htmlspecialchars($message) ?></div>
        <?php endif; ?>
        <div class="form-card">
            <form method="POST" enctype="multipart/form-data" id="orderForm">
                <input type="hidden" name="edit_mode" value="1">

                <div class="form-group">
                    <label>نام مشتری</label>
                    <input type="text" name="customer_name" value="<?= htmlspecialchars($order['customer_name']) ?>" required>
                </div>
                <div class="form-group">
                    <label>شماره موبایل</label>
                    <input type="text" name="mobile" id="mobile" value="<?= htmlspecialchars($order['mobile']) ?>" required>
                </div>
                <div class="form-group">
                    <label>وضعیت پرداخت</label>
                    <select name="status">
                        <option value="unpaid" <?= $order['status'] === 'unpaid' ? 'selected' : '' ?>>پرداخت‌نشده</option>
                        <option value="paid" <?= $order['status'] === 'paid' ? 'selected' : '' ?>>پرداخت‌شده</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>فایل PDF (در صورت نیاز به تغییر)</label>
                    
                    <label for="pdf_file" class="drop-zone" id="dropZone">
                        <p>فایل را اینجا بکشید یا کلیک کنید</p>
                        <input type="file" name="pdf_file" id="pdf_file" accept=".pdf" style="display: none;">
                        <span id="file-name"></span>
                    </label>
                    
                    <small>
                        فایل فعلی: 
                        <a href="<?= BASE_URL ?>view.php?code=<?= htmlspecialchars($order['token']) ?>" target="_blank">
                            <?= htmlspecialchars($order['file_path']) ?>
                        </a>
                    </small>
                    
                    
                    <div class="progress-wrapper" id="progressContainer">
                        <progress id="progressBar" value="0" max="100"></progress>
                        <span id="progressPercent">0%</span>
                    </div>
                </div>

                <h4>اقلام فاکتور</h4>
                <div id="invoiceItems">
                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th>شرح</th>
                                <th>تعداد</th>
                                <th>قیمت واحد (تومان)</th>
                                <th>جمع</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody id="itemsBody">
                            <?php foreach ($invoiceItems as $item): ?>
                            <tr class="item-row">
                                <td><input type="text" name="item_desc[]" class="form-control" value="<?= htmlspecialchars($item['description']) ?>" required></td>
                                <td><input type="number" name="item_qty[]" class="form-control qty" value="<?= $item['quantity'] ?>" min="1" required style="width:80px"></td>
                                <td><input type="number" name="item_price[]" class="form-control price" value="<?= $item['price'] ?>" min="0" required style="width:120px"></td>
                                <td class="row-total"><?= number_format($item['quantity'] * $item['price']) ?></td>
                                <td><button type="button" class="btn btn-danger btn-sm remove-row">🗑️</button></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <button type="button" id="addRow" class="btn btn-secondary btn-sm">➕ افزودن ردیف</button>
                </div>
                <div class="form-group" style="text-align:left;font-weight:bold;margin-top:1rem;">
                    جمع کل: <span id="grandTotal">0</span> تومان
                </div>
                <!-- فیلد مخفی برای مبلغ (مقدارش توسط جاوااسکریپت تنظیم می‌شود) -->
                <input type="hidden" name="amount" id="amount" value="<?= $order['amount'] ?>">

                <button type="submit" id="submitBtn" class="btn btn-primary">ذخیره تغییرات</button>
                <a href="dashboard.php" class="btn btn-secondary">بازگشت</a>

                <input type="hidden" name="temp_token" id="temp_token" value="">
                <div id="uploadingIndicator" style="display:none;">در حال آپلود فایل...</div>
            </form>
        </div>
    </div>
</div>
<script>
// document.getElementById('dropZone').addEventListener('click', function() {
//     document.getElementById('pdf_file').click();
// });
</script>
<script src="../assets/script.js"></script>
<script>
// مدیریت اقلام فاکتور
function calcRow(row) {
    const qty = parseFloat(row.querySelector('.qty').value) || 0;
    const price = parseFloat(row.querySelector('.price').value) || 0;
    const total = qty * price;
    row.querySelector('.row-total').textContent = new Intl.NumberFormat('fa-IR').format(total);
    updateGrandTotal();
}
function updateGrandTotal() {
    let sum = 0;
    document.querySelectorAll('.item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.qty').value) || 0;
        const price = parseFloat(row.querySelector('.price').value) || 0;
        sum += qty * price;
    });
    document.getElementById('grandTotal').textContent = new Intl.NumberFormat('fa-IR').format(sum);
    document.getElementById('amount').value = sum;
}
document.getElementById('addRow').addEventListener('click', function() {
    const tbody = document.getElementById('itemsBody');
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.innerHTML = `
        <td><input type="text" name="item_desc[]" class="form-control" required></td>
        <td><input type="number" name="item_qty[]" class="form-control qty" value="1" min="1" required style="width:80px"></td>
        <td><input type="number" name="item_price[]" class="form-control price" value="0" min="0" required style="width:120px"></td>
        <td class="row-total">0</td>
        <td><button type="button" class="btn btn-danger btn-sm remove-row">🗑️</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.qty').addEventListener('input', function() { calcRow(tr); });
    tr.querySelector('.price').addEventListener('input', function() { calcRow(tr); });
    tr.querySelector('.remove-row').addEventListener('click', function() {
        tr.remove();
        updateGrandTotal();
    });
    calcRow(tr);
});
// اتصال رویدادها برای ردیف‌های موجود
document.querySelectorAll('.item-row').forEach(row => {
    row.querySelector('.qty').addEventListener('input', function() { calcRow(row); });
    row.querySelector('.price').addEventListener('input', function() { calcRow(row); });
    row.querySelector('.remove-row').addEventListener('click', function() {
        row.remove();
        updateGrandTotal();
    });
    calcRow(row);
});
updateGrandTotal();
</script>
</body>
</html>