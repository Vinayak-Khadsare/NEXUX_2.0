@echo off
echo ===================================================
echo               Starting NEXUS Platform
echo ===================================================

echo [1/3] Checking MongoDB...
sc query MongoDB >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Please ensure MongoDB is running on localhost:27017 or via Docker.
)

echo [2/3] Launching FastAPI Backend on http://localhost:8000...
start "NEXUS Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

echo [3/3] Launching Next.js Frontend on http://localhost:3000...
start "NEXUS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo ===================================================
echo NEXUS services launched!
echo Backend API : http://localhost:8000
echo API Docs    : http://localhost:8000/docs
echo Frontend App: http://localhost:3000
echo ===================================================
