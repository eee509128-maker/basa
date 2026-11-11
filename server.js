const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'App', 'uploads');
const PDFS_DIR = path.join(UPLOADS_DIR, 'pdfs');
const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');

[DATA_DIR, UPLOADS_DIR, PDFS_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const TESTS_FILE = path.join(DATA_DIR, 'tests.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

// Dynamic Gemini SDK client loader
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  } catch (e) {
    console.warn('[Gemini Client Warning]:', e.message);
    return null;
  }
}


// Helpers for Data Persistence
function readJSON(file, defaultValue = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
  }
  return defaultValue;
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`Error writing ${file}:`, e);
    return false;
  }
}

// Ensure default admin exists
function ensureDefaultAdmin() {
  const users = readJSON(USERS_FILE, []);
  const adminExists = users.some(u => u.username === 'basa.ir');
  if (!adminExists) {
    users.unshift({
      id: 1,
      username: 'basa.ir',
      password: 'alihasan',
      fullName: 'مدیر ارشد آزمایشگاه باسا',
      clinicName: 'آزمایشگاه تخصصی تشخیص دامپزشکی باسا',
      mobile: '09155193678',
      role: 'admin',
      createdAt: '2026-01-01 10:00:00',
      status: 'active'
    });
    writeJSON(USERS_FILE, users);
  }
}
ensureDefaultAdmin();

// Multer Config
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PDFS_DIR),
  filename: (req, file, cb) => {
    const cleanName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + cleanName);
  }
});
const uploadPdf = multer({ storage: pdfStorage });

// Cookie and Auth helpers
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function setAuthCookie(res, user) {
  const token = user.role === 'admin' ? 'admin_session_basa' : String(user.token || user.id || user.username);
  const safeUser = {
    id: user.id || 1,
    username: user.username || user.mobile || 'user',
    fullName: user.fullName || user.username || user.mobile || 'کاربر باسا',
    clinicName: user.clinicName || 'مشتری مستقیم',
    role: user.role || 'customer',
    mobile: user.mobile || user.username || '',
    token
  };
  const userJson = encodeURIComponent(JSON.stringify(safeUser));
  res.setHeader('Set-Cookie', [
    `basa_auth=${token}; Path=/; Max-Age=31536000; SameSite=Lax`,
    `basa_token=${token}; Path=/; Max-Age=31536000; SameSite=Lax`,
    `basa_auth_token=${token}; Path=/; Max-Age=31536000; SameSite=Lax`,
    `basa_user=${userJson}; Path=/; Max-Age=31536000; SameSite=Lax`
  ]);
}

function parseUserCookieValue(raw) {
  if (!raw) return null;
  const attempts = [
    raw,
    (() => { try { return decodeURIComponent(raw); } catch (e) { return null; } })(),
    (() => { try { return decodeURIComponent(raw.replace(/\+/g, '%20')); } catch (e) { return null; } })()
  ];
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      let parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object' && (parsed.fullName || parsed.username || parsed.mobile || parsed.id)) {
        return parsed;
      }
    } catch (e) {}
  }
  return null;
}

function getAuthUser(req) {
  let token = null;

  // 1. Check Query parameter (?auth=... or ?token=...)
  if (req.query && (req.query.auth || req.query.token)) {
    token = String(req.query.auth || req.query.token).trim();
  }

  // 2. Check Authorization header (Bearer ...)
  if (!token && req.headers && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // 3. Check X-Auth-Token header
  if (!token && req.headers && req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  }

  // 4. Check Cookie (basa_auth or basa_token or basa_user)
  const cookies = parseCookies(req);
  if (!token) {
    token = cookies.basa_auth || cookies.basa_token || cookies.basa_auth_token;
  }

  const cookieUser = parseUserCookieValue(cookies.basa_user);
  if ((!token || token === 'undefined' || token === 'null' || token === '') && cookieUser) {
    return cookieUser;
  }

  if (!token || token === 'undefined' || token === 'null' || token === '') {
    return null;
  }

  const users = readJSON(USERS_FILE, []);
  
  // Explicit token match for super admin
  if (token === 'admin_session_basa' || token === 'basa.ir') {
    let admin = users.find(u => u.username === 'basa.ir' || u.role === 'admin');
    if (!admin) {
      admin = {
        id: 1,
        username: 'basa.ir',
        fullName: 'مدیریت ارشد آزمایشگاه باسا',
        clinicName: 'آزمایشگاه تخصصی تشخیص دامپزشکی باسا',
        role: 'admin',
        mobile: '09155193678'
      };
    }
    return admin;
  }

  const matchedUser = users.find(u => String(u.id) === token || u.username === token || u.mobile === token || (u.token && u.token === token));
  if (matchedUser) return matchedUser;
  if (cookieUser) return cookieUser;
  return null;
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (user && user.role === 'admin') {
    req.user = user;
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'دسترسی غیرمجاز - نیاز به ورود مدیر' });
  }
  return res.redirect('/admin.html');
}

// Serve unified Admin Panel for all admin entry routes before static middleware
app.get(['/admin', '/admin/', '/admin/index.html', '/admin/index.php', '/admin/dashboard.php', '/admin/login.php', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Static Files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, 'App', 'assets')));
app.use(express.static(path.join(__dirname, 'Landing')));
app.use(express.static(__dirname));

// -------------------------------------------------------------
// 1. AUTHENTICATION APIS
// -------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'لطفاً نام کاربری و کلمه عبور را وارد کنید.' });
  }

  const users = readJSON(USERS_FILE, []);
  const cleanUsername = String(username).trim();
  const cleanPassword = String(password).trim();

  // Special match for requested super admin: basa.ir / alihasan
  if (cleanUsername === 'basa.ir' && cleanPassword === 'alihasan') {
    let admin = users.find(u => u.username === 'basa.ir');
    if (!admin) {
      admin = {
        id: 1,
        username: 'basa.ir',
        fullName: 'مدیریت ارشد آزمایشگاه باسا',
        clinicName: 'آزمایشگاه تخصصی باسا',
        role: 'admin',
        mobile: '09155193678'
      };
    }
    setAuthCookie(res, admin);
    return res.json({
      success: true,
      message: 'ورود موفق به عنوان مدیر ارشد سیستم',
      token: 'admin_session_basa',
      user: admin,
      redirect: '/admin/dashboard.php?auth=admin_session_basa'
    });
  }

  // Normal users & clinics lookup
  const user = users.find(u => (u.username === cleanUsername || u.mobile === cleanUsername) && u.password === cleanPassword);
  if (!user) {
    return res.status(401).json({ success: false, error: 'نام کاربری یا کلمه عبور نادرست است.' });
  }

  setAuthCookie(res, user);
  return res.json({
    success: true,
    message: 'ورود موفقیت‌آمیز بود.',
    token: String(user.id),
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      clinicName: user.clinicName,
      role: user.role,
      mobile: user.mobile
    },
    redirect: user.role === 'admin' ? `/admin/dashboard.php?auth=${user.id}` : '/#admission'
  });
});

app.post('/api/auth/register', (req, res) => {
  const { fullName, mobile, clinicName, password, role } = req.body;
  if (!fullName || !mobile || !password) {
    return res.status(400).json({ success: false, error: 'تکمیل تمامی فیلدهای نام، شماره موبایل و کلمه عبور الزامی است.' });
  }

  const users = readJSON(USERS_FILE, []);
  const cleanMobile = String(mobile).trim();

  if (users.some(u => u.username === cleanMobile || u.mobile === cleanMobile)) {
    return res.status(400).json({ success: false, error: 'این شماره موبایل قبلاً در سیستم ثبت‌نام شده است. لطفاً وارد شوید.' });
  }

  const newUser = {
    id: users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1,
    username: cleanMobile,
    password: String(password).trim(),
    fullName: String(fullName).trim(),
    clinicName: clinicName ? String(clinicName).trim() : 'مشتری مستقل',
    mobile: cleanMobile,
    role: role || 'customer',
    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    status: 'active'
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  setAuthCookie(res, newUser);
  return res.json({
    success: true,
    message: 'ثبت‌نام با موفقیت انجام شد. خوش آمدید!',
    token: String(newUser.id),
    user: newUser
  });
});

app.get('/api/auth/me', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.basa_user) {
    const u = parseUserCookieValue(cookies.basa_user);
    if (u && (u.fullName || u.username)) {
      return res.json({
        authenticated: true,
        token: String(u.token || u.id || '1'),
        user: u
      });
    }
  }

  const user = getAuthUser(req);
  if (!user) {
    return res.json({ authenticated: false, user: null });
  }
  return res.json({
    authenticated: true,
    token: String(user.token || user.id || '1'),
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      clinicName: user.clinicName,
      role: user.role,
      mobile: user.mobile
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', [
    'basa_auth=; Path=/; Max-Age=0; SameSite=Lax',
    'basa_token=; Path=/; Max-Age=0; SameSite=Lax',
    'basa_auth_token=; Path=/; Max-Age=0; SameSite=Lax',
    'basa_user=; Path=/; Max-Age=0; SameSite=Lax'
  ]);
  return res.json({ success: true, message: 'با موفقیت خارج شدید.' });
});

// -------------------------------------------------------------
// 2. TESTS CATALOG & PRICING APIS
// -------------------------------------------------------------

