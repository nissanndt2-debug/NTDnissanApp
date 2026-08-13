@echo off
set SCRIPT_DIR=%~dp0
set ENV_FILE=%SCRIPT_DIR%.env.local
if not exist "%ENV_FILE%" set ENV_FILE=%SCRIPT_DIR%.env
set RELOAD_FLAG=--reload
if /I "%NODE_ENV%"=="production" set RELOAD_FLAG=

"%SCRIPT_DIR%venv\Scripts\python.exe" -m uvicorn main:app --app-dir "%SCRIPT_DIR%" --env-file "%ENV_FILE%" --host 127.0.0.1 --port 3001 %RELOAD_FLAG%
