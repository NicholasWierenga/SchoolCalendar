# SchoolCalendar

A school event calendar built with React, FullCalendar Standard, ASP.NET Core, EF Core, and SQL Server LocalDB.

## Run locally

Open this folder in Visual Studio Code or open `SchoolCalendar.slnx` in Visual Studio. Use the .NET 10 SDK, Node.js 22.13 LTS or a current LTS release, and SQL Server Express LocalDB. From a PowerShell terminal in the solution folder, run:

```powershell
.\Start-SchoolCalendar.ps1
```

Open **http://localhost:5187**. The first start creates the database, applies migrations, and seeds the sample accounts, locations, and events. Later starts keep your changes. Press Ctrl+C in the terminal to stop the server.

| Login | Password | Access |
| --- | --- | --- |
| `approver` | `Calendar1!` | Publish and edit events, review proposals, and manage users and locations |
| `teacher` | `Calendar1!` | View the calendar and submit proposals |

The demo opens in April 2027. April 16 has ten approved sessions. Open **+8 more** to see the full day in time order. Drag a session onto a date, or hold it over a month arrow to reach another month. The first page turn is immediate and repeats every 0.8 seconds. Escape cancels. Undo restores the last successful move or pencil edit. A selected date stays highlighted across month changes only while its cell is visible.

## Connect in SSMS

Select **Database Engine**, enter `(localdb)\MSSQLLocalDB` as the server, and use **Windows Authentication** with the account that runs the app. Expand **Databases → SchoolCalendar → Tables**. The application tables are `dbo.Events`, `dbo.Users`, and `dbo.Locations`.

The connection string is named `SchoolCalendar` in `SchoolCalendar.Server/appsettings.json`. To use a different SQL Server, set `ConnectionStrings__SchoolCalendar` before starting the app. `Calendar__SeedDemoData=false` disables demo data when initializing an empty database. An initial approver can be provisioned with `Calendar__BootstrapApprover__Login`, `Password`, `FirstName` and `LastName` under the same prefix.

## Development

The startup script runs these commands. You can also run them individually:

```powershell
cd schoolcalendar.client
npm ci
npm run build
cd ..
dotnet run --project SchoolCalendar.Server
```

Vite builds into the server's `wwwroot`, so the app and API share one origin. For live React editing, leave the server running and run `npm run dev` in a second terminal inside `schoolcalendar.client`. Open **http://localhost:5173**. For a publishable build, run `npm run build` in the client first, then `dotnet publish SchoolCalendar.Server -c Release` from the solution folder.

| Folder | Contents |
| --- | --- |
| `schoolcalendar.client/src/features/calendar` | Month and day views, selection, overflow list, and drag interactions |
| `schoolcalendar.client/src/features/events` | Shared event editor, approvals, event management, and one-step Undo |
| `schoolcalendar.client/src/features/auth`, `features/admin` | Sign-in and user/location administration |
| `SchoolCalendar.Server/Users`, `Events`, `Locations` | ASP.NET Core endpoints, validation, and role checks |
| `SchoolCalendar.Server/Data` | EF Core context, migrations, and sample data |
| `tests`, `schoolcalendar.client/e2e` | Backend integration tests, exercise adapters, and browser tests |

School dates and times are stored separately from audit timestamps. EF Core writes run inside a SQL transaction when checking the daily limit. Competing requests cannot both claim the tenth place. Event edits and Undo send the record version so that an older browser session cannot silently overwrite a newer edit.

## Tests

Run the backend tests from the solution folder:

```powershell
dotnet test tests/SchoolCalendar.Server.Tests/SchoolCalendar.Server.Tests.csproj
```

Run the frontend checks from `schoolcalendar.client`:

```powershell
npm ci
npm run lint
npm test
npm run test:ui
```

The browser regressions launch Edge and a real isolated backend with its own seeded LocalDB database. The tests cover date selection across month boundaries and moving a hidden event across months, editing its time, and undoing just that edit. Each fixture removes its own database when finished.

To run the supplied exercise verifier, pass the path to the original exercise specification folder from the solution root. The script installs that package's browser dependencies, builds the project, runs the domain, SQL restart, and browser suites, and cleans up its disposable LocalDB database.

```powershell
.\tests\Verify-Exercise.ps1 -SpecDirectory "$env:USERPROFILE\Downloads\developer-exercise-spec"
```