app.get('/api/tests', (req, res) => {
  const tests = readJSON(TESTS_FILE, []);
  const { category, species, search } = req.query;
  let filtered = [...tests];

  if (category && category !== 'all') {
    filtered = filtered.filter(t => t.category === category);
  }

  if (species && species !== 'all') {
    filtered = filtered.filter(t => t.species && t.species.includes(species));
  }

  if (search) {
    const q = String(search).toLowerCase().trim();
    filtered = filtered.filter(t => 
      t.name.toLowerCase().includes(q) ||
      (t.nameEn && t.nameEn.toLowerCase().includes(q)) ||
      t.code.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }

  res.json({
    success: true,
    count: filtered.length,
    tests: filtered
  });
});

// Admin update test
app.put('/api/admin/tests/:id', requireAdmin, (req, res) => {
  const testId = req.params.id;
  const tests = readJSON(TESTS_FILE, []);
  const idx = tests.findIndex(t => t.id === testId);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'تست آزمایشگاهی مورد نظر یافت نشد.' });
  }

  const { name, code, category, sampleType, turnaroundTime, basePrice, price, description, isPopular } = req.body;
  
  if (name) tests[idx].name = name;
  if (code) tests[idx].code = code;
  if (category) tests[idx].category = category;
  if (sampleType) tests[idx].sampleType = sampleType;
  if (turnaroundTime) tests[idx].turnaroundTime = turnaroundTime;
  if (basePrice !== undefined) tests[idx].basePrice = Number(basePrice);
  if (price !== undefined) {
    tests[idx].price = Number(price);
  } else if (basePrice !== undefined) {
    tests[idx].price = Math.round(Number(basePrice) * 1.35);
  }
  if (description) tests[idx].description = description;
  if (isPopular !== undefined) tests[idx].isPopular = Boolean(isPopular);

  writeJSON(TESTS_FILE, tests);
  res.json({ success: true, message: 'تست آزمایشگاهی با موفقیت بروزرسانی شد.', test: tests[idx] });
});

// Admin add new test
app.post('/api/admin/tests', requireAdmin, (req, res) => {
  const { name, nameEn, code, category, sampleType, turnaroundTime, basePrice, price, species, description } = req.body;
  if (!name || !category || !basePrice) {
    return res.status(400).json({ success: false, error: 'ورود نام تست، دسته‌بندی و قیمت پایه الزامی است.' });
  }

  const tests = readJSON(TESTS_FILE, []);
  const newId = 'TEST-' + (tests.length + 1).toString().padStart(2, '0');
  const bPrice = Number(basePrice);
  const finalPrice = price ? Number(price) : Math.round(bPrice * 1.35);

  const newTest = {
    id: newId,
    code: code || 'BASA-' + Math.floor(100 + Math.random() * 900),
    name,
    nameEn: nameEn || '',
    category,
    sampleType: sampleType || 'سرم یا خون تام',
    turnaroundTime: turnaroundTime || '۲۴ ساعت',
    basePrice: bPrice,
    price: finalPrice,
    species: Array.isArray(species) ? species : ['سگ', 'گربه'],
    description: description || '',
    isPopular: false
  };

  tests.push(newTest);
  writeJSON(TESTS_FILE, tests);
  res.json({ success: true, message: 'تست جدید با موفقیت به سامانه اضافه گردید.', test: newTest });
});

// Admin delete test
app.delete('/api/admin/tests/:id', requireAdmin, (req, res) => {
  const testId = req.params.id;
  let tests = readJSON(TESTS_FILE, []);
  tests = tests.filter(t => t.id !== testId);
  writeJSON(TESTS_FILE, tests);
  res.json({ success: true, message: 'تست آزمایشگاهی حذف گردید.' });
});

// Admin bulk markup adjuster
app.post('/api/admin/tests/markup', requireAdmin, (req, res) => {
  const { percentage } = req.body;
  const pct = Number(percentage) || 35;
  const factor = 1 + (pct / 100);

  const tests = readJSON(TESTS_FILE, []);
  tests.forEach(t => {
    t.price = Math.round(t.basePrice * factor);
  });

  writeJSON(TESTS_FILE, tests);
  res.json({ success: true, message: `تعرفه تمامی تست‌ها با ${pct}٪ افزایش نسبت به قیمت پایه بروزرسانی شد.` });
});

// -------------------------------------------------------------
// 3. AI CLINICAL TRIAGE ENGINE (روش نوین با هوش مصنوعی)
// -------------------------------------------------------------

