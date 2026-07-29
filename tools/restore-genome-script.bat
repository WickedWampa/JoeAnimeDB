@echo off
setlocal

cd /d "%~dp0\.."

if not exist "scripts" mkdir "scripts"

set "SOURCE=..\Archive\scripts\generateMissingGenomesForList.cjs"
set "TARGET=scripts\generateMissingGenomesForList.cjs"

if not exist "%SOURCE%" (
  echo.
  echo Could not find:
  echo %SOURCE%
  echo.
  echo Run this file from the active JoeAnimeDB project after placing the
  echo patch folders into the project root.
  pause
  exit /b 1
)

copy /Y "%SOURCE%" "%TARGET%"
if errorlevel 1 (
  echo Copy failed.
  pause
  exit /b 1
)

echo.
echo Restored:
echo %TARGET%
echo.
pause
