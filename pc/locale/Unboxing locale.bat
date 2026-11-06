@echo off
rem Stile UNBOXING in locale: solo le riprese del prodotto (niente presentatore), montate sul battito della musica,
rem con titolo, schede delle caratteristiche e chiusura. Timeline in DaVinci.
rem Uso: trascina la CARTELLA con le clip su questo file, oppure doppio clic e sceglila.
rem Nella cartella: le clip, le immagini delle caratteristiche (il nome del file e' il testo) e, se vuoi, prodotto.txt
rem (prima riga il nome del prodotto, poi una caratteristica per riga).
rem DaVinci va tenuto CHIUSO: lo apre lo script all'ultimo passo.
chcp 65001 >nul
setlocal
set "CARTELLA=%~1"
if "%CARTELLA%"=="" for /f "usebackq delims=" %%f in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Cartella con le clip dell unboxing'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"`) do set "CARTELLA=%%f"
if "%CARTELLA%"=="" exit /b
rem trascinato un file invece della cartella: uso la sua cartella
if not exist "%CARTELLA%\" for %%f in ("%CARTELLA%") do set "CARTELLA=%%~dpf"
if "%CARTELLA:~-1%"=="\" set "CARTELLA=%CARTELLA:~0,-1%"
cd /d C:\regista
echo Cartella: %CARTELLA%
echo.
node pc\locale\unboxing.mjs "%CARTELLA%"
powershell -NoProfile -Command "[console]::beep(880,400); [console]::beep(1100,400)"
echo.
pause
