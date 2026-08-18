@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo JoeAnimeDB Beta 20 Version Identity Fix
echo ========================================
echo.
node scripts\applyBeta20VersionFix.mjs
if errorlevel 1 (
  echo.
  echo FIX FAILED - nothing will be pushed.
  pause
  exit /b 1
)
echo.
echo Running release gate...
call npm run test:release
if errorlevel 1 (
  echo.
  echo Release gate still has a failure. Send ChatGPT the output.
  pause
  exit /b 1
)
echo.
echo ========================================
echo BETA 20 RELEASE GATE PASSED
echo ========================================
pause
