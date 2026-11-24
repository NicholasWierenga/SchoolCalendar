$ErrorActionPreference = 'Stop'
$clientDirectory = Join-Path $PSScriptRoot 'schoolcalendar.client'

Push-Location -LiteralPath $clientDirectory
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Installing the frontend dependencies failed.' }
    }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Building the frontend failed.' }
} finally {
    Pop-Location
}

dotnet run --project (Join-Path $PSScriptRoot 'SchoolCalendar.Server/SchoolCalendar.Server.csproj')
exit $LASTEXITCODE
