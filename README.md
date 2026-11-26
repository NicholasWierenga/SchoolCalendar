# SchoolCalendar

A school event calendar built with React, FullCalendar Standard, ASP.NET Core, EF Core, and SQL Server LocalDB.

## Run in VS Code on Windows

Install these tools before opening VS Code.

- [Git for Windows](https://git-scm.com/downloads/win) to clone the repository
- [.NET 10 SDK for Windows](https://dotnet.microsoft.com/en-us/download/dotnet/10.0)
- [Node.js LTS with npm](https://nodejs.org/en/download) (22.13 or later on the 22.x line, or a newer LTS)
- [SQL Server Express LocalDB](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-express-localdb#installation-media). Select the **LocalDB** component in SQL Server Express setup or Visual Studio Installer. SSMS is optional.

In VS Code, press **Ctrl+Shift+P**, choose **Git: Clone**, and paste this repository’s URL. Open the cloned folder containing `SchoolCalendar.slnx`. Choose **Terminal → New Terminal** and run these commands in PowerShell. The first build needs internet access to restore npm and NuGet packages.

```powershell
npm.cmd --prefix schoolcalendar.client ci
npm.cmd --prefix schoolcalendar.client run build
dotnet run --project SchoolCalendar.Server
```

Wait for `Now listening on: http://localhost:5187`, then open [the calendar](http://localhost:5187) in Chrome or Edge. Leave the terminal running while you use the app. Press Ctrl+C to stop it. To start it again, repeat the last command.

On first launch, EF Core creates the `SchoolCalendar` database in `(localdb)\MSSQLLocalDB`, applies the included migrations, and seeds the demo accounts, locations, and April 2027 events. Later launches apply any new migrations and keep your data. Demo records are added only when the database contains no users.

## Try both accounts

| Login | Password | Access |
| --- | --- | --- |
| `approver` | `Calendar1!` | Publish and edit events, review proposals, and manage users and locations |
| `teacher` | `Calendar1!` | View the calendar, submit proposals, and review their status in **My Events** |

A fresh database includes a request you can follow through approval.

1. Sign in as `teacher` and open **My Events**. **Seedling Exchange** (April 22) is under **Pending requests**. Select its row to read the details, close the dialog, and sign out using the button beside your name.
2. Sign in as `approver` and open **Events**. Under **Pending requests**, click **Approve** on **Seedling Exchange**. It moves to **Published events**.
3. Sign out, then sign in as `teacher` again. **My Events → Published events** now includes **Seedling Exchange**, and the school calendar shows it on April 22.

Click an event in Month, Day, or the **+ more** list to read its details. Teachers can read any published event. Approvers can edit or delete an event from its details and approve a pending request there or under **Events → Pending requests**. The pencil opens the editor directly. In the approver’s Month view, published events get first choice of the two visible slots. The Day view includes every request at its proposed start time, marked with a dashed outline and a clock. Only published events count toward the daily limit of ten.

The demo opens in April 2027. April 16 has ten approved sessions. Open **+8 more** to see the full day in time order. Drag a session onto a date, or hold it over a month arrow to reach another month. The first page turn is immediate and repeats every 0.8 seconds. Escape cancels. Undo restores the last successful move or pencil edit. A selected date stays highlighted across month changes only while its cell is visible.

## Connect in SSMS

Select **Database Engine**, enter `(localdb)\MSSQLLocalDB` as the server, and use **Windows Authentication** with the account that runs the app. Expand **Databases → SchoolCalendar → Tables**. The application tables are `dbo.Events`, `dbo.Users`, and `dbo.Locations`.

If startup reports a LocalDB connection error, run `SqlLocalDB versions` in PowerShell to check the installation. After installing LocalDB, reopen VS Code and retry the server command. Clones run by the same Windows user share the default `SchoolCalendar` database.

The connection string is named `SchoolCalendar` in `SchoolCalendar.Server/appsettings.json`. To use a different SQL Server, set `ConnectionStrings__SchoolCalendar` before starting the app. `Calendar__SeedDemoData=false` disables demo data when initializing an empty database. An initial approver can be provisioned with `Calendar__BootstrapApprover__Login`, `Password`, `FirstName` and `LastName` under the same prefix.

## Development

From the repository root, `.\Start-SchoolCalendar.ps1` is a shortcut that installs missing client dependencies on a fresh clone, builds the frontend, and starts the server. You can also open `SchoolCalendar.slnx` in Visual Studio.

Vite builds into the server's `wwwroot`, so the app and API share one origin. For live React editing, leave the server running and run `npm.cmd run dev` in a second terminal inside `schoolcalendar.client`. Open **http://localhost:5173**. For a publishable build, run `npm.cmd run build` in the client first, then `dotnet publish SchoolCalendar.Server -c Release` from the solution folder.

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
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:ui
```

The browser regressions launch Edge and a real isolated backend with its own seeded LocalDB database. The tests cover date selection across month boundaries and moving a hidden event across months, editing its time, and undoing just that edit. Each fixture removes its own database when finished.

To run the supplied exercise verifier, pass the path to the original exercise specification folder from the solution root. The script installs that package's browser dependencies, builds the project, runs the domain, SQL restart, and browser suites, and cleans up its disposable LocalDB database.

```powershell
.\tests\Verify-Exercise.ps1 -SpecDirectory "$env:USERPROFILE\Downloads\developer-exercise-spec"
```
