@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not "%~1"=="" set "HOST=%~1"
if "%HOST%"=="" set "HOST=127.0.0.1"

if not "%~2"=="" set "PORT=%~2"
if "%PORT%"=="" set "PORT=8000"

set "PYTHON_CMD="
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import http.server" >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=python"
)
if "%PYTHON_CMD%"=="" (
  where python3 >nul 2>nul
  if not errorlevel 1 (
    python3 -c "import http.server" >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python3"
  )
)
if "%PYTHON_CMD%"=="" (
  echo Python was not found. Install Python 3 or add it to PATH.
  exit /b 1
)

:find_port
"%PYTHON_CMD%" -c "import socket,sys; s=socket.socket(); s.bind((sys.argv[1], int(sys.argv[2])))" "%HOST%" "%PORT%" >nul 2>nul
if errorlevel 1 (
  set /a PORT+=1
  goto find_port
)

echo Serving Z-Babel on http://%HOST%:%PORT%/
echo Bind address: %HOST%
echo Port: %PORT%
echo.
echo Use launch.bat 0.0.0.0 to bind on all interfaces.
"%PYTHON_CMD%" -m http.server "%PORT%" --bind "%HOST%"
