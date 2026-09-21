# NEXUS Docker Desktop Stop Script

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       Stopping NEXUS Docker Desktop Services    " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot
docker compose down

Write-Host "`nAll NEXUS containers have been stopped." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
