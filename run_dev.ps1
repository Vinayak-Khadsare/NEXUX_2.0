# NEXUS Local Development Startup Script

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "           Starting NEXUS Platform               " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

# Check MongoDB
$mongoConn = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if ($mongoConn) {
    Write-Host "[OK] MongoDB is active on port 27017." -ForegroundColor Green
} else {
    Write-Host "[NOTICE] MongoDB is not detected on port 27017." -ForegroundColor Yellow
    Write-Host "If using Docker, run: docker compose up -d mongodb" -ForegroundColor Yellow
}

# Start Backend
Write-Host "[1/2] Starting FastAPI Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\venv\Scripts\activate; uvicorn app.main:app --reload --port 8000"

# Start Frontend
Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host "`nAll NEXUS services are launching!" -ForegroundColor Cyan
Write-Host "Backend API  : http://localhost:8000" -ForegroundColor White
Write-Host "API Swagger  : http://localhost:8000/docs" -ForegroundColor White
Write-Host "Frontend App : http://localhost:3000" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
