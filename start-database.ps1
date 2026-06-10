# Start local PostgreSQL with Docker (Windows)
# Usage: .\start-database.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker not found. Install and start Docker Desktop."
}

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker is not running. Start Docker Desktop first."
}

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    throw ".env file not found."
}

$line = Get-Content $envFile | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1
$databaseUrl = $line -replace '^DATABASE_URL="?', '' -replace '"?$', ''

$pattern = '^postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)$'
if ($databaseUrl -notmatch $pattern) {
    throw "Invalid DATABASE_URL format."
}

$dbUser = $Matches[1]
$dbPassword = $Matches[2]
$dbPort = $Matches[4]
$dbName = $Matches[5]
$containerName = "$dbName-postgres"

$running = docker ps -q -f "name=$containerName"
if ($running) {
    Write-Host "Container '$containerName' is already running."
    exit 0
}

$stopped = docker ps -aq -f "name=$containerName"
if ($stopped) {
    docker start $containerName | Out-Null
    Write-Host "Started existing container '$containerName'."
    exit 0
}

docker run -d --name $containerName -e "POSTGRES_USER=$dbUser" -e "POSTGRES_PASSWORD=$dbPassword" -e "POSTGRES_DB=$dbName" -p "${dbPort}:5432" docker.io/postgres | Out-Null

Write-Host "Created and started container '$containerName'."
Write-Host "Next: npx prisma db push"
