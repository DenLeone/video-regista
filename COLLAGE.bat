@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Regista - collage 4K
set /p NOME=Nome del progetto (cartella in work\collage): 
node pc\collage.mjs %NOME% %*
echo.
pause
