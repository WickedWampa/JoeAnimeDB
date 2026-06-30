@echo off
cd /d "%~dp0"
npm install
npm run build
npm run pack:win
pause
