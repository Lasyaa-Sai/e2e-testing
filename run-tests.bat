@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo  E2E Harness Run
echo ========================================
echo.

if not exist "app\node_modules" (
  echo ERROR: app dependencies are missing. Run setup.bat first.
  exit /b 1
)

if not exist "harness\node_modules" (
  echo ERROR: harness dependencies are missing. Run setup.bat first.
  exit /b 1
)

start "Backend" /B cmd /c "cd /d ""%~dp0app"" && node server.js"
echo Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5000/health >nul 2>&1
if errorlevel 1 goto wait_backend

start "App" /B cmd /c "cd /d ""%~dp0app"" && npm start"
echo Waiting for app...
:wait_app
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 goto wait_app

cd /d "%~dp0harness"
node cli.js --config ..\tests\test_cases.yaml --output ..\report.json
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Report written to report.json
exit /b %EXIT_CODE%
