@echo off
REM =====================================================================
REM  HYPERION - start an ALREADY SET-UP install (no install, no build).
REM
REM  Use this to run and test day to day. Use backend\start.bat instead
REM  when dependencies or the frontend need (re)building - typically the
REM  first run on a new machine, or after pulling changes.
REM =====================================================================
setlocal
cd /d "%~dp0backend"

if "%PORT%"=="" set "PORT=8000"
if "%HYPERION_DB%"=="" set "HYPERION_DB=%~dp0backend\hyperion.db"
if "%HYPERION_BACKUP_DIR%"=="" set "HYPERION_BACKUP_DIR=%~dp0backend\backups"

echo.
echo   HYPERION - Class 7 Maths diagnostic
echo   ===================================
echo.
echo   Student app     http://localhost:%PORT%
echo   Teacher console http://localhost:%PORT%/console
echo   Projector page  http://localhost:%PORT%/lan
echo   API docs        http://localhost:%PORT%/docs
echo.
echo   On other PCs, use one of these instead of localhost:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  set "IP=%%A"
  setlocal EnableDelayedExpansion
  echo       http://!IP: =!:%PORT%
  endlocal
)
echo.
echo   Ctrl+C to stop.
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%
