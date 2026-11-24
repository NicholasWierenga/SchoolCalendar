param(
    [Parameter(Mandatory)][string]$SpecDirectory,
    [ValidateRange(1024,65535)][int]$Port = 5196
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$spec = (Resolve-Path -LiteralPath $SpecDirectory).Path
$verifier = Join-Path $spec 'verify.mjs'
if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) { throw 'Choose the folder containing verify.mjs.' }

$database = 'SchoolCalendarTest_' + [Guid]::NewGuid().ToString('N')
$url = "http://127.0.0.1:$Port"
$variables = @{
    CANDIDATE_ROOT = $root
    PROJECT_CONFIG = Join-Path $root 'project-checks.json'
    CONTRACT_ADAPTER = Join-Path $PSScriptRoot 'acceptance-adapter.mjs'
    PERSISTENCE_ADAPTER = Join-Path $PSScriptRoot 'acceptance-adapter.mjs'
    EXERCISE_UI_FIXTURES = Join-Path $PSScriptRoot 'browser-fixtures.json'
    EXERCISE_BASE_URL = $url
    EXERCISE_BROWSER = 'edge'
    ASPNETCORE_URLS = $url
    Calendar__SeedDemoData = 'true'
    ConnectionStrings__SchoolCalendar = "Server=(localdb)\MSSQLLocalDB;Database=$database;Integrated Security=True;TrustServerCertificate=True"
    SCHOOLCALENDAR_TEST_SQL_CONNECTION = 'Server=(localdb)\MSSQLLocalDB;Integrated Security=True;TrustServerCertificate=True'
}
$original = @{}
foreach ($key in $variables.Keys) {
    $original[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $variables[$key], 'Process')
}
try {
    npm.cmd ci --prefix (Join-Path $spec 'browser')
    if ($LASTEXITCODE -ne 0) { throw 'Installing browser test dependencies failed.' }
    node $verifier candidate
    if ($LASTEXITCODE -ne 0) { throw 'Exercise verification failed.' }
} finally {
    try {
        $hostDll = Join-Path $PSScriptRoot 'SchoolCalendar.AcceptanceHost/bin/Debug/net10.0/SchoolCalendar.AcceptanceHost.dll'
        if (Test-Path -LiteralPath $hostDll) {
            dotnet $hostDll drop $database
            if ($LASTEXITCODE -ne 0) { Write-Warning "Could not clean up the disposable database $database." }
        }
    } finally {
        foreach ($key in $original.Keys) {
            [Environment]::SetEnvironmentVariable($key, $original[$key], 'Process')
        }
    }
}
