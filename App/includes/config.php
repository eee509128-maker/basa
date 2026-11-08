<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'basalabo_Orders');
define('DB_USER', 'basalabo_orders');
define('DB_PASS', 'S.sarvari1234?');

define('BASE_URL', 'http://basalaboratory.ir/');


define('TEST_MODE', 'true');

define('ZIBAL_MERCHANT_REAL', 'your_zibal_merchant_code');
define('ZIBAL_API', 'https://api.zibal.ir/v1/request');
define('ZIBAL_VERIFY', 'https://api.zibal.ir/v1/verify');
define('ZIBAL_GATEWAY', 'https://gateway.zibal.ir/start/');



define('MSG_APIKEY', '1857737a1e5adcc1af7ed9a3cf6f4710'); 
define('SMS_TEMPLATE_ID', 21267); 



if (TEST_MODE == 'true') {
    define('ZIBAL_MERCHANT', 'zibal');
    
} else if (TEST_MODE == 'false'){
    define('ZIBAL_MERCHANT',ZIBAL_MERCHANT_REAL );
    
}