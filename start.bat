@echo off
setlocal

cd /d "%~dp0"

echo [1/2] Starting web server on http://localhost:8888 ...
start "AI Image Web" cmd /k "npx serve . -l 8888"

echo [2/2] Starting local proxy on http://localhost:8787 ...
start "AI Image Proxy" cmd /k "node proxy-server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:8888"

echo Done. You can close this window.
endlocal
