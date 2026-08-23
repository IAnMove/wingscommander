@echo off
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Falta dist. Generalo una vez con:
  echo   npm install
  echo   npm run build
  pause
  exit /b 1
)
start "" "%~dp0dist\index.html"
