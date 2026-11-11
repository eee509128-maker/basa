<?php
function zibalRequest($amount, $orderId, $callbackUrl, $description = '') {
    $data = [
        'merchant' => ZIBAL_MERCHANT,
        'amount' => $amount,
        'callbackUrl' => $callbackUrl,
        'orderId' => $orderId,
        'description' => $description
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, ZIBAL_API);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}

function zibalVerify($trackId) {
    $data = [
        'merchant' => ZIBAL_MERCHANT,
        'trackId' => $trackId
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, ZIBAL_VERIFY);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}