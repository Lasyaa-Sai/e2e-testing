@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo SPARK AAC E2E Harness Setup
echo ========================================
echo.

echo [1/7] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    exit /b 1
)
node --version

echo.
echo [2/7] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: Python is not installed. The harness can still run, but some optional utilities will be unavailable.
    set PYTHON_AVAILABLE=0
) else (
    python --version
    set PYTHON_AVAILABLE=1
)

echo.
echo [3/7] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo WARNING: FFmpeg is not installed. Browser playback still works, but external audio inspection will be limited.
) else (
    echo FFmpeg found
)

echo.
echo [4/7] Installing app dependencies...
cd /d "%~dp0app"
call npm install
if errorlevel 1 exit /b 1

echo.
echo [5/7] Installing harness dependencies...
cd /d "%~dp0harness"
call npm install
if errorlevel 1 exit /b 1
call npx playwright install chromium
if errorlevel 1 exit /b 1

echo.
echo [6/7] Preparing optional Python environment...
cd /d "%~dp0"
if "%PYTHON_AVAILABLE%"=="1" (
    if exist ".venv\Scripts\activate.bat" (
        call .venv\Scripts\activate.bat
    ) else (
        python -m venv .venv
        call .venv\Scripts\activate.bat
    )
    python -m pip install --upgrade pip
    python -m pip install pyyaml
    if errorlevel 1 exit /b 1
) else (
    echo Skipping Python venv setup because Python is unavailable.
)

echo.
echo [7/7] Generating sample audio assets...
cd /d "%~dp0"
node tests\create_audio_assets.js
if errorlevel 1 exit /b 1

echo.
echo ========================================
echo Setup complete
echo ========================================
echo.
echo Next:
echo   1. Start the backend: cd app ^&^& node server.js
echo   2. Start the app:     cd app ^&^& npm start
echo   3. Run the harness:   cd harness ^&^& node cli.js
echo.
