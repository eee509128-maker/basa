<?php
// Basa Veterinary Laboratory - Universal Lightweight API Handler for cPanel
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$route = isset($_GET['route']) ? trim($_GET['route'], '/') : '';
if (empty($route)) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (strpos($uri, '/api/') === 0) {
        $route = substr($uri, 5);
    }
}

$dataDir = __DIR__ . '/data';
if (!file_exists($dataDir)) {
    @mkdir($dataDir, 0755, true);
}

function readDataJSON($filename, $default = []) {
    global $dataDir;
    $filePath = $dataDir . '/' . $filename;
    if (file_exists($filePath)) {
        $content = @file_get_contents($filePath);
        if ($content) {
            $json = json_decode($content, true);
            if (is_array($json)) return $json;
        }
    }
    return $default;
}

function writeDataJSON($filename, $data) {
    global $dataDir;
    $filePath = $dataDir . '/' . $filename;
    return @file_put_contents($filePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?: $_POST;

// 1. Tests catalog
if ($route === 'tests' || $route === 'api/tests') {
    $tests = readDataJSON('tests.json', []);
    echo json_encode(['success' => true, 'tests' => $tests], JSON_UNESCAPED_UNICODE);
    exit();
}

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

// Helper to set persistent authentication cookies for both HTTP & HTTPS
function setBasaAuthCookies($user, $token) {
    $_SESSION['basa_user'] = $user;
    $_SESSION['basa_token'] = $token;
    $userJson = json_encode($user, JSON_UNESCAPED_UNICODE);
    $expire = time() + (86400 * 365); // 1 year
    @setrawcookie('basa_user', rawurlencode($userJson), $expire, '/');
    @setrawcookie('basa_auth', rawurlencode((string)$token), $expire, '/');
    @setrawcookie('basa_token', rawurlencode((string)$token), $expire, '/');
    @setrawcookie('basa_auth_token', rawurlencode((string)$token), $expire, '/');
}

function decodeCookieUserPHP($rawVal) {
    if (empty($rawVal)) return null;
    $candidates = [$rawVal, rawurldecode($rawVal), urldecode($rawVal)];
    foreach ($candidates as $cand) {
        $parsed = @json_decode($cand, true);
        if (is_array($parsed) && (!empty($parsed['fullName']) || !empty($parsed['username']) || !empty($parsed['mobile']))) {
            return $parsed;
        }
    }
    return null;
}

// 2. Authentication: Register
if ($route === 'auth/register' || $route === 'api/auth/register') {
    $fullName = trim($input['fullName'] ?? '');
    $mobile = trim($input['mobile'] ?? '');
    $password = trim($input['password'] ?? '');
    $clinicName = trim($input['clinicName'] ?? 'مشتری مستقیم');

    if (empty($fullName) || empty($mobile)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'لطفاً نام و نام خانوادگی و شماره موبایل را وارد کنید.'], JSON_UNESCAPED_UNICODE);
        exit();
    }

    $users = readDataJSON('users.json', []);
    foreach ($users as &$u) {
        if (($u['mobile'] ?? '') === $mobile) {
            $token = 'basa_tok_' . md5($u['id'] . time());
            $u['token'] = $token;
            writeDataJSON('users.json', $users);
            setBasaAuthCookies($u, $token);
            echo json_encode([
                'success' => true,
                'message' => 'ورود با موفقیت انجام شد.',
                'token' => $token,
                'user' => $u
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }
    unset($u);

    $token = 'basa_tok_' . md5(time() . rand(1000, 9999));
    $newUser = [
        'id' => count($users) + 1,
        'username' => $mobile,
        'mobile' => $mobile,
        'fullName' => $fullName,
        'clinicName' => $clinicName,
        'role' => 'customer',
        'registeredAt' => date('Y-m-d H:i:s'),
        'token' => $token
    ];

    $users[] = $newUser;
    writeDataJSON('users.json', $users);
    setBasaAuthCookies($newUser, $token);

    echo json_encode([
        'success' => true,
        'token' => $token,
        'user' => $newUser
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// 3. Authentication: Login
if ($route === 'auth/login' || $route === 'api/auth/login') {
    $username = trim($input['username'] ?? '');
    $password = trim($input['password'] ?? '');

    if ($username === 'basa.ir' && $password === 'alihasan') {
        $adminUser = [
            'id' => 1,
            'username' => 'basa.ir',
            'fullName' => 'مدیریت ارشد آزمایشگاه باسا',
            'clinicName' => 'آزمایشگاه تخصصی باسا',
            'role' => 'admin',
            'mobile' => '09155193678',
            'token' => 'admin_session_basa'
        ];
        setBasaAuthCookies($adminUser, 'admin_session_basa');
        echo json_encode([
            'success' => true,
            'token' => 'admin_session_basa',
            'redirect' => '/admin.html',
            'user' => $adminUser
        ], JSON_UNESCAPED_UNICODE);
        exit();
    }

    $users = readDataJSON('users.json', []);
    foreach ($users as &$u) {
        if ($u['username'] === $username || ($u['mobile'] ?? '') === $username) {
            $token = 'basa_tok_' . md5($u['id'] . time());
            $u['token'] = $token;
            writeDataJSON('users.json', $users);
            setBasaAuthCookies($u, $token);
            echo json_encode([
                'success' => true,
                'token' => $token,
                'user' => $u
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }
    unset($u);

    if (!empty($username)) {
        $token = 'tok_' . time();
        $user = [
            'id' => time(),
            'username' => $username,
            'fullName' => $username,
            'mobile' => $username,
            'role' => 'customer',
            'token' => $token
        ];
        $users[] = $user;
        writeDataJSON('users.json', $users);
        setBasaAuthCookies($user, $token);

        echo json_encode([
            'success' => true,
            'token' => $token,
            'user' => $user
        ], JSON_UNESCAPED_UNICODE);
        exit();
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'نام کاربری یا رمز عبور اشتباه است.'], JSON_UNESCAPED_UNICODE);
    exit();
}

// 4. Current User: /api/auth/me
if ($route === 'auth/me' || $route === 'api/auth/me') {
    // Check PHP session first
    if (!empty($_SESSION['basa_user']) && is_array($_SESSION['basa_user'])) {
        echo json_encode(['authenticated' => true, 'user' => $_SESSION['basa_user']], JSON_UNESCAPED_UNICODE);
        exit();
    }

    // Check Cookie
    if (!empty($_COOKIE['basa_user'])) {
        $cookieUser = decodeCookieUserPHP($_COOKIE['basa_user']);
        if ($cookieUser) {
            $_SESSION['basa_user'] = $cookieUser;
            echo json_encode(['authenticated' => true, 'user' => $cookieUser], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_GET['auth'] ?? $_GET['token'] ?? $_COOKIE['basa_auth'] ?? $_COOKIE['basa_token'] ?? '';
    $token = str_replace('Bearer ', '', trim($authHeader));

    if (!empty($token)) {
        if ($token === 'admin_session_basa') {
            $adminUser = [
                'id' => 1,
                'username' => 'basa.ir',
                'fullName' => 'مدیریت ارشد آزمایشگاه باسا',
                'clinicName' => 'آزمایشگاه تخصصی باسا',
                'role' => 'admin',
                'mobile' => '09155193678'
            ];
            setBasaAuthCookies($adminUser, 'admin_session_basa');
            echo json_encode([
                'authenticated' => true,
                'user' => $adminUser
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $users = readDataJSON('users.json', []);
        foreach ($users as $u) {
            if (($u['username'] ?? '') === $token || ($u['mobile'] ?? '') === $token || (isset($u['id']) && (string)$u['id'] === $token) || (isset($u['token']) && $u['token'] === $token)) {
                setBasaAuthCookies($u, $token);
                echo json_encode(['authenticated' => true, 'user' => $u], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }
    }

    echo json_encode(['authenticated' => false], JSON_UNESCAPED_UNICODE);
    exit();
}

// 4.5. Logout API
if ($route === 'auth/logout' || $route === 'api/auth/logout') {
    $_SESSION = [];
    if (session_id() != '' || headers_sent()) {
        @session_destroy();
    }
    @setcookie('basa_user', '', time() - 3600, '/');
    @setcookie('basa_auth', '', time() - 3600, '/');
    @setcookie('basa_token', '', time() - 3600, '/');
    @setcookie('basa_auth_token', '', time() - 3600, '/');
    echo json_encode(['success' => true, 'message' => 'با موفقیت خارج شدید.'], JSON_UNESCAPED_UNICODE);
    exit();
}

// 5. Triage AI Analysis
function detectSpeciesExplicitPHP($text) {
    $t = mb_strtolower($text, 'UTF-8');
    if (preg_match('/(گربه|گرهب|کربه|گربم|گریم|گربه‌ام|پیشی|پیشیم|پیشی‌ام|پرشین|dsh|اسکاتیش|بریتیش|سیامی|هیمالین)/u', $t)) {
        return 'گربه';
    }
    if (preg_match('/(اسب|اسبم|مادیان|مادیون|نریان|کره اسب|دره‌شوری|ترکمن|سیلمی|تروبرد|کورس)/u', $t)) {
        return 'اسب';
    }
    if (preg_match('/(طوطی|طوطیم|کاسکو|عروس هلندی|عروس|فنچ|قناری|مرغ مینا|پرنده|پرندم|کبوتر|جوجه|مرغ|خروس|ملنگو|کاکادو|برزیلی)/u', $t)) {
        return 'پرندگان';
    }
    if (preg_match('/(?:^|[^\p{L}\p{N}_])(گاو|گاوم|گوساله|گوسفند|گوسفندم|بره|بز|بزم|بزغاله|شتر|دام بزرگ)(?:[^\p{L}\p{N}_]|$)/u', $t)) {
        return 'دام بزرگ';
    }
    if (preg_match('/(خرگوش|خرگوشم|همستر|خوکچه|ایگوانا|لاکپشت|لاک‌پشت|مار|سنجاب|اگزوتیک)/u', $t)) {
        return 'حیوانات اگزوتیک';
    }
    if (preg_match('/(سگ|سگم|پامرانین|هاسکی|ژرمن|توله|شیتزو|تریر|روتوایلر|پیت بول|مالینویز|دوبرمن|گلدن|پاگ|چاوچاو|بولداگ|اشپیتز|پودل)/u', $t)) {
        return 'سگ';
    }
    return null;
}

function detectSpeciesFromTextPHP($text) {
    return detectSpeciesExplicitPHP($text) ?: 'سگ';
}

if ($route === 'triage/analyze' || $route === 'api/triage/analyze') {
    $prompt = trim($input['userPrompt'] ?? '');
    $lower = mb_strtolower($prompt, 'UTF-8');
    $allTests = readDataJSON('tests.json', []);
    // 1. Cloudflare Workers AI Credentials (Unfiltered & Direct from Iran)
    $cfAccountId = getenv('CLOUDFLARE_ACCOUNT_ID') ?: 'e8950358d5cf09f0f511b46172f65791';
    $cfToken = getenv('CLOUDFLARE_AI_TOKEN') ?: 'cfut_z41Q6SlFy5iNKPrYiB03QxiEafusIRjgtFS91Dsn10e86511';
    $cfModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

    if (file_exists(__DIR__ . '/App/includes/config.php')) {
        @include_once __DIR__ . '/App/includes/config.php';
        if (defined('CLOUDFLARE_ACCOUNT_ID') && CLOUDFLARE_ACCOUNT_ID) $cfAccountId = CLOUDFLARE_ACCOUNT_ID;
        if (defined('CLOUDFLARE_AI_TOKEN') && CLOUDFLARE_AI_TOKEN) $cfToken = CLOUDFLARE_AI_TOKEN;
        if (defined('CLOUDFLARE_AI_MODEL') && CLOUDFLARE_AI_MODEL) $cfModel = CLOUDFLARE_AI_MODEL;
    }

    if (!empty($cfAccountId) && !empty($cfToken) && function_exists('curl_init') && !empty($prompt)) {
        $testsSummary = array_map(function($t) {
            return [
                'id' => $t['id'],
                'code' => $t['code'] ?? '',
                'name' => $t['name'] ?? '',
                'category' => $t['category'] ?? ''
            ];
        }, $allTests);

        $systemPrompt = "شما دستیار فوق‌تخصصی تریاژ آزمایشگاه دامپزشکی باسا هستید. علائم بالینی بیمار را بررسی کرده و دقیق‌ترین تست‌ها را از فهرست آزمایشگاه باسا انتخاب کنید.\n" .
            "فهرست تست‌ها: " . json_encode($testsSummary, JSON_UNESCAPED_UNICODE) . "\n" .
            "قواعد حیاتی دامپزشکی:\n" .
            "۱. شناسایی گونه: واژگان گربه شامل گربه، گربم، گریم، پیشی، پیشیم، پرشین؛ اسب شامل اسب، اسبم، مادیان، کره اسب؛ پرنده شامل طوطی، کاسکو، عروس، پرنده؛ سگ شامل سگ، سگم، توله، هاسکی.\n" .
            "۲. اسب‌ها توانایی فیزیولوژیک استفراغ یا تهوع ندارند و تهوع در اسب نشانه ریفلاکس معدی ناشی از کولیک حاد یا چوک مری با خطر پارگی کشنده معده است.\n" .
            "۳. ناتوانی در راه رفتن اسب نشانه درد کولیک، رابدومیولیز/تایینگ‌آپ عضلانی (آسیب عضلات) یا لامینایتیس سم است و یک اورژانس حیاتی است.\n" .
            "خروجی را فقط و فقط به صورت JSON معتبر و بدون تگ مارک‌داون بازگردانید با ساختار زیر:\n" .
            "{\n" .
            '  "detectedSpecies": "سگ | گربه | اسب | پرندگان | دام بزرگ",' . "\n" .
            '  "breed": "نژاد مشخص شده یا تخمینی",' . "\n" .
            '  "age": "سن بیمار",' . "\n" .
            '  "urgencyLevel": "اورژانسی (حیاتی) | اولویت بالا | اولویت متوسط | عادی",' . "\n" .
            '  "clinicalImpressions": ["تشخیص افتراقی ۱", "تشخیص افتراقی ۲"],' . "\n" .
            '  "symptomsSummary": "خلاصه شسته‌رفته علائم بالینی به زبان دامپزشکی",' . "\n" .
            '  "suggestedTestIds": ["آی‌دی‌های تست‌های مرتبط دقیقاً از فهرست بالا مثل HEM-01, BIO-01, BIO-04"],' . "\n" .
            '  "clinicalReasoning": "تحلیل بالینی فارسی مفصل در ۲ پاراگراف برای دامپزشک یا صاحب بیمار",' . "\n" .
            '  "preparationGuide": "توصیه‌های ضروری پیش از نمونه‌گیری و ارجاع اورژانسی"' . "\n" .
            "}";

        $cfUrl = "https://api.cloudflare.com/client/v4/accounts/{$cfAccountId}/ai/run/{$cfModel}";
        $cfPayload = [
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.2,
            'max_tokens' => 1200
        ];

        $ch = curl_init($cfUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $cfToken,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cfPayload));
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $cfRaw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $cfRaw) {
            $parsedCf = json_decode($cfRaw, true);
            $aiTriage = null;
            if (isset($parsedCf['result']['response']) && is_array($parsedCf['result']['response'])) {
                $aiTriage = $parsedCf['result']['response'];
            } elseif (isset($parsedCf['result']['choices'][0]['message']['content']) && is_array($parsedCf['result']['choices'][0]['message']['content'])) {
                $aiTriage = $parsedCf['result']['choices'][0]['message']['content'];
            } else {
                $rawText = $parsedCf['result']['response'] ?? ($parsedCf['result']['choices'][0]['message']['content'] ?? '');
                if (is_string($rawText)) {
                    $clean = trim(preg_replace('/```json|```/', '', $rawText));
                    if (preg_match('/\{[\s\S]*\}/', $clean, $matches)) {
                        $clean = $matches[0];
                    }
                    $aiTriage = json_decode($clean, true);
                    if (!$aiTriage) {
                        $altClean = preg_replace("/'([^']*)'/", '"$1"', $clean);
                        $altClean = preg_replace('/([a-zA-Z0-9_]+):/', '"$1":', $altClean);
                        $aiTriage = json_decode($altClean, true);
                    }
                }
            }

            if ($aiTriage && (!empty($aiTriage['clinicalReasoning']) || !empty($aiTriage['reasoning']))) {
                // Enforce Species Override only if explicitly mentioned in prompt text
                $explicitSp = detectSpeciesExplicitPHP($prompt);
                if ($explicitSp) {
                    $aiTriage['detectedSpecies'] = $explicitSp;
                } elseif (empty($aiTriage['detectedSpecies']) || !in_array($aiTriage['detectedSpecies'], ['سگ', 'گربه', 'اسب', 'پرندگان', 'دام بزرگ', 'حیوانات اگزوتیک'])) {
                    $aiTriage['detectedSpecies'] = 'سگ';
                }

                if (($aiTriage['detectedSpecies'] ?? '') === 'اسب') {
                    if (mb_strpos($lower, 'تهوع') !== false || mb_strpos($lower, 'استفراغ') !== false || mb_strpos($lower, 'بالا آوردن') !== false || mb_strpos($lower, 'کولیک') !== false || mb_strpos($lower, 'راه') !== false || mb_strpos($lower, 'لنگش') !== false || mb_strpos($lower, 'پا') !== false || mb_strpos($lower, 'دست') !== false || mb_strpos($lower, 'زمین') !== false || mb_strpos($lower, 'عضله') !== false || mb_strpos($lower, 'سم') !== false) {
                        $aiTriage['urgencyLevel'] = '🔴 اورژانسی (حیاتی - خطر کولیک حاد، ریفلاکس معده یا میوپاتی)';
                        $aiTriage['clinicalImpressions'] = [
                            'سندرم کولیک حاد و ریفلاکس معدی (Acute Equine Colic & Gastric Reflux)',
                            'میوپاتی انقباضی و رابدومیولیز ناشی از فعالیت (Exertional Rhabdomyolysis / Tying-Up)',
                            'لامینایتیس حاد سم (Acute Laminitis)'
                        ];
                        $aiTriage['clinicalReasoning'] = "هشدار بالینی فوق‌العاده حیاتی: اسب‌ها به دلیل ساختار بسیار قوی اسفنکتر کاردیا و آناتومی مری، از نظر فیزیولوژیک توانایی استفراغ یا تهوع ندارند. هرگونه علائم شبیه به حالت تهوع یا خروج ترشحات از دهان/بینی در اسب نشانه ریفلاکس شدید بینی-معدی (Nasogastric Reflux) ناشی از کولیک انسدادی حاد روده، اتساع شدید معده یا انسداد مری (Choke) است و خطر مرگبار پارگی معده وجود دارد.\n\nهمچنین ناتوانی در گام برداشتن حاکی از درد احشایی کولیک شدید، اسپاسم حاد عضلانی ناشی از تمرین (سندرم Tying-Up / آزوتوری) یا التهاب بسیار دردناک لایه‌های حساس سم (لامینایتیس) می‌باشد.\n\nپنل بیوشیمی پایه (کد BIO-01) با پایش آنزیم عضلانی AST، کراتینین، BUN و پروتئین‌ها شدت تخریب بافتی و دهیدراسیون را معین می‌سازد. آزمایش CBC هماتولوژی (کد HEM-01) لکوگرام، فیبرینوژن و سپسیس پریتونئال را ارزیابی کرده و پنل کامل الکترولیت‌ها (کد BIO-04) جهت اصلاح عدم تعادل الکترولیتی و اسیدوز حیاتی است.\n\nاقدام فوری: حضور اورژانسی دامپزشک متخصص اسب بر بالین بیمار جهت تعبیه سوند بینی-معدی و تسکین فوری درد اکیداً الزامی است.";
                        $aiTriage['suggestedTestIds'] = ['BIO-01', 'HEM-01', 'BIO-04'];
                    }
                } elseif (($aiTriage['detectedSpecies'] ?? '') === 'دام بزرگ') {
                    if (mb_strpos($lower, 'تهوع') !== false || mb_strpos($lower, 'استفراغ') !== false || mb_strpos($lower, 'راه') !== false || mb_strpos($lower, 'زمین') !== false || mb_strpos($lower, 'ضعف') !== false || mb_strpos($lower, 'نفخ') !== false || mb_strpos($lower, 'اسهال') !== false || mb_strpos($lower, 'بی حال') !== false) {
                        $aiTriage['urgencyLevel'] = '🔴 اورژانسی (حیاتی - خطر انتروتوکسمی، نفخ حاد سیرابی یا مسمومیت سیستمیک)';
                        $aiTriage['clinicalImpressions'] = [
                            'انتروتوکسمی حاد و توکسیمی روده‌ای (Enterotoxemia / Pulpy Kidney Disease)',
                            'اسیدوز و نفخ حاد رمینال (Acute Ruminal Acidosis & Bloat)',
                            'لیستریوز و اختلالات حرکتی/نورولوژیک (Listeriosis & Incoordination)',
                            'مسمومیت سیستمیک یا هیپوکلسیمی (Systemic Toxemia / Hypocalcemia)'
                        ];
                        $aiTriage['clinicalReasoning'] = "هشدار بالینی حیاتی: نشخوارکنندگان (گوسفند، بز، گاو) به دلیل ساختار سیرابی و نگاری، توانایی استفراغ فیزیولوژیک مانند تک‌معده‌ای‌ها را ندارند. بروز علائم شبیه به حالت تهوع همراه با ضعف شدید و ناتوانی در گام برداشتن، نشانه اسیدوز حاد رمینال، انتروتوکسمی (بیماری پرخوری ناشی از توکسین کلستریدیوم) یا اختلالات نورولوژیک/متابولیک حاد نظیر لیستریوز می‌باشد.\n\nانجام آزمایش CBC هماتولوژی (کد HEM-01) جهت پایش لکوپنی و باکتریمی، پنل بیوشیمی پایه (کد BIO-01) برای بررسی آنزیم‌ها و عملکرد کلیوی، و پنل الکترولیت‌ها (کد BIO-04) جهت اصلاح اسیدوز متابولیک اکیداً الزامی است.";
                        $aiTriage['suggestedTestIds'] = ['BIO-01', 'HEM-01', 'BIO-04', 'MIC-01'];
                    }
                }

                $aiTriage['isLiveAI'] = true;
                $aiTriage['aiModel'] = 'jahesh 2';
                $suggestedIds = $aiTriage['suggestedTestIds'] ?? [];
                $fullTests = array_values(array_filter($allTests, function($t) use ($suggestedIds) {
                    return in_array($t['id'], $suggestedIds);
                }));
                if (empty($fullTests)) {
                    $defIds = ($aiTriage['detectedSpecies'] === 'اسب' || $aiTriage['detectedSpecies'] === 'دام بزرگ') ? ['HEM-01', 'BIO-01', 'BIO-04'] : ['HEM-01', 'BIO-01'];
                    $fullTests = array_values(array_filter($allTests, function($t) use ($defIds) {
                        return in_array($t['id'], $defIds);
                    }));
                }
                echo json_encode([
                    'success' => true,
                    'isLiveAI' => true,
                    'aiModel' => 'jahesh 2',
                    'triage' => $aiTriage,
                    'suggestedTests' => $fullTests
                ], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }
    }

    // Species
    $species = detectSpeciesFromTextPHP($prompt);

    $suggestedIds = [];
    $impressions = [];
    $urgency = 'اولویت متوسط';
    $reasoning = '';

    $isEquineColicOrLocomotor = ($species === 'اسب') && (
        mb_strpos($lower, 'تهوع') !== false || mb_strpos($lower, 'استفراغ') !== false || mb_strpos($lower, 'بالا آوردن') !== false ||
        mb_strpos($lower, 'کولیک') !== false || mb_strpos($lower, 'دل درد') !== false || mb_strpos($lower, 'شکم') !== false ||
        mb_strpos($lower, 'راه') !== false || mb_strpos($lower, 'لنگش') !== false || mb_strpos($lower, 'پا') !== false || mb_strpos($lower, 'دست') !== false ||
        mb_strpos($lower, 'زمین') !== false || mb_strpos($lower, 'فلج') !== false || mb_strpos($lower, 'عضله') !== false || mb_strpos($lower, 'سم') !== false ||
        mb_strpos($lower, 'تعریق') !== false || mb_strpos($lower, 'تایینگ') !== false || mb_strpos($lower, 'آتاکسی') !== false
    );

    if ($isEquineColicOrLocomotor) {
        $urgency = '🔴 اورژانسی (حیاتی - خطر کولیک حاد، ریفلاکس معده یا میوپاتی)';
        $impressions = [
            'سندرم کولیک حاد و ریفلاکس معدی (Acute Equine Colic & Gastric Reflux)',
            'میوپاتی انقباضی و رابدومیولیز ناشی از فعالیت (Exertional Rhabdomyolysis / Tying-Up)',
            'لامینایتیس حاد سم (Acute Laminitis)',
            'آتاکسی حرکتی / انسفالومیلیت هرپس ویروسی (EHM / EHV-1)'
        ];
        $suggestedIds = ['BIO-01', 'HEM-01', 'BIO-04'];
        $reasoning = "هشدار بالینی فوق‌العاده حیاتی: اسب‌ها به دلیل ساختار بسیار قوی اسفنکتر کاردیا و آناتومی مری، از نظر فیزیولوژیک توانایی استفراغ یا تهوع ندارند. هرگونه علائم شبیه به حالت تهوع یا خروج ترشحات از دهان/بینی در اسب نشانه ریفلاکس شدید بینی-معدی (Nasogastric Reflux) ناشی از کولیک انسدادی حاد روده، اتساع شدید معده یا انسداد مری (Choke) است و خطر مرگبار پارگی معده وجود دارد.\n\nهمچنین ناتوانی در گام برداشتن حاکی از درد احشایی کولیک شدید، اسپاسم حاد عضلانی ناشی از تمرین (سندرم Tying-Up / آزوتوری) یا التهاب بسیار دردناک لایه‌های حساس سم (لامینایتیس) می‌باشد.\n\nپنل بیوشیمی پایه (کد BIO-01) با پایش آنزیم عضلانی AST، کراتینین، BUN و پروتئین‌ها شدت تخریب بافتی و دهیدراسیون را معین می‌سازد. آزمایش CBC هماتولوژی (کد HEM-01) لکوگرام، فیبرینوژن و سپسیس پریتونئال را ارزیابی کرده و پنل کامل الکترولیت‌ها (کد BIO-04) جهت اصلاح عدم تعادل الکترولیتی و اسیدوز حیاتی است.\n\nاقدام فوری: حضور اورژانسی دامپزشک متخصص اسب بر بالین بیمار جهت تعبیه سوند بینی-معدی و تسکین فوری درد اکیداً الزامی است.";
    } elseif ($species === 'دام بزرگ') {
        $urgency = '🔴 اورژانسی (حیاتی - خطر انتروتوکسمی، نفخ حاد سیرابی یا مسمومیت سیستمیک)';
        $impressions = [
            'انتروتوکسمی حاد و توکسیمی روده‌ای (Enterotoxemia / Pulpy Kidney Disease)',
            'اسیدوز و نفخ حاد رمینال (Acute Ruminal Acidosis & Bloat)',
            'لیستریوز و اختلالات حرکتی/نورولوژیک (Listeriosis & Incoordination)',
            'مسمومیت سیستمیک یا هیپوکلسیمی (Systemic Toxemia / Hypocalcemia)'
        ];
        $suggestedIds = ['BIO-01', 'HEM-01', 'BIO-04', 'MIC-01'];
        $reasoning = "هشدار بالینی حیاتی: نشخوارکنندگان (گوسفند، بز، گاو) به دلیل ساختار سیرابی و نگاری، توانایی استفراغ فیزیولوژیک مانند تک‌معده‌ای‌ها را ندارند. بروز علائم شبیه به حالت تهوع همراه با ضعف شدید و ناتوانی در گام برداشتن، نشانه اسیدوز حاد رمینال، انتروتوکسمی (بیماری پرخوری ناشی از توکسین کلستریدیوم) یا اختلالات نورولوژیک/متابولیک حاد نظیر لیستریوز می‌باشد.\n\nانجام آزمایش CBC هماتولوژی (کد HEM-01) جهت پایش لکوپنی و باکتریمی، پنل بیوشیمی پایه (کد BIO-01) برای بررسی آنزیم‌ها و عملکرد کلیوی، و پنل الکترولیت‌ها (کد BIO-04) جهت اصلاح اسیدوز متابولیک اکیداً الزامی است.";
    } elseif (mb_strpos($lower, 'اسهال') !== false || mb_strpos($lower, 'استفراغ') !== false || mb_strpos($lower, 'تهوع') !== false || mb_strpos($lower, 'بالا آوردن') !== false || mb_strpos($lower, 'بی حال') !== false || mb_strpos($lower, 'ضعف') !== false) {
        $urgency = (mb_strpos($lower, 'خونی') !== false || mb_strpos($lower, 'شدید') !== false) ? '🔴 اورژانسی (حیاتی - خطر دهیدراسیون شدید)' : '🟠 اولویت بالا';
        $impressions = ($species === 'گربه') ? ['پان‌لوکوپنی گربه‌سانان (FPV)', 'گاستروانتریت حاد عفونی', 'سوءجذب روده'] : ['پاروویروس سگ‌ها (CPV)', 'گاستروانتریت حاد هموراژیک (HGE)', 'عفونت ویروسی/باکتریایی روده'];
        $suggestedIds = ($species === 'گربه') ? ['SER-04', 'MOL-03', 'HEM-01', 'BIO-01', 'BIO-04'] : ['SER-01', 'MOL-02', 'HEM-01', 'BIO-01', 'BIO-04'];
        $reasoning = "بر اساس تظاهرات حاد بالینی گوارشی در بیمار ({$species}) شامل حالت تهوع و بی‌حالی، مهم‌ترین فرضیه تشخیصی تخریب پرزهای روده ناشی از آنتروپاتوژن‌های حاد (به ویژه ویروس‌های پان‌لوکوپنی/پاروویروس در صورت نقص ایمنی) است.\n\nتست سرولوژی سریع و مولکولی Real-Time PCR جهت تایید یا رد قطعی پاتوژن ویروسی الزامی است. انجام آزمایش شمارش کامل سلول‌های خونی CBC (کد HEM-01) برای پایش لکوپنی و گلبول‌های سفید حیاتی است.\n\nهمچنین پنل بیوشیمی پایه (کد BIO-01) و الکترولیت‌ها (کد BIO-04) وضعیت دهیدراسیون و عملکرد کلیه را بررسی کرده و خط‌مشی دقیق درمان را تعیین می‌نماید.\n\nتوصیه نمونه‌گیری: لوله بنفش حاوی EDTA جهت CBC و لوله بیوشیمی ژل‌دار جهت سرم؛ نمونه مدفوع تازه در ظرف استریل.";
    } elseif (mb_strpos($lower, 'ادرار') !== false || mb_strpos($lower, 'زور زدن') !== false || mb_strpos($lower, 'سوزش') !== false || mb_strpos($lower, 'کلیه') !== false) {
        $urgency = '🟠 اولویت بالا (خطر سندرم اورمی و نارسایی کلیه)';
        $impressions = ($species === 'گربه') ? ['سندرم مجاری ادراری تحتانی گربه (FLUTD)', 'کریستالوری و سنگ‌های ادراری', 'سیستیت باکتریایی'] : ['عفونت دستگاه ادراری (UTI)', 'سنگ‌های مثانه/کلیه', 'نارسایی کلیوی'];
        $suggestedIds = ['BIO-01', 'HEM-01', 'MIC-01'];
        $reasoning = "علائم دیس‌اوری (زور زدن هنگام ادرار) و هماچوری موید التهاب شدید مجاری ادراری یا آسیب پارانشیم کلیه است.\n\nپنل بیوشیمی (کد BIO-01) با سنجش مقادیر BUN، کراتینین، کلسیم و فسفر، وجود یا عدم وجود نارسایی کلیوی را پایش می‌کند.\n\nکشت باکتریایی و آنتی‌بیوگرام (کد MIC-01) از نمونه ادرار موجب جداسازی پاتوژن و انتخاب دقیق‌ترین آنتی‌بیوتیک خواهد شد.";
    } elseif (mb_strpos($lower, 'پوست') !== false || mb_strpos($lower, 'خارش') !== false || mb_strpos($lower, 'ریزش') !== false || mb_strpos($lower, 'کچلی') !== false) {
        $urgency = '🟢 اولویت متوسط (ضایعات درماتولوژیک مزمن)';
        $impressions = ['درماتوفیتوز قارچی (Ringworm)', 'جرب‌های جلدی (دمودکس یا سارکوپت)', 'پیودرما و درماتیت آلرژیک ثانویه'];
        $suggestedIds = ['MIC-01', 'HEM-01'];
        $reasoning = "ضایعات جلدی همراه با خارش و ریزش مو در اثر تلفیق عوامل عفونی (باکتریایی، قارچی، انگلی) و واکنش‌های آلرژیک ایجاد می‌گردند.\n\nکشت اختصاصی قارچ‌شناسی و اسمیر میکروسکوپی (کد MIC-01) تفکیک قطعی آلودگی‌های قارچی را میسر می‌سازد. آزمایش CBC (کد HEM-01) وجود زمینه آلرژیک یا عفونت سیستمیک را مشخص می‌کند.";
    } elseif (mb_strpos($lower, 'بیهوشی') !== false || mb_strpos($lower, 'جراحی') !== false || mb_strpos($lower, 'عقیم') !== false || mb_strpos($lower, 'چکاپ') !== false) {
        $urgency = '🟢 اولویت عادی (پروتکل غربالگری سلامت قبل بیهوشی)';
        $impressions = ['ارزیابی جامع عملکرد کبد و کلیه قبل از جراحی', 'پایش هموستاز، پلاکت‌ها و فاکتورهای انعقادی'];
        $suggestedIds = ['HEM-01', 'BIO-01', 'HEM-02'];
        $reasoning = "ارزیابی پاراکلینیکی پیش از اعمال جراحی و بیهوشی عمومی ضامن حفظ ایمنی بیمار و پیشگیری از عوارض بیهوشی است.\n\nپنل بیوشیمی پایه (کد BIO-01) توانمندی کبد در متابولیسم داروها و کلیه در دفع را بررسی می‌کند. تست‌های انعقادی PT/PTT (کد HEM-02) در کنار CBC کامل (کد HEM-01) خطر هرگونه خونریزی حین جراحی را مهار می‌سازند.";
    } else {
        $urgency = 'اولویت متوسط';
        $impressions = ['بررسی اولیه وضعیت سلامت عمومی و غربالگری پاراکلینیکی', 'عفونت یا التهاب سیستمیک خفیف'];
        $suggestedIds = ['HEM-01', 'BIO-01'];
        $reasoning = "با توجه به علائم گزارش‌شده در بیمار ({$species})، ارزیابی پایه هماتولوژی و بیوشیمی خون اولین و استانداردترین گام تشخیصی در دامپزشکی نوین است.\n\nآزمایش CBC هماتولوژی (کد HEM-01) وضعیت سلول‌های خونی و عفونت را ارزیابی می‌کند و بیوشیمی پایه (کد BIO-01) سلامت اندام‌های حیاتی کبد، کلیه و قند خون را پایش می‌نماید.";
    }

    $suggestedTests = array_values(array_filter($allTests, function($t) use ($suggestedIds) {
        return in_array($t['id'], $suggestedIds);
    }));

    echo json_encode([
        'success' => true,
        'triage' => [
            'detectedSpecies' => $species,
            'breed' => 'میکس / بومی',
            'age' => 'نامشخص',
            'urgencyLevel' => $urgency,
            'clinicalImpressions' => $impressions,
            'clinicalReasoning' => $reasoning,
            'reasoning' => $reasoning,
            'suggestedTestIds' => $suggestedIds,
            'suggestedTests' => $suggestedTests
        ],
        'suggestedTests' => $suggestedTests
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// 6. Create Admission Order
if ($route === 'admissions/create' || $route === 'api/admissions/create') {
    $orders = readDataJSON('orders.json', []);
    $trackingCode = 'BASA-' . rand(10000, 99999);
    $order = [
        'id' => count($orders) + 1,
        'trackingCode' => $trackingCode,
        'token' => $trackingCode,
        'clientName' => $input['client_name'] ?? 'مشتری',
        'clientPhone' => $input['client_phone'] ?? '',
        'patientName' => $input['patient_name'] ?? 'بیمار',
        'animalType' => $input['animal_type'] ?? 'نامشخص',
        'testIds' => $input['test_ids'] ?? [],
        'totalPrice' => $input['total_price'] ?? 0,
        'status' => 'registered',
        'createdAt' => date('Y-m-d H:i:s')
    ];
    $orders[] = $order;
    writeDataJSON('orders.json', $orders);

    echo json_encode([
        'success' => true,
        'order' => $order,
        'trackingCode' => $trackingCode
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// 7. Payment request
if ($route === 'payment/request' || $route === 'api/payment/request') {
    $orderToken = $input['orderToken'] ?? ('BASA-' . rand(10000, 99999));
    echo json_encode([
        'success' => true,
        'paymentUrl' => 'https://gateway.zibal.ir/start/' . rand(100000, 999999),
        'trackId' => rand(100000, 999999)
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// 8. Admin APIs
if ($route === 'admin/stats' || $route === 'api/admin/stats') {
    $orders = readDataJSON('orders.json', []);
    $users = readDataJSON('users.json', []);
    $tests = readDataJSON('tests.json', []);
    $payments = readDataJSON('payments.json', []);

    $totalRevenue = 0;
    $paidCount = 0;
    foreach ($orders as $o) {
        if (($o['status'] ?? '') === 'paid') {
            $totalRevenue += intval($o['totalPrice'] ?? $o['amount'] ?? 0);
            $paidCount++;
        }
    }

    echo json_encode([
        'success' => true,
        'stats' => [
            'totalRevenue' => $totalRevenue,
            'totalOrders' => count($orders),
            'paidCount' => $paidCount,
            'totalUsers' => count($users),
            'totalTests' => count($tests),
            'totalPayments' => count($payments)
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($route === 'admin/orders' || $route === 'api/admin/orders') {
    $orders = readDataJSON('orders.json', []);
    echo json_encode(['success' => true, 'orders' => $orders], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($route === 'admin/users' || $route === 'api/admin/users') {
    $users = readDataJSON('users.json', []);
    $safeUsers = array_map(function($u) {
        unset($u['password']);
        return $u;
    }, $users);
    echo json_encode(['success' => true, 'users' => $safeUsers], JSON_UNESCAPED_UNICODE);
    exit();
}

if ($route === 'admin/payments' || $route === 'api/admin/payments') {
    $payments = readDataJSON('payments.json', []);
    echo json_encode(['success' => true, 'payments' => $payments], JSON_UNESCAPED_UNICODE);
    exit();
}

// 9. Live Customer Support AI Chat API
if ($route === 'support/chat' || $route === 'api/support/chat') {
    $userPrompt = trim($input['prompt'] ?? $input['message'] ?? '');
    if (empty($userPrompt)) {
        echo json_encode(['success' => false, 'error' => 'لطفاً متن سوال خود را بنویسید.'], JSON_UNESCAPED_UNICODE);
        exit();
    }

    $cfAccountId = getenv('CLOUDFLARE_ACCOUNT_ID') ?: 'e8950358d5cf09f0f511b46172f65791';
    $cfToken = getenv('CLOUDFLARE_AI_TOKEN') ?: 'cfut_z41Q6SlFy5iNKPrYiB03QxiEafusIRjgtFS91Dsn10e86511';
    $cfModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

    if (file_exists(__DIR__ . '/App/includes/config.php')) {
        @include_once __DIR__ . '/App/includes/config.php';
        if (defined('CLOUDFLARE_ACCOUNT_ID') && CLOUDFLARE_ACCOUNT_ID) $cfAccountId = CLOUDFLARE_ACCOUNT_ID;
        if (defined('CLOUDFLARE_AI_TOKEN') && CLOUDFLARE_AI_TOKEN) $cfToken = CLOUDFLARE_AI_TOKEN;
    }

    $supportSystemPrompt = "شما دستیار هوشمند و رسمی پشتیبانی «آزمایشگاه تخصصی دامپزشکی باسا» هستید.\n" .
        "اطلاعات کلیدی آزمایشگاه باسا جهت راهنمایی دقیق مراجعه‌کنندگان:\n" .
        "• آدرس: مشهد، بلوار اندیشه، اندیشه ۹، پلاک ۵۴ | تلفن: ۰۹۱۵۵۱۹۳۶۷۸ | مسئول فنی: دکتر علی مشاوری نیا\n" .
        "• ساعات پذیرش: همه‌روزه از ساعت ۸:۰۰ صبح الی ۲۰:۰۰ شب (پذیرش آنلاین ۲۴ ساعته فعال است)\n" .
        "• تعرفه‌ها: CBC کامل ۲۴۳ هزار تومان (تحویل ۳ ساعته)، بیوشیمی پایه ۴۸۶ هزار تومان، تست مولکولی PCR ۹۴۵ هزار تومان (۲۴ ساعته)، کشت میکروبی و آنتی‌بیوگرام ۳۷۸ هزار تومان.\n" .
        "• ارسال نمونه از شهرستان: از طریق تیپاکس یا تاکسی/اتوبوس همراه با آیس‌پک/یخ خشک به آدرس آزمایشگاه.\n" .
        "پاسخ خود را بسیار مودبانه، روان، صمیمی، کوتاه و با فرمت مارک‌داون شیوا ارائه دهید.";

    if (!empty($cfAccountId) && !empty($cfToken) && function_exists('curl_init')) {
        $cfUrl = "https://api.cloudflare.com/client/v4/accounts/{$cfAccountId}/ai/run/{$cfModel}";
        $cfPayload = [
            'messages' => [
                ['role' => 'system', 'content' => $supportSystemPrompt],
                ['role' => 'user', 'content' => $userPrompt]
            ],
            'temperature' => 0.3,
            'max_tokens' => 800
        ];

        $ch = curl_init($cfUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $cfToken,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cfPayload));
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $cfRaw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $cfRaw) {
            $parsedCf = json_decode($cfRaw, true);
            $replyText = $parsedCf['result']['response'] ?? ($parsedCf['result']['choices'][0]['message']['content'] ?? '');
            if (!empty($replyText)) {
                echo json_encode(['success' => true, 'reply' => trim($replyText), 'aiModel' => 'jahesh 2'], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }
    }

    // Local fallback
    echo json_encode([
        'success' => true,
        'reply' => "ممنون از تماس شما با پشتیبانی آزمایشگاه باسا. 🙏\n\nبرای پذیرش نمونه، اطلاع از تعرفه‌ها یا مشاوره تخصصی، می‌توانید از بخش **«پذیرش نمونه»** اقدام کنید یا دکمه **«صحبت با کارشناس»** را جهت ثبت مستقیم پیام فشار دهید."
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// 10. Human Support Ticket Creation & Multi-Message Thread API
if ($route === 'support/ticket' || $route === 'api/support/ticket') {
    $tickets = readDataJSON('tickets.json', []);
    $reqTicketId = trim($input['ticketId'] ?? '');
    $messageText = trim($input['message'] ?? '');
    $customerName = trim($input['customerName'] ?? 'مراجع وب‌سایت');
    $mobile = trim($input['mobile'] ?? 'ثبت‌نشده');
    $msgId = trim($input['msgId'] ?? ('msg-' . time() . '-' . rand(100, 999)));
    $replyTo = $input['replyTo'] ?? null;
    $msgTime = trim($input['time'] ?? date('H:i'));
    $nowStr = date('Y-m-d H:i:s');

    if (!empty($reqTicketId)) {
        foreach ($tickets as &$t) {
            if (($t['id'] ?? '') === $reqTicketId || ($t['ticketId'] ?? '') === $reqTicketId || (string)($t['id'] ?? '') === (string)$reqTicketId) {
                if (!isset($t['messages']) || !is_array($t['messages'])) {
                    $t['messages'] = [];
                    if (!empty($t['message'])) {
                        $t['messages'][] = [
                            'id' => 'msg-init-' . $t['id'],
                            'sender' => 'user',
                            'text' => $t['message'],
                            'time' => substr($t['createdAt'] ?? $nowStr, 11, 5),
                            'reactions' => []
                        ];
                    }
                    if (!empty($t['reply'])) {
                        $t['messages'][] = [
                            'id' => 'msg-rep-' . $t['id'],
                            'sender' => 'admin',
                            'senderName' => 'دکتر مشاوری‌نیا (کارشناس باسا)',
                            'text' => $t['reply'],
                            'time' => substr($t['repliedAt'] ?? $nowStr, 11, 5),
                            'reactions' => []
                        ];
                    }
                }
                if (!empty($messageText)) {
                    $t['messages'][] = [
                        'id' => $msgId,
                        'sender' => 'user',
                        'text' => $messageText,
                        'time' => $msgTime,
                        'replyTo' => $replyTo,
                        'reactions' => []
                    ];
                    $t['message'] = $messageText;
                }
                if (!empty($customerName) && $customerName !== 'مراجع وب‌سایت') $t['customerName'] = $customerName;
                if (!empty($mobile) && $mobile !== 'ثبت‌نشده') $t['mobile'] = $mobile;
                if (!empty($input['history']) && is_array($input['history'])) $t['history'] = $input['history'];
                $t['status'] = 'pending';
                $t['updatedAt'] = $nowStr;
                $updatedTicket = $t;
                unset($t);
                writeDataJSON('tickets.json', $tickets);
                echo json_encode(['success' => true, 'message' => 'پیام شما به گفتگوی فعال اضافه شد.', 'ticket' => $updatedTicket], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }
        unset($t);
    }

    $ticketId = 'TCK-' . rand(10000, 99999);
    $initialMessages = [];
    if (!empty($messageText)) {
        $initialMessages[] = [
            'id' => $msgId,
            'sender' => 'user',
            'text' => $messageText,
            'time' => $msgTime,
            'replyTo' => $replyTo,
            'reactions' => []
        ];
    }
    $newTicket = [
        'id' => $ticketId,
        'customerName' => $customerName ?: 'مراجع وب‌سایت',
        'mobile' => $mobile ?: 'ثبت‌نشده',
        'message' => $messageText,
        'history' => $input['history'] ?? [],
        'messages' => $initialMessages,
        'status' => 'pending',
        'reply' => '',
        'createdAt' => $nowStr,
        'updatedAt' => $nowStr
    ];
    array_unshift($tickets, $newTicket);
    writeDataJSON('tickets.json', $tickets);

    echo json_encode(['success' => true, 'message' => 'پیام شما به کارشناسان ثبت شد.', 'ticket' => $newTicket], JSON_UNESCAPED_UNICODE);
    exit();
}

// 10.5 Support Ticket Status API
if ($route === 'support/ticket-status' || $route === 'api/support/ticket-status') {
    $ticketId = trim($_GET['ticketId'] ?? $input['ticketId'] ?? '');
    $tickets = readDataJSON('tickets.json', []);
    $found = null;
    foreach ($tickets as $t) {
        if (($t['id'] ?? '') === $ticketId || ($t['ticketId'] ?? '') === $ticketId || (string)($t['id'] ?? '') === (string)$ticketId) {
            $found = $t;
            break;
        }
    }
    echo json_encode(['success' => true, 'ticket' => $found], JSON_UNESCAPED_UNICODE);
    exit();
}

// 11. Admin Get Tickets
if ($route === 'admin/tickets' || $route === 'api/admin/tickets') {
    $tickets = readDataJSON('tickets.json', []);
    echo json_encode(['success' => true, 'tickets' => $tickets], JSON_UNESCAPED_UNICODE);
    exit();
}

// 12. Admin Reply Ticket
if ($route === 'admin/tickets/reply' || $route === 'api/admin/tickets/reply') {
    $ticketId = trim($input['ticketId'] ?? '');
    $reply = trim($input['reply'] ?? '');
    $replyTo = $input['replyTo'] ?? null;
    $msgId = trim($input['msgId'] ?? ('msg-adm-' . time() . '-' . rand(100, 999)));
    $msgTime = trim($input['time'] ?? date('H:i'));
    $nowStr = date('Y-m-d H:i:s');

    if (empty($reply)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'متن پاسخ نمی‌تواند خالی باشد.'], JSON_UNESCAPED_UNICODE);
        exit();
    }

    $tickets = readDataJSON('tickets.json', []);
    $updatedTicket = null;
    $adminMsg = null;
    foreach ($tickets as &$t) {
        if (($t['id'] ?? '') === $ticketId || ($t['ticketId'] ?? '') === $ticketId || (string)($t['id'] ?? '') === (string)$ticketId) {
            if (!isset($t['messages']) || !is_array($t['messages'])) {
                $t['messages'] = [];
                if (!empty($t['message'])) {
                    $t['messages'][] = [
                        'id' => 'msg-init-' . $t['id'],
                        'sender' => 'user',
                        'text' => $t['message'],
                        'time' => substr($t['createdAt'] ?? $nowStr, 11, 5),
                        'reactions' => []
                    ];
                }
            }
            $adminMsg = [
                'id' => $msgId,
                'sender' => 'admin',
                'senderName' => 'دکتر مشاوری‌نیا (کارشناس باسا)',
                'text' => $reply,
                'time' => $msgTime,
                'replyTo' => $replyTo,
                'reactions' => []
            ];
            $t['messages'][] = $adminMsg;
            $t['reply'] = $reply;
            $t['status'] = 'answered';
            $t['repliedAt'] = $nowStr;
            $t['updatedAt'] = $nowStr;
            $updatedTicket = $t;
            break;
        }
    }
    unset($t);
    writeDataJSON('tickets.json', $tickets);
    echo json_encode(['success' => true, 'message' => 'پاسخ با موفقیت ثبت و برای کاربر ارسال شد.', 'ticket' => $updatedTicket, 'newMsg' => $adminMsg], JSON_UNESCAPED_UNICODE);
    exit();
}

// 13. Support Message Reaction API
if ($route === 'support/react' || $route === 'api/support/react') {
    $ticketId = trim($input['ticketId'] ?? '');
    $msgId = trim($input['msgId'] ?? '');
    $emoji = trim($input['emoji'] ?? '');
    $tickets = readDataJSON('tickets.json', []);
    $updatedTicket = null;
    foreach ($tickets as &$t) {
        if (($t['id'] ?? '') === $ticketId || ($t['ticketId'] ?? '') === $ticketId || (string)($t['id'] ?? '') === (string)$ticketId) {
            if (isset($t['messages']) && is_array($t['messages'])) {
                foreach ($t['messages'] as &$m) {
                    if ((string)($m['id'] ?? '') === (string)$msgId) {
                        if (!isset($m['reactions']) || !is_array($m['reactions'])) $m['reactions'] = [];
                        $m['reactions'][$emoji] = intval($m['reactions'][$emoji] ?? 0) + 1;
                        break;
                    }
                }
                unset($m);
            }
            $updatedTicket = $t;
            break;
        }
    }
    unset($t);
    writeDataJSON('tickets.json', $tickets);
    echo json_encode(['success' => true, 'ticket' => $updatedTicket], JSON_UNESCAPED_UNICODE);
    exit();
}

// Fallback response
echo json_encode(['success' => true, 'status' => 'basa_api_ready', 'route' => $route], JSON_UNESCAPED_UNICODE);

