using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace SchoolCalendar.AcceptanceHost;

public sealed record TestApprover(string Login, string Password, string FirstName, string LastName, string? MiddleName = null);

public sealed class TestCalendarHost : IAsyncDisposable
{
    private readonly WebApplication app;

    private TestCalendarHost(WebApplication app)
    {
        this.app = app;
        var addresses = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>();
        Address = new Uri(addresses!.Addresses.Single());
    }

    public Uri Address { get; }

    public static async Task<TestCalendarHost> StartAsync(
        TestDatabase database, TestApprover approver, bool seedDemoData = false, IInterceptor? interceptor = null)
    {
        var app = global::Program.BuildApplication([], builder =>
        {
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:SchoolCalendar"] = database.ConnectionString,
                ["Calendar:SeedDemoData"] = seedDemoData.ToString(),
                ["Calendar:BootstrapApprover:Login"] = approver.Login,
                ["Calendar:BootstrapApprover:Password"] = approver.Password,
                ["Calendar:BootstrapApprover:FirstName"] = approver.FirstName,
                ["Calendar:BootstrapApprover:MiddleName"] = approver.MiddleName ?? string.Empty,
                ["Calendar:BootstrapApprover:LastName"] = approver.LastName
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.SetMinimumLevel(LogLevel.Warning);
            if (interceptor is not null)
            {
                builder.Services.AddSingleton<IInterceptor>(interceptor);
            }
        });

        try
        {
            await global::Program.InitializeDatabaseAsync(app.Services);
            await app.StartAsync();
            return new TestCalendarHost(app);
        }
        catch
        {
            await app.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await app.StopAsync();
        }
        finally
        {
            await app.DisposeAsync();
        }
    }
}
