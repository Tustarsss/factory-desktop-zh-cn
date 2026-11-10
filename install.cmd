@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.12 或更高版本。
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 goto failed
)
node scripts/patch.mjs install
if errorlevel 1 goto failed
pause
exit /b 0
:failed
echo 操作失败，请查看上方提示。
pause
exit /b 1
