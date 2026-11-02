@echo off
setlocal
set "ROOT=%~dp0"
set "PORTABLE=%ROOT%..\..\.tools\node-v26.13.0-win-x64"
if not exist "%PORTABLE%\node.exe" set "PORTABLE=%ROOT%..\.tools\node-v26.13.0-win-x64"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%PORTABLE%\node.exe" (
    set "PATH=%PORTABLE%;%PATH%"
    echo Using portable Node.js from .tools
  ) else (
    echo Node.js 20.9+ is required. Install it from https://nodejs.org
    exit /b 1
  )
)

cd /d "%ROOT%"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund || exit /b 1
)
if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo Created .env from .env.example. Review LLM_API_KEY, DEMO_AUTH and NEXT_PUBLIC_SITE_URL before production.
)

if /i "%1"=="prod" (
  echo Building production bundle...
  call npm run build || exit /b 1
  echo Starting production server on http://localhost:3000
  call npm start
) else (
  echo Starting development server on http://localhost:3000
  call npm run dev
)
