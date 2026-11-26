@echo off
setlocal
pushd "%~dp0" || exit /b 1

if not exist "schoolcalendar.client\node_modules\" (
    call npm.cmd --prefix schoolcalendar.client ci
    if errorlevel 1 goto done
)
call npm.cmd --prefix schoolcalendar.client run build
if errorlevel 1 goto done

dotnet run --project "SchoolCalendar.Server\SchoolCalendar.Server.csproj"

:done
set "launchResult=%errorlevel%"
popd
exit /b %launchResult%
