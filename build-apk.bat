@echo off
chcp 65001 > nul
echo ============================================================================
echo   Gisa — Gerador de Aplicativo Android (Capacitor APK)
echo ============================================================================
echo.

echo [1/4] Empacotando arquivos web na pasta www...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao empacotar arquivos web.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] Sincronizando com a plataforma Android (Capacitor Sync)...
call npx cap sync android
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Criando plataforma Android pela primeira vez...
    call npx cap add android
    call npx cap sync android
)

echo.
echo [3/4] Verificando ambiente Java e Gradle...
where java >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] O compilador Java (JDK) não foi detectado no PATH do Windows.
    echo.
    echo Opções disponíveis:
    echo 1. Abra o projeto no Android Studio executando: npx cap open android
    echo 2. Ou suba para o GitHub para gerar o APK automaticamente pelo GitHub Actions.
    echo.
    echo Deseja abrir o Android Studio agora? (S/N)
    set /p OPEN_AS=
    if /i "%OPEN_AS%"=="S" (
        npx cap open android
    )
    pause
    exit /b 0
)

echo.
echo [4/4] Compilando APK em modo Debug...
cd android
call gradlew.bat assembleDebug
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================================
    echo   SUCESSO! APK gerado com êxito em:
    echo   android\app\build\outputs\apk\debug\app-debug.apk
    echo ============================================================================
    explorer app\build\outputs\apk\debug
) else (
    echo.
    echo [ERRO] Falha ao compilar com Gradle.
)
cd ..
pause
