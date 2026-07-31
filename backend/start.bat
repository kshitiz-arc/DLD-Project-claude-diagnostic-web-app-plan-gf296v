@echo off
REM =====================================================================
REM  HYPERION - one-click single-host start for the lab (plan section 9).
REM
REM  Builds the frontend to static assets, then serves the API *and* the
REM  app from one uvicorn worker bound to 0.0.0.0 so every lab PC on the
REM  hotspot / LAN can reach it. A single worker is deliberate: it sidesteps
REM  SQLite multi-process write contention entirely.
REM
REM  Optional environment overrides:
REM    PORT=8000                     port to serve on
REM    HYPERION_ADMIN_PASSCODE=...   admin gate (CHANGE THIS before a pilot)
REM    HYPERION_SEED_DEMO=0          do not create the synthetic demo cohort
REM    HYPERION_BACKUP_MINUTES=15    snapshot interval (0 disables)
REM =====================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%~dp0.."

if "%PORT%"=="" set "PORT=8000"
if "%HYPERION_DB%"=="" set "HYPERION_DB=%~dp0hyperion.db"
if "%HYPERION_BACKUP_DIR%"=="" set "HYPERION_BACKUP_DIR=%~dp0backups"

echo.
echo  HYPERION - Class 7 Maths diagnostic
echo  ----------------------------------
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo  [X] Python is not on PATH. Install Python 3.9+ and re-run.
  pause & exit /b 1
)

echo  [1/4] Installing Python packages...
python -m pip install -q -e "%ROOT%" || goto :pipfail
python -m pip install -q -r "%~dp0requirements.txt" || goto :pipfail

echo  [2/4] Building the frontend (offline-safe static assets)...
where npm >nul 2>&1
if errorlevel 1 (
  echo        npm not found - skipping the build.
  echo        The API will run, but the app is only served if frontend\dist exists.
) else (
  pushd "%ROOT%\frontend"
  if not exist node_modules ( call npm install --no-audit --no-fund )
  call npm run build || ( popd & goto :buildfail )
  popd
)

echo  [3/4] Opening port %PORT% in Windows Firewall (needs admin; safe to fail)...
netsh advfirewall firewall show rule name="HYPERION %PORT%" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="HYPERION %PORT%" dir=in action=allow ^
    protocol=TCP localport=%PORT% profile=private,domain >nul 2>&1
  if errorlevel 1 (
    echo        Could not add the rule - run this script as Administrator once,
    echo        or add an inbound TCP rule for port %PORT% by hand.
  ) else (
    echo        Added inbound rule "HYPERION %PORT%" ^(private + domain networks^).
  )
) else (
  echo        Firewall rule already present.
)

echo  [4/4] Starting the server...
echo.
echo  Students open one of these on each lab PC:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  set "IP=%%A"
  set "IP=!IP: =!"
  echo      http://!IP!:%PORT%
)
echo.
echo  Put the join address on the projector:  http://localhost:%PORT%/lan
echo  Teacher console:                        http://localhost:%PORT%/console
echo  Stop the server with Ctrl+C.
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%
goto :eof

:pipfail
echo  [X] Package install failed. Check the messages above.
pause & exit /b 1

:buildfail
echo  [X] Frontend build failed. Check the messages above.
pause & exit /b 1
