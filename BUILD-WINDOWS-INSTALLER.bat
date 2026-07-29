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

echo Installing and updating dependencies...
call npm install
if errorlevel 1 goto :failed

echo Building JoeAnimeDB and the Windows installer...
call npm run pack:win
if errorlevel 1 goto :failed

echo.
echo SUCCESS!
echo Release files are in:
echo   dist-desktop
echo.
echo Keep the installer, its blockmap file, and latest.yml together.
echo All three are required for automatic updates.
echo.
start "" "%CD%\dist-desktop"
pause
exit /b 0

:failed
echo.
echo BUILD FAILED. Scroll up for the first error message.
pause
exit /b 1
