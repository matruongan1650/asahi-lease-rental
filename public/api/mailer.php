<?php
declare(strict_types=1);

function mail_cfg(): array
{
    $cfgFile = __DIR__ . '/config.php';
    if (!file_exists($cfgFile)) {
        throw new RuntimeException('config.php not found');
    }
    $cfg = require $cfgFile;
    return $cfg['smtp'] ?? [];
}

function smtp_read($fp): string
{
    $data = '';
    while (($line = fgets($fp, 515)) !== false) {
        $data .= $line;
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    return $data;
}

function smtp_expect($fp, array $codes): string
{
    $res = smtp_read($fp);
    $code = substr($res, 0, 3);
    if (!in_array($code, $codes, true)) {
        throw new RuntimeException('SMTP unexpected response: ' . trim($res));
    }
    return $res;
}

function smtp_cmd($fp, string $cmd, array $codes): string
{
    fwrite($fp, $cmd . "\r\n");
    return smtp_expect($fp, $codes);
}

function mime_header(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function clean_mail_address(string $mail): string
{
    $mail = trim($mail);
    if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('invalid email address');
    }
    return $mail;
}

function send_smtp_mail(string $to, string $subject, string $body): array
{
    $smtp = mail_cfg();
    if (empty($smtp['host']) || empty($smtp['user']) || empty($smtp['pass'])) {
        throw new RuntimeException('SMTP settings are not configured');
    }

    $host = (string) $smtp['host'];
    $port = (int) ($smtp['port'] ?? 465);
    $secure = (string) ($smtp['secure'] ?? 'ssl');
    $user = (string) $smtp['user'];
    $pass = str_replace(' ', '', (string) $smtp['pass']);
    $from = clean_mail_address((string) ($smtp['from'] ?? $user));
    $fromName = (string) ($smtp['from_name'] ?? 'ASAHI LEASE');
    $to = clean_mail_address($to);

    $target = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $fp = @stream_socket_client($target, $errno, $errstr, 30, STREAM_CLIENT_CONNECT);
    if (!$fp) {
        throw new RuntimeException("SMTP connect failed: {$errstr} ({$errno})");
    }
    stream_set_timeout($fp, 30);

    smtp_expect($fp, ['220']);
    smtp_cmd($fp, 'EHLO shuyei.online', ['250']);
    if ($secure === 'tls') {
        smtp_cmd($fp, 'STARTTLS', ['220']);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('STARTTLS failed');
        }
        smtp_cmd($fp, 'EHLO shuyei.online', ['250']);
    }
    smtp_cmd($fp, 'AUTH LOGIN', ['334']);
    smtp_cmd($fp, base64_encode($user), ['334']);
    smtp_cmd($fp, base64_encode($pass), ['235']);
    smtp_cmd($fp, 'MAIL FROM:<' . $from . '>', ['250']);
    smtp_cmd($fp, 'RCPT TO:<' . $to . '>', ['250', '251']);
    smtp_cmd($fp, 'DATA', ['354']);

    $headers = [
        'From: ' . mime_header($fromName) . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: ' . mime_header($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'Date: ' . date(DATE_RFC2822),
    ];
    $message = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body));
    fwrite($fp, str_replace("\n.", "\n..", $message) . "\r\n.\r\n");
    smtp_expect($fp, ['250']);
    // 250 受領 = メールは受理済み。以降の QUIT/切断失敗で例外を投げない
    //（投げると呼び出し側の claim 取消→翌クロンで同一顧客へ二重送信になるため）。
    try { smtp_cmd($fp, 'QUIT', ['221']); } catch (Throwable $e) { /* already accepted */ }
    @fclose($fp);

    return ['ok' => true, 'to' => $to];
}
