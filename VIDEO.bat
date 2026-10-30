@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Regista - video YouTube
git pull -q
node pc\video.mjs
echo.
pause