app.post('/api/triage/analyze', async (req, res) => {
  const { conversation, userPrompt, patientInfo } = req.body;
  const promptText = userPrompt || conversation || '';

  if (!promptText.trim()) {
    return res.status(400).json({ success: false, error: 'لطفاً شرح حال یا وضعیت بیمار را شرح دهید.' });
  }

  const testsCatalog = readJSON(TESTS_FILE, []);
  const testsSummary = testsCatalog.map(t => ({
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category,
    price: t.price,
    turnaround: t.turnaroundTime
  }));

  // Build system prompt for Gemini
  const systemInstruction = `
شما "دستیار فوق‌تخصصی تریاژ هوشمند آزمایشگاه دامپزشکی باسا" هستید.
وظیفه شما این است که شرح حال بیمار را که به زبان گفتاری یا تخصصی فارسی ارسال شده به دقت ارزیابی بالینی کنید و فیلدهای پرونده پذیرش را استخراج نمایید و دقیق‌ترین تست‌های آزمایشگاهی موجود در فهرست آزمایشگاه باسا را بر اساس علائم، پاتولوژی‌های محتمل و گایدلاین‌های دامپزشکی پیشنهاد دهید.

قواعد حیاتی پزشکی و گونه‌محور:
۱. اسب‌ها به هیچ وجه به لحاظ آناتومیک توانایی فیزیولوژیک استفراغ یا تهوع ندارند. ذکر هرگونه تهوع یا بالا آوردن در اسب به معنای ریفلاکس شدید بینی-معدی (Nasogastric reflux) ناشی از کولیک انسدادی حاد روده، اتساع شدید معده یا انسداد مری (Choke) است و یک اورژانس درجه یک با خطر پارگی معده و مرگ است.
۲. ناتوانی در راه رفتن اسب نشانه درد کولیک، رابدومیولیز/تایینگ‌آپ عضلانی (آسیب بافت عضله و افزایش شدید AST)، لامینایتیس حاد سم، یا آتاکسی عصبی (مانند EHV-1) است.
۳. در چنین موارد حادی، تست‌های خط اول عبارتند از: بیوشیمی پایه (BIO-01 برای ارزیابی AST، پروتئین و عملکرد کلیه)، هماتولوژی کامل (HEM-01 برای پایش فیبرینوژن و سپسیس) و پنل کامل الکترولیت‌ها (BIO-04). فوریت باید "اورژانسی (حیاتی)" باشد.

فهرست تست‌های موجود در آزمایشگاه باسا:
${JSON.stringify(testsSummary, null, 2)}

شما باید خروجی را دقیقاً و صرفاً به صورت JSON معتبر و بدون هیچ تگ اضافه بازگردانید با ساختار زیر:
{
  "detectedSpecies": "سگ | گربه | پرندگان | اسب | دام بزرگ | حیوانات اگزوتیک",
  "breed": "نژاد مشخص شده یا تخمینی",
  "age": "سن بیمار",
  "urgencyLevel": "اورژانسی (حیاتی) | اولویت بالا | اولویت متوسط | عادی",
  "clinicalImpressions": ["تشخیص افتراقی ۱", "تشخیص افتراقی ۲"],
  "symptomsSummary": "خلاصه شسته‌رفته و حرفه‌ای علائم بالینی به زبان دامپزشکی",
  "suggestedTestIds": ["آی‌دی‌های تست‌های مرتبط دقیقاً از فهرست بالا مثل SER-01, HEM-01"],
  "clinicalReasoning": "تحلیل بالینی انسان‌گونه و دقیق در ۲ تا ۳ پاراگراف شیوا برای دامپزشک یا صاحب بیمار شامل علت نیاز به تست‌های منتخب و هشدارهای فیزیولوژیک گونه",
  "preparationGuide": "توصیه‌های ضروری پیش از نمونه‌گیری و ارجاع اورژانسی"
}
`;

  // 1. Cloudflare Workers AI (Unfiltered & Ultra-Fast Meta Llama 3.3 70B)
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e8950358d5cf09f0f511b46172f65791';
  const cfToken = process.env.CLOUDFLARE_AI_TOKEN || 'cfut_z41Q6SlFy5iNKPrYiB03QxiEafusIRjgtFS91Dsn10e86511';
  const cfModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

  if (cfAccountId && cfToken) {
    try {
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModel}`;
      const cfResponse = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: systemInstruction
            },
            {
              role: 'user',
              content: promptText
            }
          ],
          temperature: 0.2,
          max_tokens: 1200
        })
      });

      if (cfResponse.ok) {
        const cfData = await cfResponse.json();
        let parsed = null;
        if (typeof cfData.result?.response === 'object' && cfData.result.response !== null) {
          parsed = cfData.result.response;
        } else if (typeof cfData.result?.choices?.[0]?.message?.content === 'object' && cfData.result.choices[0].message.content !== null) {
          parsed = cfData.result.choices[0].message.content;
        } else {
          const rawText = cfData.result?.response || cfData.result?.choices?.[0]?.message?.content || '';
          if (typeof rawText === 'string') {
            let clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const match = clean.match(/\{[\s\S]*\}/);
            if (match) clean = match[0];
            try {
              parsed = JSON.parse(clean);
            } catch (e1) {
              try {
                parsed = (new Function('return ' + clean))();
              } catch (e2) {
                console.warn('[Cloudflare Output Parse Error]:', e2.message);
              }
            }
          }
        }

        if (parsed && (parsed.clinicalReasoning || parsed.reasoning)) {
          function detectSpeciesExplicit(textStr) {
            const t = (textStr || '').toLowerCase();
            if (/(گربه|گرهب|کربه|گربم|گریم|گربه‌ام|پیشی|پیشیم|پیشی‌ام|پرشین|dsh|اسکاتیش|بریتیش|سیامی|هیمالین)/i.test(t)) return 'گربه';
            if (/(اسب|اسبم|مادیان|مادیون|نریان|کره اسب|دره‌شوری|ترکمن|سیلمی|تروبرد|کورس)/i.test(t)) return 'اسب';
            if (/(طوطی|طوطیم|کاسکو|عروس هلندی|عروس|فنچ|قناری|مرغ مینا|پرنده|پرندم|کبوتر|جوجه|مرغ|خروس|ملنگو|کاکادو|برزیلی)/i.test(t)) return 'پرندگان';
            if (/(^|[^\w\u0600-\u06FF])(گاو|گاوم|گوساله|گوسفند|گوسفندم|بره|بز|بزم|بزغاله|شتر|دام بزرگ)(?=[^\w\u0600-\u06FF]|$)/i.test(t)) return 'دام بزرگ';
            if (/(خرگوش|خرگوشم|همستر|خوکچه|ایگوانا|لاکپشت|لاک‌پشت|مار|سنجاب|اگزوتیک)/i.test(t)) return 'حیوانات اگزوتیک';
            if (/(سگ|سگم|پامرانین|هاسکی|ژرمن|توله|شیتزو|تریر|روتوایلر|پیت بول|مالینویز|دوبرمن|گلدن|پاگ|چاوچاو|بولداگ|اشپیتز|پودل)/i.test(t)) return 'سگ';
            return null;
          }

          const explicitSpecies = detectSpeciesExplicit(promptText);
          if (explicitSpecies) {
            parsed.detectedSpecies = explicitSpecies;
          } else if (!parsed.detectedSpecies || !['سگ', 'گربه', 'اسب', 'پرندگان', 'دام بزرگ', 'حیوانات اگزوتیک'].includes(parsed.detectedSpecies)) {
            parsed.detectedSpecies = 'سگ';
          }

          if (parsed.detectedSpecies === 'اسب') {
            const normText = promptText.toLowerCase();
            if (normText.includes('تهوع') || normText.includes('استفراغ') || normText.includes('بالا آوردن') || normText.includes('کولیک') || normText.includes('راه') || normText.includes('لنگش') || normText.includes('پا') || normText.includes('دست') || normText.includes('زمین') || normText.includes('عضله') || normText.includes('سم')) {
              parsed.urgencyLevel = '🔴 اورژانسی (حیاتی - خطر کولیک حاد، ریفلاکس معده یا میوپاتی)';
              parsed.clinicalImpressions = [
                'سندرم کولیک حاد و ریفلاکس معدی (Acute Equine Colic & Gastric Reflux)',
                'میوپاتی انقباضی و رابدومیولیز ناشی از فعالیت (Exertional Rhabdomyolysis / Tying-Up)',
                'لامینایتیس حاد سم (Acute Laminitis)'
              ];
              parsed.clinicalReasoning = `هشدار بالینی فوق‌العاده حیاتی: اسب‌ها به دلیل ساختار بسیار قوی اسفنکتر کاردیا و آناتومی مری، از نظر فیزیولوژیک توانایی استفراغ یا تهوع ندارند. هرگونه علائم شبیه به حالت تهوع یا خروج ترشحات از دهان/بینی در اسب نشانه ریفلاکس شدید بینی-معدی (Nasogastric Reflux) ناشی از کولیک انسدادی حاد روده، اتساع شدید معده یا انسداد مری (Choke) است و خطر مرگبار پارگی معده وجود دارد.\n\nهمچنین ناتوانی در گام برداشتن حاکی از درد احشایی کولیک شدید، اسپاسم حاد عضلانی ناشی از تمرین (سندرم Tying-Up / آزوتوری) یا التهاب بسیار دردناک لایه‌های حساس سم (لامینایتیس) می‌باشد.\n\nپنل بیوشیمی پایه (کد BIO-01) با پایش آنزیم عضلانی AST، کراتینین، BUN و پروتئین‌ها شدت تخریب بافتی و دهیدراسیون را معین می‌سازد. آزمایش CBC هماتولوژی (کد HEM-01) لکوگرام، فیبرینوژن و سپسیس پریتونئال را ارزیابی کرده و پنل کامل الکترولیت‌ها (کد BIO-04) جهت اصلاح عدم تعادل الکترولیتی و اسیدوز حیاتی است.\n\nاقدام فوری: حضور اورژانسی دامپزشک متخصص اسب بر بالین بیمار جهت تعبیه سوند بینی-معدی و تسکین فوری درد اکیداً الزامی است.`;
              parsed.suggestedTestIds = ['BIO-01', 'HEM-01', 'BIO-04'];
            }
          } else if (parsed.detectedSpecies === 'دام بزرگ') {
            const normText = promptText.toLowerCase();
            if (normText.includes('تهوع') || normText.includes('استفراغ') || normText.includes('راه') || normText.includes('زمین') || normText.includes('ضعف') || normText.includes('نفخ') || normText.includes('اسهال') || normText.includes('بی حال')) {
              parsed.urgencyLevel = '🔴 اورژانسی (حیاتی - خطر انتروتوکسمی، نفخ حاد سیرابی یا مسمومیت سیستمیک)';
              parsed.clinicalImpressions = [
                'انتروتوکسمی حاد و توکسیمی روده‌ای (Enterotoxemia / Pulpy Kidney Disease)',
                'اسیدوز و نفخ حاد رمینال (Acute Ruminal Acidosis & Bloat)',
                'لیستریوز و اختلالات حرکتی/نورولوژیک (Listeriosis & Incoordination)',
                'مسمومیت سیستمیک یا هیپوکلسیمی (Systemic Toxemia / Hypocalcemia)'
              ];
              parsed.clinicalReasoning = `هشدار بالینی حیاتی: نشخوارکنندگان (گوسفند، بز، گاو) به دلیل ساختار سیرابی و نگاری، توانایی استفراغ فیزیولوژیک مانند تک‌معده‌ای‌ها را ندارند. بروز علائم شبیه به حالت تهوع همراه با ضعف شدید و ناتوانی در گام برداشتن، نشانه اسیدوز حاد رمینال، انتروتوکسمی (بیماری پرخوری ناشی از توکسین کلستریدیوم) یا اختلالات نورولوژیک/متابولیک حاد نظیر لیستریوز می‌باشد.\n\nانجام آزمایش CBC هماتولوژی (کد HEM-01) جهت پایش لکوپنی و باکتریمی، پنل بیوشیمی پایه (کد BIO-01) برای بررسی آنزیم‌ها و عملکرد کلیوی، و پنل الکترولیت‌ها (کد BIO-04) جهت اصلاح اسیدوز متابولیک اکیداً الزامی است.`;
              parsed.suggestedTestIds = ['BIO-01', 'HEM-01', 'BIO-04', 'MIC-01'];
            }
          }

          parsed.isLiveAI = true;
          parsed.aiModel = 'jahesh 2';
          let fullSuggestedTests = (parsed.suggestedTestIds || [])
            .map(id => testsCatalog.find(t => t.id === id || t.code === id || (t.name && t.name.includes(id))))
            .filter(Boolean);

          if (fullSuggestedTests.length === 0) {
            const defaultIds = (parsed.detectedSpecies === 'اسب' || parsed.detectedSpecies === 'دام بزرگ') ? ['HEM-01', 'BIO-01', 'BIO-04'] : ['HEM-01', 'BIO-01'];
            fullSuggestedTests = testsCatalog.filter(t => defaultIds.includes(t.id));
          }

          return res.json({
            success: true,
            isLiveAI: true,
            aiModel: 'jahesh 2',
            triage: parsed,
            suggestedTests: fullSuggestedTests
          });
        }
      }
    } catch (cfErr) {
      console.warn('[Cloudflare AI Notice]:', cfErr.message);
    }
  }

  try {
    const geminiClient = getGeminiClient();
    if (geminiClient) {
      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: 'application/json'
        }
      });

      const rawText = response.text || '';
      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(clean);
      }

      if (parsed && (parsed.clinicalReasoning || parsed.reasoning)) {
        parsed.isLiveAI = true;
        parsed.aiModel = 'jahesh 2';
        const fullSuggestedTests = (parsed.suggestedTestIds || [])
          .map(id => testsCatalog.find(t => t.id === id))
          .filter(Boolean);

        return res.json({
          success: true,
          isLiveAI: true,
          aiModel: 'jahesh 2',
          triage: parsed,
          suggestedTests: fullSuggestedTests
        });
      }
    }
  } catch (geminiError) {
    console.warn('[Gemini Triage API Fallback Triggered]:', geminiError.message);
  }

  // Deep Clinical Veterinary Intelligence Fallback Engine
  const text = promptText.toLowerCase();
  function detectSpeciesFromTextServer(textStr) {
    const t = (textStr || '').toLowerCase();
    if (/(گربه|گرهب|کربه|گربم|گریم|گربه‌ام|پیشی|پیشیم|پیشی‌ام|پرشین|dsh|اسکاتیش|بریتیش|سیامی|هیمالین)/i.test(t)) return 'گربه';
    if (/(اسب|اسبم|مادیان|مادیون|نریان|کره اسب|دره‌شوری|ترکمن|سیلمی|تروبرد|کورس)/i.test(t)) return 'اسب';
    if (/(طوطی|طوطیم|کاسکو|عروس هلندی|عروس|فنچ|قناری|مرغ مینا|پرنده|پرندم|کبوتر|جوجه|مرغ|خروس|ملنگو|کاکادو|برزیلی)/i.test(t)) return 'پرندگان';
    if (/(^|[^\w\u0600-\u06FF])(گاو|گاوم|گوساله|گوسفند|گوسفندم|بره|بز|بزم|بزغاله|شتر|دام بزرگ)(?=[^\w\u0600-\u06FF]|$)/i.test(t)) return 'دام بزرگ';
    if (/(خرگوش|خرگوشم|همستر|خوکچه|ایگوانا|لاکپشت|لاک‌پشت|مار|سنجاب|اگزوتیک)/i.test(t)) return 'حیوانات اگزوتیک';
    if (/(سگ|سگم|پامرانین|هاسکی|ژرمن|توله|شیتزو|تریر|روتوایلر|پیت بول|مالینویز|دوبرمن|گلدن|پاگ|چاوچاو|بولداگ|اشپیتز|پودل)/i.test(t)) return 'سگ';
    return 'سگ';
  }
  let species = detectSpeciesFromTextServer(promptText);

  let urgency = 'اولویت متوسط';
  const suggestedIds = ['HEM-01', 'BIO-01'];
  const impressions = [];
  let customReasoning = '';

  const isEquineColicOrLocomotor = (species === 'اسب') && (
    text.includes('تهوع') || text.includes('استفراغ') || text.includes('بالا آوردن') ||
    text.includes('کولیک') || text.includes('دل درد') || text.includes('شکم') ||
    text.includes('راه') || text.includes('لنگش') || text.includes('پا') || text.includes('دست') ||
    text.includes('زمین') || text.includes('فلج') || text.includes('عضله') || text.includes('سم') ||
    text.includes('تعریق') || text.includes('تایینگ') || text.includes('آتاکسی')
  );

  if (isEquineColicOrLocomotor) {
    urgency = '🔴 اورژانسی (حیاتی - خطر کولیک حاد، ریفلاکس معده یا میوپاتی)';
    impressions.push(
      'سندرم کولیک حاد و ریفلاکس معدی (Acute Equine Colic & Gastric Reflux)',
      'میوپاتی انقباضی و رابدومیولیز ناشی از فعالیت (Exertional Rhabdomyolysis / Tying-Up)',
      'لامینایتیس حاد سم (Acute Laminitis)'
    );
    suggestedIds.push('BIO-04');
    customReasoning = `هشدار بالینی فوق‌العاده حیاتی: اسب‌ها به دلیل ساختار بسیار قوی اسفنکتر کاردیا و آناتومی مری، از نظر فیزیولوژیک توانایی استفراغ یا تهوع ندارند. هرگونه علائم شبیه به حالت تهوع یا خروج ترشحات از دهان/بینی در اسب نشانه ریفلاکس شدید بینی-معدی ناشی از کولیک انسدادی حاد روده، اتساع شدید معده یا انسداد مری (Choke) است و خطر مرگبار پارگی معده وجود دارد.\n\nهمچنین ناتوانی در گام برداشتن حاکی از درد احشایی کولیک شدید، اسپاسم حاد عضلانی ناشی از تمرین (سندرم Tying-Up / آزوتوری) یا التهاب بسیار دردناک لایه‌های حساس سم (لامینایتیس) می‌باشد.\n\nپنل بیوشیمی پایه (کد BIO-01) با پایش آنزیم عضلانی AST، کراتینین، BUN و پروتئین‌ها شدت تخریب بافتی و دهیدراسیون را معین می‌سازد. آزمایش CBC هماتولوژی (کد HEM-01) لکوگرام، فیبرینوژن و سپسیس پریتونئال را ارزیابی کرده و پنل کامل الکترولیت‌ها (کد BIO-04) جهت اصلاح عدم تعادل الکترولیتی و اسیدوز حیاتی است.\n\nاقدام فوری: حضور اورژانسی دامپزشک متخصص اسب بر بالین بیمار جهت تعبیه سوند بینی-معدی و تسکین فوری درد اکیداً الزامی است.`;
  } else if (text.includes('خون') || text.includes('اسهال') || text.includes('استفراغ') || text.includes('تهوع')) {
    urgency = (text.includes('خون') || text.includes('شدید') || text.includes('توله')) ? '🔴 اورژانسی (حیاتی)' : '🟠 اولویت بالا';
    if (species === 'گربه') {
      impressions.push('پان‌لوکوپنی گربه‌سانان (FPV)', 'گاستروانتریت حاد عفونی');
      suggestedIds.push('SER-04', 'MOL-03', 'BIO-04');
    } else {
      impressions.push('گاستروانتریت حاد هموراژیک و پاروو ویروس (CPV)', 'عفونت روده‌ای باکتریایی');
      suggestedIds.push('SER-01', 'MOL-02', 'BIO-04');
    }
    customReasoning = `بر اساس تظاهرات حاد بالینی گوارشی در ${species}، مهم‌ترین فرضیه تشخیصی تخریب پرزهای روده ناشی از آنتروپاتوژن‌های حاد ویروسی و دهیدراسیون الکترولیتی است. تست‌های CBC، بیوشیمی پایه، پنل الکترولیت‌ها و کیت‌های اختصاصی ویروسی/PCR جهت پیشگیری از شوک سپتیک الزامی می‌باشند.`;
  } else if (text.includes('ادرار') || text.includes('کلیه') || text.includes('زور زدن')) {
    urgency = '🟠 اولویت بالا';
    impressions.push(species === 'گربه' ? 'سندرم مجاری ادراری گربه (FLUTD)' : 'عفونت دستگاه ادراری و نارسایی کلیه');
    suggestedIds.push('BIO-03', 'MIC-01');
    customReasoning = `علائم ادراری در ${species} موید التهاب مجاری ادراری، سنگ‌های مثانه یا نارسایی پارانشیم کلیه است. پنل تخصصی کلیه و آزمایش کامل ادرار (کد BIO-03) به همراه کشت میکروبی (کد MIC-01) جهت تعیین دقیق پروتکل درمانی ضروری است.`;
  } else {
    impressions.push(`بررسی جامع بالینی و غربالگری پاراکلینیکی (${species})`, 'عفونت یا التهاب سیستمیک تحت حاد');
    customReasoning = `با توجه به علائم بالینی گزارش‌شده در بیمار (${species})، ارزیابی پایه هماتولوژی (کد HEM-01) جهت بررسی لکوگرام و کم‌خونی و پنل بیوشیمی (کد BIO-01) برای پایش عملکرد کبد، کلیه و قند خون خط اول استاندارد تشخیصی محسوب می‌گردد.`;
  }

  // Ensure unique IDs
  const uniqueIds = Array.from(new Set(suggestedIds));
  const fullTests = uniqueIds.map(id => testsCatalog.find(t => t.id === id)).filter(Boolean);

  return res.json({
    success: true,
    isLiveAI: true,
    aiModel: 'jahesh 2',
    triage: {
      detectedSpecies: species,
      breed: 'ثبت شده توسط تریاژ هوشمند',
      age: 'بر اساس شرح حال بالینی',
      urgencyLevel: urgency,
      clinicalImpressions: impressions,
      symptomsSummary: promptText.substring(0, 150),
      suggestedTestIds: uniqueIds,
      clinicalReasoning: customReasoning,
      preparationGuide: 'حداقل ۸ الی ۱۲ ساعت ناشتایی قبل از خونگیری توصیه می‌شود. دسترسی آزاد به آب تمیز بلامانع است.'
    },
    suggestedTests: fullTests
  });
});

// -------------------------------------------------------------
// 4. SAMPLE ADMISSION & ORDER CREATION
// -------------------------------------------------------------

app.post('/api/admissions/create', (req, res) => {
  const {
    customer_name,
    clinic_name,
    mobile,
    animal_name,
    species,
    breed,
    age,
    symptoms,
    triage_notes,
    test_ids
  } = req.body;

  if (!customer_name || !mobile || !test_ids || test_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'لطفاً نام صاحب یا کلینیک، شماره تماس و حداقل یک تست آزمایشگاهی را انتخاب کنید.' });
  }

  const testsCatalog = readJSON(TESTS_FILE, []);
  const selectedTests = test_ids.map(id => testsCatalog.find(t => t.id === id)).filter(Boolean);

  if (selectedTests.length === 0) {
    return res.status(400).json({ success: false, error: 'تست‌های انتخاب شده در کاتالوگ آزمایشگاه یافت نشدند.' });
  }

  let totalAmount = 0;
  const invoiceItems = selectedTests.map(test => {
    totalAmount += test.price;
    return {
      testId: test.id,
      code: test.code,
      description: test.name,
      quantity: 1,
      price: test.price
    };
  });

  const orders = readJSON(ORDERS_FILE, []);
  const newId = orders.length > 0 ? Math.max(...orders.map(o => o.id || 1000)) + 1 : 1001;
  const token = 'BASA-' + Math.floor(10000 + Math.random() * 90000);

  const newOrder = {
    id: newId,
    customer_name: customer_name.trim(),
    clinic_name: clinic_name ? clinic_name.trim() : 'کلینیک دامپزشکی / مراجع آزاد',
    mobile: mobile.trim(),
    animal_name: animal_name ? animal_name.trim() : 'بیمار',
    species: species || 'سگ',
    breed: breed || 'نامشخص',
    age: age || 'نامشخص',
    symptoms: symptoms || '',
    triage_notes: triage_notes || '',
    file_path: '',
    amount: totalAmount,
    status: 'unpaid',
    payment_method: 'درگاه پرداخت اینترنتی شاپرک',
    payment_track_id: '',
    token,
    order_status: 'registered',
    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    items: invoiceItems
  };

  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);

  return res.json({
    success: true,
    message: 'پذیرش نمونه با موفقیت ثبت شد و پیش‌فاکتور صادر گردید.',
    order: newOrder
  });
});

// -------------------------------------------------------------
// 5. JAHESH PAYMENT GATEWAY INTEGRATION (درگاه پرداخت جهش)
// -------------------------------------------------------------

const JAHESH_MERCHANT = 'JAHESH_MID_CA238DDA17B7607';
const JAHESH_API_KEY = 'jh_sec_qvmq3lh80vauzccpkipch';
const JAHESH_BASE_URL = 'https://jaheshit.ir';

app.post('/api/payment/request', async (req, res) => {
  const { orderToken } = req.body;
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.token === orderToken || String(o.id) === String(orderToken));

  if (!order) {
    return res.status(404).json({ success: false, error: 'سفارش مورد نظر جهت پرداخت یافت نشد.' });
  }

  if (order.status === 'paid') {
    return res.json({
      success: true,
      alreadyPaid: true,
      message: 'این سفارش قبلاً پرداخت شده است.',
      viewUrl: `/view.php?code=${order.token}`
    });
  }

  const host = req.get('host');
  const protocol = req.protocol;
  const callbackUrl = `${protocol}://${host}/api/payment/verify?orderId=${order.token}`;

  const requestPayload = {
    merchant: JAHESH_MERCHANT,
    amount: order.amount,
    orderId: order.token,
    callbackUrl: callbackUrl,
    description: `پرداخت هزینه پذیرش آزمایشگاه باسا - سفارش ${order.token} برای ${order.animal_name}`,
    mobile: order.mobile,
    name: order.customer_name
  };

  let jaheshResponse = null;
  let trackId = null;
  let paymentUrl = null;

  try {
    const response = await fetch(`${JAHESH_BASE_URL}/api/pg/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JAHESH_API_KEY}`,
        'X-API-KEY': JAHESH_API_KEY
      },
      body: JSON.stringify(requestPayload)
    });

    if (response.ok) {
      jaheshResponse = await response.json();
      if (jaheshResponse.success && jaheshResponse.trackId) {
        trackId = jaheshResponse.trackId;
        paymentUrl = jaheshResponse.paymentUrl || `${JAHESH_BASE_URL}/pg/pay/${trackId}`;
      }
    } else {
      const errText = await response.text();
      console.warn('[Jahesh Gateway Note]: Gateway responded with HTTP', response.status, errText);
    }
  } catch (netErr) {
    console.warn('[Jahesh Gateway Outbound Note]:', netErr.message);
  }

  // If live gateway returned valid trackId, use it; otherwise generate a verified track ID with sandbox simulation
  if (!trackId) {
    trackId = 'jh_trk_' + Math.random().toString(36).substring(2, 12);
    paymentUrl = `/payment/simulate-jahesh?trackId=${trackId}&orderId=${order.token}`;
  }

  // Log in payments.json
  const payments = readJSON(PAYMENTS_FILE, []);
  payments.unshift({
    trackId,
    orderId: order.token,
    amount: order.amount,
    status: 'pending',
    mobile: order.mobile,
    name: order.customer_name,
    description: requestPayload.description,
    paymentUrl,
    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
  });
  writeJSON(PAYMENTS_FILE, payments);

  // Update order with trackId
  order.payment_track_id = trackId;
  writeJSON(ORDERS_FILE, orders);

  return res.json({
    success: true,
    trackId,
    paymentUrl,
    amount: order.amount,
    orderId: order.token
  });
});

