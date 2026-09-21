@echo off
echo ===================================================
echo         Stopping NEXUS Docker Desktop Services
echo ===================================================

cd /d %~dp0
docker compose down

echo.
echo ===================================================
echo All NEXUS containers stopped.
echo ===================================================
pause
