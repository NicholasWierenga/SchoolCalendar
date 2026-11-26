# SchoolCalendar

A school event calendar built with React, EF Core, and SQL Server LocalDB.

## Run in VS Code on Windows

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/10.0), [Node.js LTS](https://nodejs.org/en/download) (22.13+ with npm), and [SQL Server Express LocalDB](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-express-localdb#installation-media).

1. In VS Code, choose **File → Open Folder** and open the `SchoolCalendar` folder containing `SchoolCalendar.slnx`.
2. Choose **Terminal → New Terminal** and run this command in PowerShell.

   ```powershell
   .\Start-SchoolCalendar.cmd
   ```

3. When the terminal says **Now listening**, open [SchoolCalendar](http://localhost:5187). Press **Ctrl+C** in the terminal to stop the app.

The launcher installs missing frontend dependencies, builds React, and starts the server. On first use, the server creates the LocalDB database and seeds the demo accounts and events. Later runs keep your data.

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

The demo opens in April 2027. April 16 has ten approved sessions. Open **+8 more** to see the full day in time order. Drag a session onto a date, or hold it over a month arrow to reach another month. Undo(shows below the calendar when a change an event is changed) restores the last successful move or pencil edit.

## Connect in SSMS

Select **Database Engine**, enter `(localdb)\MSSQLLocalDB` as the server, and use **Windows Authentication** with the account that runs the app. Expand **Databases → SchoolCalendar → Tables**. The application tables are `dbo.Events`, `dbo.Users`, and `dbo.Locations`.

If startup reports a LocalDB connection error, run `SqlLocalDB versions` in PowerShell to check the installation. After installing LocalDB, reopen VS Code and retry the server command. Clones run by the same Windows user share the default `SchoolCalendar` database.

The connection string is named `SchoolCalendar` in `SchoolCalendar.Server/appsettings.json`. To use a different SQL Server, set `ConnectionStrings__SchoolCalendar` before starting the app. `Calendar__SeedDemoData=false` disables demo data when initializing an empty database. An initial approver can be provisioned with `Calendar__BootstrapApprover__Login`, `Password`, `FirstName` and `LastName` under the same prefix.

## Tests

The repository includes the test suites and their sample data. Use the Windows prerequisites above and Microsoft Edge for the browser tests.

Run the backend tests from the solution folder.

```powershell
dotnet test tests/SchoolCalendar.Server.Tests/SchoolCalendar.Server.Tests.csproj
```

Starting in the same solution folder, run the frontend checks. The first line switches to the React project, which contains `package.json` and `package-lock.json`.

```powershell
cd .\schoolcalendar.client
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:ui
```

The browser tests start Edge and a backend with a disposable LocalDB database. They cover workflows such as submitting a request, approving it, and moving an event across months. You can run them with the demo app closed.