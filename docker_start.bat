@echo off
echo ===================================================
echo         Starting NEXUS with Docker Desktop
echo ===================================================

cd /d %~dp0
docker compose up -d

echo.
echo ===================================================
echo NEXUS containers are running in Docker Desktop!
echo Frontend App : http://localhost:3000
echo Backend API  : http://localhost:8000
echo API Docs     : http://localhost:8000/docs
echo MongoDB Port : 27018
echo ===================================================
pause
