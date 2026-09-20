@echo off
chcp 65001 >nul
title Discord MFA Sniper v2.1
color 0B

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║      DISCORD MFA SNIPER v2.1                 ║
echo  ║      Windows VDS Edition                     ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: ── Node.js kontrol ──
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Node.js bulunamadi!
    echo Indir: https://nodejs.org/
    pause
    exit /b 1
)

:: ── node_modules kontrol ──
if not exist "node_modules" (
    echo [BILGI] node_modules yok, npm install calistiriliyor...
    call npm install axios discord-mfa dotenv
    if %errorlevel% neq 0 (
        echo [HATA] npm install basarisiz!
        pause
        exit /b 1
    )
)

:: ── .env kontrol ──
if not exist ".env" (
    echo [HATA] .env dosyasi yok!
    echo Lutfen .env dosyasini olustur ve doldur.
    pause
    exit /b 1
)

:: ── logs klasoru ──
if not exist "logs" mkdir logs

:: ── Baslat ──
echo [BILGI] Sniper baslatiliyor...
echo.
node sniper.js

:: ── Cikis ──
echo.
echo [BILGI] Sniper durdu. Cikis kodu: %errorlevel%
pause
