@echo off
rem Documentario in locale (AI sul PC, timeline in DaVinci con grafica Tech e sottotitoli WATER).
rem Uso: trascina il VIDEO su questo file, oppure doppio clic e sceglilo.
rem Le immagini, GIF, clip e l'eventuale voce registrata a parte stanno nella STESSA cartella del video.
rem DaVinci va tenuto CHIUSO: lo apre lo script all'ultimo passo.
chcp 65001 >nul
setlocal
set "VIDEO=%~1"
if "%VIDEO%"=="" for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Video del documentario'; $d.Filter = 'Video|*.mp4;*.mov;*.m4v'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"`) do set "VIDEO=%%f"
if "%VIDEO%"=="" exit /b
for %%f in ("%VIDEO%") do set "CARTELLA=%%~dpf"
set "CARTELLA=%CARTELLA:~0,-1%"
cd /d C:\regista
echo Video:    %VIDEO%
echo Immagini: %CARTELLA%
echo.
node pc\locale\documentario.mjs "%VIDEO%" "%CARTELLA%"
powershell -NoProfile -Command "[console]::beep(880,400); [console]::beep(1100,400)"
echo.
pause
