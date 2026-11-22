<?php
/**
 * Order form handler (PHP hosting with a working mail() function).
 *
 * 1) Put the address that should receive orders into $TO.
 * 2) Put a sender address into $FROM — ideally an address on your own domain, otherwise mail goes to spam.
 * No PHP on your hosting? Point "formEndpoint" in src/config.json to any form service
 * (Formspree, Web3Forms ...) or to your own handler, then run `node build.mjs`.
 */
header('Content-Type: application/json; charset=utf-8');

$TO   = 'iclean.information@gmail.com';   // <- recipient of orders (admin e-mail of the old site) — change if needed
$FROM = 'no-reply@icleaning.com.ua';      // <- sender; use an address on your domain
$SUBJECT_PREFIX = 'iCleaning: нова заявка з сайту';

function fail($code = 400) { http_response_code($code); echo json_encode(['ok' => false]); exit; }
function clean($v, $max = 500) {
    $v = is_string($v) ? $v : '';
    $v = trim(preg_replace('/[\r\n\t]+/u', ' ', $v));   // no line breaks: protects against header injection
    return mb_substr($v, 0, $max);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405);
if (!empty($_POST['botcheck']) || !empty($_POST['website'])) { echo json_encode(['ok' => true]); exit; }   // honeypot for bots

$name    = clean($_POST['name']    ?? '', 100);
$phone   = clean($_POST['phone']   ?? '', 40);
$comment = clean($_POST['comment'] ?? '', 1000);
$details = clean($_POST['details'] ?? '', 1000);
$page    = clean($_POST['page']    ?? '', 200);
$lang    = clean($_POST['lang']    ?? '', 5);

if ($name === '' || strlen(preg_replace('/\D/', '', $phone)) < 9) fail(422);

$lines = ["Name: $name", "Phone: $phone"];
if ($comment !== '') $lines[] = "Comment: $comment";
if ($details !== '') $lines[] = "Details: $details";
$lines[] = "Page: $page ($lang)";
$lines[] = 'Time: ' . date('Y-m-d H:i:s');

$headers = "From: $FROM\r\nContent-Type: text/plain; charset=UTF-8\r\n";
$subject = '=?UTF-8?B?' . base64_encode($SUBJECT_PREFIX) . '?=';
$ok = mail($TO, $subject, implode("\n", $lines), $headers);

if (!$ok) fail(500);
echo json_encode(['ok' => true]);
