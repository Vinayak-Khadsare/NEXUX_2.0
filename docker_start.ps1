# NEXUS Docker Desktop Startup Script

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       Starting NEXUS with Docker Desktop        " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot
docker compose up -d

Write-Host "`nNEXUS containers are active in Docker Desktop!" -ForegroundColor Green
Write-Host "Frontend App : http://localhost:3000" -ForegroundColor White
Write-Host "Backend API  : http://localhost:8000" -ForegroundColor White
Write-Host "API Swagger  : http://localhost:8000/docs" -ForegroundColor White
Write-Host "MongoDB Port : 27018" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
