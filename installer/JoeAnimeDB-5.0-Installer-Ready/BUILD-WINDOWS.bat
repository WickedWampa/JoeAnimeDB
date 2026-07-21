@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  JoeAnimeDB 5.0 Windows Builder
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not on PATH.
  echo Install Node.js 22 LTS, then run this file again.
  pause
  exit /b 1
)

echo [1/4] Installing exact dependencies...
call npm ci
if errorlevel 1 goto :failed

echo [2/4] Rebuilding native SQLite module for Electron...
call npx electron-rebuild -f -w better-sqlite3
if errorlevel 1 goto :failed

echo [3/4] Building the React application...
call npm run build
if errorlevel 1 goto :failed

echo [4/4] Creating installer and portable EXE...
call npx electron-builder --win nsis portable
if errorlevel 1 goto :failed

echo.
echo SUCCESS: Open the dist-desktop folder for the new files.
start "" "%~dp0dist-desktop"
pause
exit /b 0

:failed
echo.
echo BUILD FAILED. Read the error above.
pause
exit /b 1