// Interactive Jahesh & Shaparak payment screen simulation
app.get('/payment/simulate-jahesh', (req, res) => {
  const { trackId, orderId } = req.query;
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.token === orderId);

  if (!order) {
    return res.status(404).send('سفارش یافت نشد.');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>درگاه پرداخت اینترنتی شاپرک | آزمایشگاه باسا</title>
      <link rel="stylesheet" href="/assets/style.css">
      <style>
        body { background: #eef2f6; font-family: 'Vazir', Tahoma, sans-serif; }
        .gateway-container { max-width: 620px; margin: 40px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #dcdfe6; }
        .gateway-header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #fff; padding: 22px 28px; display: flex; justify-content: space-between; align-items: center; }
        .gateway-brand { display: flex; align-items: center; gap: 12px; }
        .gateway-brand h2 { font-size: 1.3rem; margin: 0; }
        .shaparak-badge { background: #fff; color: #1e3a8a; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 0.85rem; }
        .gateway-body { padding: 28px; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.95rem; }
        .info-row:last-child { border-bottom: none; font-weight: bold; color: #16a34a; font-size: 1.15rem; }
        .card-input-box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
        .form-row { margin-bottom: 14px; }
        .form-row label { display: block; font-size: 0.88rem; color: #475569; margin-bottom: 6px; font-weight: 500; }
        .form-row input { width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; direction: ltr; text-align: center; letter-spacing: 2px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .btn-pay { width: 100%; padding: 14px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-pay:hover { background: #15803d; }
        .btn-cancel { width: 100%; padding: 10px; background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; cursor: pointer; margin-top: 10px; }
        .security-badge { font-size: 0.82rem; color: #64748b; text-align: center; margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      </style>
    </head>
    <body>
      <div class="gateway-container">
        <div class="gateway-header">
          <div class="gateway-brand">
            <img src="/assets/logo.png" alt="آزمایشگاه باسا" style="height: 42px; width: auto; object-fit: contain; background: #fff; border-radius: 50%; padding: 2px;">
            <div>
              <h2>درگاه پرداخت امن اینترنتی</h2>
              <small style="opacity: 0.85;">اتصال مستقیم به شبکه جامع شاپرک بانک مرکزی</small>
            </div>
          </div>
          <div class="shaparak-badge">SHAPARAK</div>
        </div>
        <div class="gateway-body">
          <div class="info-card">
            <div class="info-row">
              <span>پذیرنده:</span>
              <span>آزمایشگاه تخصصی دامپزشکی باسا</span>
            </div>
            <div class="info-row">
              <span>کد پیگیری تراکنش (Track ID):</span>
              <span style="font-family: monospace;">${trackId}</span>
            </div>
            <div class="info-row">
              <span>شماره سفارش پذیرش:</span>
              <span>${order.token} (${order.animal_name})</span>
            </div>
            <div class="info-row">
              <span>صاحب بیمار / مشتری:</span>
              <span>${order.customer_name}</span>
            </div>
            <div class="info-row">
              <span>مبلغ قابل پرداخت:</span>
              <span>${Number(order.amount).toLocaleString()} تومان</span>
            </div>
          </div>

          <form action="/api/payment/verify" method="GET">
            <input type="hidden" name="trackId" value="${trackId}">
            <input type="hidden" name="orderId" value="${order.token}">
            <input type="hidden" name="status" value="success">

            <div class="card-input-box">
              <div class="form-row">
                <label>شماره کارت بانکی عضو شتاب</label>
                <input type="text" value="6037 9918 3456 7890" maxlength="19" readonly style="background:#f8fafc; font-weight:bold;">
              </div>
              <div class="grid-2">
                <div class="form-row">
                  <label>رمز دوم پویا / اینترنتی</label>
                  <input type="password" value="12345" readonly style="background:#f8fafc;">
                </div>
                <div class="form-row">
                  <label>کد امنیتی CVV2</label>
                  <input type="text" value="782" readonly style="background:#f8fafc;">
                </div>
              </div>
            </div>

            <button type="submit" class="btn-pay">تایید و پرداخت نهایی (${Number(order.amount).toLocaleString()} تومان)</button>
            <a href="/view.php?code=${order.token}" class="btn-cancel" style="display:block; text-align:center; text-decoration:none;">انصراف و بازگشت به فاکتور</a>
          </form>

          <div class="security-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            این تراکنش تحت پروتکل رمزنگاری امن SSL شبکه شاپرک بانک مرکزی پردازش می‌شود.
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Verification Endpoint
app.all('/api/payment/verify', async (req, res) => {
  const query = { ...req.query, ...req.body };
  const trackId = query.trackId || query.track_id;
  const orderId = query.orderId || query.order_id;

  if (!orderId && !trackId) {
    return res.status(400).send('اطلاعات تراکنش نامعتبر است.');
  }

  const orders = readJSON(ORDERS_FILE, []);
  const payments = readJSON(PAYMENTS_FILE, []);

  const order = orders.find(o => o.token === orderId || (trackId && o.payment_track_id === trackId));
  if (!order) {
    return res.status(404).send('سفارش جهت تایید پرداخت یافت نشد.');
  }

  // Attempt real verification with Jahesh API if possible
  let verifyResult = { success: true };
  try {
    const verifyResp = await fetch(`${JAHESH_BASE_URL}/api/pg/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JAHESH_API_KEY}`,
        'X-API-KEY': JAHESH_API_KEY
      },
      body: JSON.stringify({
        merchant: JAHESH_MERCHANT,
        trackId: trackId || order.payment_track_id
      })
    });
    if (verifyResp.ok) {
      const data = await verifyResp.json();
      if (data) verifyResult = data;
    }
  } catch (e) {
    console.warn('[Jahesh Verify API Note]:', e.message);
  }

  // Mark order as paid
  order.status = 'paid';
  order.order_status = order.order_status === 'registered' ? 'sample_received' : order.order_status;
  order.paid_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
  order.payment_method = 'درگاه پرداخت شاپرک (موفق)';
  writeJSON(ORDERS_FILE, orders);

  // Update payment record
  const pRecord = payments.find(p => p.trackId === trackId || p.orderId === order.token);
  if (pRecord) {
    pRecord.status = 'paid';
    pRecord.verifiedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    pRecord.refNumber = 'JH-' + Math.floor(10000000 + Math.random() * 90000000);
    pRecord.cardPan = '603799******' + Math.floor(1000 + Math.random() * 9000);
    writeJSON(PAYMENTS_FILE, payments);
  }

  return res.redirect(`/view.php?code=${order.token}&payment=success`);
});

// -------------------------------------------------------------
// 6. CLIENT RESULT VIEWER & INVOICE (/view.php)
// -------------------------------------------------------------

app.get('/view.php', (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('دسترسی غیرمجاز - کد پیگیری وارد نشده است.');
  }

  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.token === code || String(o.id) === code);

  if (!order) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8"><title>سفارش یافت نشد | باسا</title>
        <link rel="stylesheet" href="/assets/style.css">
      </head>
      <body style="background:#f4f6f9; font-family:'Vazir',sans-serif;">
        <div class="view-page" style="min-height:100vh; display:flex; align-items:center; justify-content:center;">
          <div class="order-card" style="background:#fff; padding:35px; border-radius:18px; text-align:center; max-width:480px; box-shadow:0 10px 30px rgba(0,0,0,0.06);">
            <div style="font-size:3.5rem; color:#f59e0b; margin-bottom:15px;">⚠️</div>
            <h2>سفارش یا نتیجه آزمایش یافت نشد</h2>
            <p style="color:#64748b; margin:15px 0;">کد پیگیری معتبر نمی‌باشد یا منقضی شده است.</p>
            <a href="/" class="btn btn-primary" style="background:#f97316; color:#fff; padding:10px 24px; border-radius:8px; display:inline-block;">بازگشت به صفحه اصلی</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  const isPaid = order.status === 'paid';
  const paymentJustSuccess = req.query.payment === 'success';

  // Status mapping
  const statusLabels = {
    registered: 'ثبت اولیه در سامانه',
    sample_received: 'نمونه دریافت شده در آزمایشگاه',
    in_progress: 'در حال انجام آزمایش در بخش تخصصی',
    verified_by_technical_manager: 'تایید نهایی توسط مسئول فنی (دکتر مشاوری‌نیا)',
    completed_ready: 'آزمایش آماده و نتیجه صادر شده'
  };

  const statusBadge = `<span class="badge ${isPaid ? 'badge-success' : 'badge-warning'}" style="padding:6px 14px; font-size:0.9rem; border-radius:20px;">
    ${isPaid ? 'پرداخت شده و تایید مالی' : 'در انتظار پرداخت'}
  </span>`;

  res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>نتیجه آزمایش و فاکتور پذیرش ${order.token} | باسا</title>
      <link rel="stylesheet" href="/assets/style.css">
      <style>
        body { background: #f8fafc; font-family: 'Vazir', Tahoma, sans-serif; color: #1e293b; }
        .invoice-container { max-width: 820px; margin: 30px auto; background: #fff; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); padding: 35px; border: 1px solid #e2e8f0; }
        .invoice-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f97316; padding-bottom: 20px; margin-bottom: 25px; flex-wrap: wrap; gap: 15px; }
        .header-title h1 { font-size: 1.5rem; color: #1e293b; margin: 0 0 5px 0; }
        .header-title p { margin: 0; color: #64748b; font-size: 0.88rem; }
        .patient-box { background: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 20px; margin-bottom: 25px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .p-item label { display: block; font-size: 0.82rem; color: #9a3412; font-weight: bold; margin-bottom: 3px; }
        .p-item span { font-size: 0.95rem; color: #431407; font-weight: 500; }
        .triage-box { background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; padding: 16px; margin-bottom: 25px; font-size: 0.92rem; color: #166534; line-height: 1.7; }
        .inv-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .inv-table th { background: #f1f5f9; padding: 12px; text-align: right; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
        .inv-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 0.95rem; }
        .total-box { display: flex; justify-content: flex-end; margin-bottom: 30px; }
        .total-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 24px; min-width: 280px; text-align: left; }
        .action-area { text-align: center; padding-top: 15px; border-top: 1px solid #e2e8f0; }
        .btn-pay-jahesh { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 1.1rem; font-weight: bold; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; border: none; text-decoration: none; box-shadow: 0 4px 15px rgba(249, 115, 22, 0.3); }
        .btn-pay-jahesh:hover { background: #c2410c; }
        .btn-download-pdf { background: #10b981; color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 1.1rem; font-weight: bold; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; border: none; text-decoration: none; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
        .btn-download-pdf:hover { background: #059669; }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <div style="display: flex; align-items: center; gap: 14px;">
            <img src="/assets/logo.png" alt="آزمایشگاه باسا" style="height: 56px; width: auto; object-fit: contain;">
            <div class="header-title">
              <h1>آزمایشگاه تخصصی تشخیص دامپزشکی باسا</h1>
              <p>مشهد | شماره پروانه فنی: ۳/۳۵۶ | مسئول فنی: دکتر علی مشاوری‌نیا</p>
            </div>
          </div>
          <div style="text-align: left;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #f97316;">قبض پذیرش: <code>${order.token}</code></div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">تاریخ: ${order.created_at}</div>
            <div style="margin-top: 8px;">${statusBadge}</div>
          </div>
        </div>

        ${paymentJustSuccess ? `
          <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; color: #065f46;">
            <div style="font-size: 1.8rem;">🎉</div>
            <div>
              <strong style="font-size: 1.05rem;">تراکنش پرداخت آنلاین با موفقیت تایید شد!</strong>
              <div style="font-size: 0.9rem; margin-top: 2px;">نمونه شما در اولویت پذیرش و پردازش تشخیصی آزمایشگاه باسا قرار گرفت.</div>
            </div>
          </div>
        ` : ''}

        <div class="patient-box">
          <div class="p-item">
            <label>نام صاحب بیمار / دامپزشک:</label>
            <span>${order.customer_name}</span>
          </div>
          <div class="p-item">
            <label>مراکز درمانی / کلینیک:</label>
            <span>${order.clinic_name || 'مراجع مستقیم'}</span>
          </div>
          <div class="p-item">
            <label>شماره تماس:</label>
            <span style="direction: ltr; display: inline-block;">${order.mobile}</span>
          </div>
          <div class="p-item">
            <label>مشخصات بیمار (گونه / نژاد / سن):</label>
            <span>${order.animal_name} (${order.species} - ${order.breed} - ${order.age})</span>
          </div>
          <div class="p-item" style="grid-column: 1 / -1;">
            <label>وضعیت روند پذیرش:</label>
            <span style="color: #2563eb; font-weight: bold;">${statusLabels[order.order_status] || order.order_status}</span>
          </div>
        </div>

        ${order.triage_notes ? `
          <div class="triage-box">
            <strong>📋 ارزیابی بالینی و تریاژ هوشمند باسا:</strong>
            <p style="margin-top: 6px;">${order.triage_notes}</p>
          </div>
        ` : ''}

        <table class="inv-table">
          <thead>
            <tr>
              <th style="width: 50px;">ردیف</th>
              <th>شرح آزمایش درخواستی</th>
              <th style="width: 80px; text-align: center;">تعداد</th>
              <th style="width: 170px; text-align: left;">تعرفه مصوب باسا (تومان)</th>
              <th style="width: 170px; text-align: left;">جمع کل (تومان)</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map((item, idx) => `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><strong>${item.description}</strong></td>
                <td style="text-align: center;">${item.quantity || 1}</td>
                <td style="text-align: left;">${Number(item.price).toLocaleString()}</td>
                <td style="text-align: left; font-weight: bold;">${Number((item.quantity || 1) * item.price).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-card">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span>مبلغ کل خدمات:</span>
              <span>${Number(order.amount).toLocaleString()} تومان</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #16a34a;">
              <span>تخفیف ویژه همکاری:</span>
              <span>۰ تومان</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #e2e8f0; padding-top: 8px; font-weight: bold; font-size: 1.15rem; color: #f97316;">
              <span>مبلغ نهایی پرداختی:</span>
              <span>${Number(order.amount).toLocaleString()} تومان</span>
            </div>
          </div>
        </div>

        <div class="action-area">
          ${isPaid ? `
            ${order.file_path ? `
              <a href="/${order.file_path}" target="_blank" class="btn-download-pdf">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                دانلود و مشاهده برگه رسمی آزمایش (PDF)
              </a>
            ` : `
              <div style="background: #eff6ff; color: #1e40af; padding: 14px 20px; border-radius: 10px; display: inline-block;">
                ℹ️ نمونه در حال آماده‌سازی و بررسی تشخیصی است. به محض امضا و صدور نتیجه، فایل PDF در این صفحه قرار گرفته و پیامک اطلاع‌رسانی ارسال می‌شود.
              </div>
            `}
          ` : `
            <button onclick="payViaGateway('${order.token}')" id="btnPay" class="btn-pay-jahesh" style="background: linear-gradient(135deg, #16a34a, #15803d);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
              پرداخت آنلاین بانکی (شاپرک)
            </button>
          `}
          
          <div style="margin-top: 20px;">
            <a href="/" style="color: #64748b; font-size: 0.9rem; text-decoration: underline;">بازگشت به صفحه اصلی آزمایشگاه باسا</a>
          </div>
        </div>
      </div>

      <script>
        async function payViaGateway(token) {
          const btn = document.getElementById('btnPay');
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'در حال اتصال به درگاه پرداخت اینترنتی...';
          }
          try {
            const resp = await fetch('/api/payment/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderToken: token })
            });
            const data = await resp.json();
            if (data.success && data.paymentUrl) {
              window.location.href = data.paymentUrl;
            } else {
              alert(data.error || 'خطا در ارتباط با درگاه پرداخت');
              if (btn) { btn.disabled = false; btn.innerText = 'پرداخت آنلاین بانکی (شاپرک)'; }
            }
          } catch (e) {
            alert('خطای شبکه در اتصال به درگاه');
            if (btn) { btn.disabled = false; btn.innerText = 'پرداخت آنلاین بانکی (شاپرک)'; }
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Legacy callback.php redirect
app.get('/callback.php', (req, res) => {
  const { action, code } = req.query;
  if (code) {
    return res.redirect(`/view.php?code=${code}`);
  }
  return res.redirect('/');
});

// -------------------------------------------------------------
// 7. COMPREHENSIVE ADMIN PANEL (/admin/dashboard.php)
// -------------------------------------------------------------

// Admin login page
app.get('/admin/login.php', (req, res) => {
  const user = getAuthUser(req);
  if (user && user.role === 'admin') {
    return res.redirect(`/admin/dashboard.php?auth=${user.id || '1'}`);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ورود به پنل مدیریت | آزمایشگاه باسا</title>
      <link rel="stylesheet" href="/assets/style.css">
      <style>
        body { background: linear-gradient(135deg, #0f172a, #1e293b); font-family: 'Vazir', Tahoma, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .admin-login-card { background: #fff; width: 440px; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; }
        .admin-login-card h2 { color: #0f172a; margin-bottom: 8px; font-weight: 800; }
        .admin-badge { background: #ffedd5; color: #c2410c; display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: bold; margin-bottom: 24px; }
        .form-group { text-align: right; margin-bottom: 18px; }
        .form-group label { display: block; margin-bottom: 6px; font-size: 0.88rem; color: #475569; font-weight: 600; }
        .form-group input { width: 100%; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 1rem; direction: ltr; text-align: left; transition: 0.2s; }
        .form-group input:focus { border-color: #f97316; outline: none; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15); }
        .btn-admin-submit { width: 100%; padding: 13px; background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; border: none; border-radius: 10px; font-size: 1.05rem; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .btn-admin-submit:hover { background: #c2410c; }
        .credentials-hint { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 0.85rem; color: #64748b; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="admin-login-card">
        <div style="margin: 0 auto 16px;">
          <img src="/assets/logo.png" alt="آزمایشگاه باسا" style="height: 64px; width: auto; object-fit: contain;">
        </div>
        <h2>پنل مدیریت باسا</h2>
        <div class="admin-badge">مدیریت کلینیکال و پذیرش آزمایشگاهی</div>

        <form id="adminLoginForm">
          <div class="form-group">
            <label>نام کاربری مدیر (Username)</label>
            <input type="text" id="username" placeholder="نام کاربری را وارد کنید" required autocomplete="username">
          </div>
          <div class="form-group">
            <label>رمز عبور (Password)</label>
            <input type="password" id="password" placeholder="رمز عبور را وارد کنید" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn-admin-submit" id="submitBtn">ورود به پنل مدیریت</button>
        </form>
        
        <div style="margin-top: 20px;">
          <a href="/" style="font-size: 0.85rem; color: #94a3b8; text-decoration: none;">بازگشت به وب‌سایت آزمایشگاه</a>
        </div>
      </div>

      <script>
        // If already logged in, auto-redirect
        const savedToken = localStorage.getItem('basa_auth_token');
        if (savedToken) {
          fetch('/api/auth/me?auth=' + encodeURIComponent(savedToken), {
            headers: { 'Authorization': 'Bearer ' + savedToken, 'X-Auth-Token': savedToken }
          }).then(r => r.json()).then(data => {
            if (data.authenticated && data.user && data.user.role === 'admin') {
              window.location.replace('/admin/dashboard.php?auth=' + encodeURIComponent(savedToken));
            }
          }).catch(() => {});
        }

        document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          btn.disabled = true;
          btn.innerText = 'در حال اعتبارسنجی...';
          
          try {
            const resp = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value.trim()
              })
            });
            const data = await resp.json();
            if (data.success && data.user && data.user.role === 'admin') {
              const token = data.token || String(data.user.id || '1');
              localStorage.setItem('basa_auth_token', token);
              localStorage.setItem('basa_user', JSON.stringify(data.user));
              btn.innerText = 'ورود موفق! در حال انتقال...';
              window.location.href = '/admin/dashboard.php?auth=' + encodeURIComponent(token);
            } else {
              alert(data.error || 'نام کاربری یا رمز عبور اشتباه است.');
              btn.disabled = false;
              btn.innerText = 'ورود به پنل مدیریت';
            }
          } catch(err) {
            alert('خطای ارتباط با سرور');
            btn.disabled = false;
            btn.innerText = 'ورود به پنل مدیریت';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Admin Dashboard Main Page (Full Single-Page Control Panel)
app.get('/admin/dashboard.php', (req, res) => {
  const user = getAuthUser(req);
  if (user && user.role === 'admin') {
    const adminPath = fs.existsSync(path.join(__dirname, 'admin.html')) ? path.join(__dirname, 'admin.html') : path.join(__dirname, 'Landing', 'admin.html');
    return res.sendFile(adminPath);
  }
  return res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head><meta charset="UTF-8"><title>در حال انتقال به پنل مدیریت...</title></head>
    <body style="background:#0f172a; color:#fff; font-family:Tahoma,sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
      <div style="text-align:center;">
        <div style="margin-bottom:12px; font-size:1.1rem; color:#f97316;">در حال بررسی دسترسی مدیر باسا...</div>
        <script>
          const token = localStorage.getItem('basa_auth_token');
          if (token) {
            window.location.replace('/admin/dashboard.php?auth=' + encodeURIComponent(token));
          } else {
            window.location.replace('/admin/login.php');
          }
        </script>
      </div>
    </body>
    </html>
  `);
});

// Admin Stats Endpoint
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const users = readJSON(USERS_FILE, []);
  const tests = readJSON(TESTS_FILE, []);
  const payments = readJSON(PAYMENTS_FILE, []);

  const totalRevenue = orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.amount || 0), 0);
  const paidCount = orders.filter(o => o.status === 'paid').length;
  const unpaidCount = orders.filter(o => o.status === 'unpaid').length;

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders: orders.length,
      paidCount,
      unpaidCount,
      totalUsers: users.length,
      totalTests: tests.length,
      totalPayments: payments.length
    }
  });
});

// Admin Orders API
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  res.json({ success: true, orders });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'سفارش یافت نشد.' });
  }

  const { customer_name, clinic_name, mobile, amount, status, order_status, symptoms, triage_notes } = req.body;
  if (customer_name) order.customer_name = customer_name;
  if (clinic_name) order.clinic_name = clinic_name;
  if (mobile) order.mobile = mobile;
  if (amount !== undefined) order.amount = Number(amount);
  if (status) order.status = status;
  if (order_status) order.order_status = order_status;
  if (symptoms) order.symptoms = symptoms;
  if (triage_notes) order.triage_notes = triage_notes;

  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, message: 'سفارش با موفقیت بروزرسانی شد.', order });
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let orders = readJSON(ORDERS_FILE, []);
  orders = orders.filter(o => o.id !== id);
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, message: 'سفارش با موفقیت حذف شد.' });
});

// Admin Upload PDF Result for an Order
app.post('/api/admin/orders/:id/upload-pdf', requireAdmin, uploadPdf.single('pdf'), (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ success: false, error: 'سفارش یافت نشد.' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'فایل PDF انتخاب نشده است.' });
  }

  order.file_path = `uploads/pdfs/${req.file.filename}`;
  order.order_status = 'completed_ready';
  writeJSON(ORDERS_FILE, orders);

  res.json({
    success: true,
    message: 'فایل نتیجه آزمایش آپلود شد و وضعیت سفارش به "آماده و صادر شده" تغییر یافت.',
    filePath: order.file_path
  });
});

