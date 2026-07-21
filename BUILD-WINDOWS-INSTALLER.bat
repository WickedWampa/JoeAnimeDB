@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   JoeAnimeDB 5.0 Beta Installer Builder
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install the current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

echo Building JoeAnimeDB and the Windows installer...
call npm run installer:win
if errorlevel 1 goto :failed

echo.
echo SUCCESS!
echo Installer output:
echo   dist-desktop\JoeAnimeDB-5.0-Beta-Setup-x64.exe
echo.
start "" "%CD%\dist-desktop"
pause
exit /b 0

:failed
echo.
echo BUILD FAILED. Scroll up for the first error message.
pause
exit /b 1