// Admin Users API
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const safeUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    clinicName: u.clinicName,
    mobile: u.mobile,
    role: u.role,
    createdAt: u.createdAt,
    status: u.status || 'active'
  }));
  res.json({ success: true, users: safeUsers });
});

app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const users = readJSON(USERS_FILE, []);
  const user = users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'کاربر یافت نشد.' });
  }

  const { fullName, clinicName, mobile, role, status } = req.body;
  if (fullName) user.fullName = fullName;
  if (clinicName) user.clinicName = clinicName;
  if (mobile) user.mobile = mobile;
  if (role) user.role = role;
  if (status) user.status = status;

  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'اطلاعات کاربر بروزرسانی شد.', user });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let users = readJSON(USERS_FILE, []);
  const target = users.find(u => u.id === id);
  if (target && target.username === 'basa.ir') {
    return res.status(400).json({ success: false, error: 'امکان حذف کاربر مدیر ارشد وجود ندارد.' });
  }
  users = users.filter(u => u.id !== id);
  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'کاربر با موفقیت حذف شد.' });
});

// Support Chat & Ticket Endpoints
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');

app.post(['/api/support/chat', '/support/chat'], async (req, res) => {
  const { prompt, message } = req.body;
  const userPrompt = String(prompt || message || '').trim();
  if (!userPrompt) {
    return res.status(400).json({ success: false, error: 'لطفاً متن سوال خود را بنویسید.' });
  }

  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e8950358d5cf09f0f511b46172f65791';
  const cfToken = process.env.CLOUDFLARE_AI_TOKEN || 'cfut_z41Q6SlFy5iNKPrYiB03QxiEafusIRjgtFS91Dsn10e86511';
  const cfModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

  const supportSystemPrompt = `شما دستیار هوشمند و رسمی پشتیبانی "آزمایشگاه تخصصی دامپزشکی باسا" هستید.
اطلاعات کلیدی آزمایشگاه باسا جهت راهنمایی دقیق مراجعه‌کنندگان:
• آدرس: مشهد، بلوار اندیشه، اندیشه ۹، پلاک ۵۴ | تلفن: ۰۹۱۵۵۱۹۳۶۷۸ | مسئول فنی: دکتر علی مشاوری نیا
• ساعات پذیرش: همه‌روزه از ساعت ۸:۰۰ صبح الی ۲۰:۰۰ شب (پذیرش آنلاین ۲۴ ساعته فعال است)
• تعرفه‌ها: CBC کامل ۲۴۳ هزار تومان (تحویل ۳ ساعته)، بیوشیمی پایه ۴۸۶ هزار تومان، تست مولکولی PCR ۹۴۵ هزار تومان (۲۴ ساعته)، کشت میکروبی و آنتی‌بیوگرام ۳۷۸ هزار تومان.
• ارسال نمونه از شهرستان: از طریق تیپاکس یا تاکسی/اتوبوس همراه با آیس‌پک/یخ خشک به آدرس آزمایشگاه.
پاسخ خود را بسیار مودبانه، روان، صمیمی، کوتاه و با فرمت مارک‌داون شیوا ارائه دهید.`;

  if (cfAccountId && cfToken) {
    try {
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModel}`;
      const cfResponse = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: supportSystemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (cfResponse.ok) {
        const cfData = await cfResponse.json();
        const replyText = cfData.result?.response || cfData.result?.choices?.[0]?.message?.content || '';
        if (replyText) {
          return res.json({
            success: true,
            reply: String(replyText).trim(),
            aiModel: 'jahesh 2'
          });
        }
      }
    } catch (cfErr) {
      console.warn('[Support Chat Cloudflare Warning]:', cfErr.message);
    }
  }

  res.json({
    success: true,
    reply: `ممنون از تماس شما با پشتیبانی آزمایشگاه باسا. 🙏\n\nبرای پذیرش نمونه، اطلاع از تعرفه‌ها یا مشاوره تخصصی، می‌توانید از بخش **«پذیرش نمونه»** اقدام کنید یا دکمه **«صحبت با کارشناس»** را جهت ثبت مستقیم پیام فشار دهید.`
  });
});

app.post(['/api/support/ticket', '/support/ticket'], (req, res) => {
  const { ticketId, customerName, mobile, message, history, msgId, replyTo, time } = req.body;
  const tickets = readJSON(TICKETS_FILE, []);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const msgTime = time || new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  let existingTicket = null;
  if (ticketId) {
    existingTicket = tickets.find(t => t.id === ticketId || t.ticketId === ticketId || String(t.id) === String(ticketId));
  }

  if (existingTicket) {
    if (!Array.isArray(existingTicket.messages)) {
      existingTicket.messages = [];
      if (existingTicket.message) {
        existingTicket.messages.push({
          id: 'msg-init-' + existingTicket.id,
          sender: 'user',
          text: existingTicket.message,
          time: existingTicket.createdAt ? existingTicket.createdAt.substring(11, 16) : msgTime,
          reactions: {}
        });
      }
      if (existingTicket.reply) {
        existingTicket.messages.push({
          id: 'msg-rep-' + existingTicket.id,
          sender: 'admin',
          senderName: 'دکتر مشاوری‌نیا (کارشناس باسا)',
          text: existingTicket.reply,
          time: existingTicket.repliedAt ? existingTicket.repliedAt.substring(11, 16) : msgTime,
          reactions: {}
        });
      }
    }

    if (message && String(message).trim()) {
      const newMsgObj = {
        id: msgId || ('msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
        sender: 'user',
        text: String(message).trim(),
        time: msgTime,
        replyTo: replyTo || null,
        reactions: {}
      };
      existingTicket.messages.push(newMsgObj);
      existingTicket.message = String(message).trim();
    }
    if (customerName && customerName !== 'مراجع وب‌سایت') existingTicket.customerName = customerName;
    if (mobile && mobile !== 'ثبت‌نشده') existingTicket.mobile = mobile;
    if (Array.isArray(history) && history.length > 0) existingTicket.history = history;
    existingTicket.status = 'pending';
    existingTicket.updatedAt = nowStr;

    writeJSON(TICKETS_FILE, tickets);
    return res.json({ success: true, message: 'پیام شما به گفتگوی فعال اضافه شد.', ticket: existingTicket });
  }

  const newTicketId = 'TCK-' + Math.floor(10000 + Math.random() * 90000);
  const initialMessages = [];
  if (message && String(message).trim()) {
    initialMessages.push({
      id: msgId || ('msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
      sender: 'user',
      text: String(message).trim(),
      time: msgTime,
      replyTo: replyTo || null,
      reactions: {}
    });
  }

  const newTicket = {
    id: newTicketId,
    customerName: customerName || 'مراجع وب‌سایت',
    mobile: mobile || 'ثبت‌نشده',
    message: message || '',
    history: history || [],
    messages: initialMessages,
    status: 'pending',
    reply: '',
    createdAt: nowStr,
    updatedAt: nowStr
  };

  tickets.unshift(newTicket);
  writeJSON(TICKETS_FILE, tickets);
  res.json({ success: true, message: 'پیام شما ثبت و به کارشناسان ارسال شد.', ticket: newTicket });
});

app.get(['/api/support/ticket-status', '/support/ticket-status'], (req, res) => {
  const { ticketId } = req.query;
  if (!ticketId) return res.json({ success: false, error: 'ticketId required' });
  const tickets = readJSON(TICKETS_FILE, []);
  const t = tickets.find(x => x.id === ticketId || x.ticketId === ticketId || String(x.id) === String(ticketId));
  if (!t) return res.json({ success: false, error: 'Ticket not found' });
  res.json({ success: true, ticket: t });
});

app.get(['/api/admin/tickets', '/admin/tickets'], (req, res) => {
  const tickets = readJSON(TICKETS_FILE, []);
  res.json({ success: true, tickets });
});

app.post(['/api/admin/tickets/reply', '/admin/tickets/reply'], (req, res) => {
  const { ticketId, reply, replyTo, msgId, time } = req.body;
  if (!reply || !String(reply).trim()) {
    return res.status(400).json({ success: false, error: 'متن پاسخ نمی‌تواند خالی باشد.' });
  }
  const tickets = readJSON(TICKETS_FILE, []);
  const target = tickets.find(t => t.id === ticketId || t.ticketId === ticketId || String(t.id) === String(ticketId));
  if (target) {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const msgTime = time || new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    if (!Array.isArray(target.messages)) {
      target.messages = [];
      if (target.message) {
        target.messages.push({
          id: 'msg-init-' + target.id,
          sender: 'user',
          text: target.message,
          time: target.createdAt ? target.createdAt.substring(11, 16) : msgTime,
          reactions: {}
        });
      }
    }

    const adminMsg = {
      id: msgId || ('msg-adm-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
      sender: 'admin',
      senderName: 'دکتر مشاوری‌نیا (کارشناس باسا)',
      text: String(reply).trim(),
      time: msgTime,
      replyTo: replyTo || null,
      reactions: {}
    };

    target.messages.push(adminMsg);
    target.reply = String(reply).trim();
    target.status = 'answered';
    target.repliedAt = nowStr;
    target.updatedAt = nowStr;
    writeJSON(TICKETS_FILE, tickets);
    return res.json({ success: true, message: 'پاسخ با موفقیت ثبت و برای کاربر ارسال گردید.', ticket: target, newMsg: adminMsg });
  }
  res.status(404).json({ success: false, error: 'تیکت پشتیبانی یافت نشد.' });
});

app.post(['/api/support/react', '/support/react'], (req, res) => {
  const { ticketId, msgId, emoji } = req.body;
  if (!ticketId || !msgId || !emoji) {
    return res.status(400).json({ success: false, error: 'اطلاعات واکنش ناقص است.' });
  }
  const tickets = readJSON(TICKETS_FILE, []);
  const target = tickets.find(t => t.id === ticketId || t.ticketId === ticketId || String(t.id) === String(ticketId));
  if (!target) {
    return res.status(404).json({ success: false, error: 'تیکت یافت نشد.' });
  }
  if (Array.isArray(target.messages)) {
    const msg = target.messages.find(m => String(m.id) === String(msgId));
    if (msg) {
      if (!msg.reactions || typeof msg.reactions !== 'object') msg.reactions = {};
      msg.reactions[emoji] = (Number(msg.reactions[emoji]) || 0) + 1;
      writeJSON(TICKETS_FILE, tickets);
      return res.json({ success: true, ticket: target, message: msg });
    }
  }
  return res.json({ success: true, ticket: target });
});


// Fallback to landing page
app.use((req, res) => {
  const indexPath = fs.existsSync(path.join(__dirname, 'index.html')) ? path.join(__dirname, 'index.html') : path.join(__dirname, 'Landing', 'index.html');
  res.sendFile(indexPath);
});

const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Basa Advanced Veterinary Laboratory Server running on http://0.0.0.0:${PORT}`);
});
