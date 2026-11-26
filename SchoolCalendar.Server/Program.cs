using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SchoolCalendar.Server.Data;
using SchoolCalendar.Server.Events;
using SchoolCalendar.Server.Http;
using SchoolCalendar.Server.Locations;
using SchoolCalendar.Server.Users;

public partial class Program
{
    public static async Task Main(string[] args)
    {
        var app = BuildApplication(args);
        await InitializeDatabaseAsync(app.Services);
        await app.RunAsync();
    }

    public static WebApplication BuildApplication(
        string[] args, Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.Services.AddDbContext<CalendarDbContext>((services, options) =>
            options.UseSqlServer(builder.Configuration.GetConnectionString("SchoolCalendar"))
                .AddInterceptors(services.GetServices<IInterceptor>()));
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddScoped<IPasswordHasher<CalendarUser>, PasswordHasher<CalendarUser>>();
        builder.Services.AddScoped<CalendarCookieEvents>();
        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "SchoolCalendar.Session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.EventsType = typeof(CalendarCookieEvents);
            });
        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(Roles.Approver, policy => policy.RequireRole(Roles.Approver));
        builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        builder.Services.AddExceptionHandler<ApiExceptionHandler>();
        builder.Services.AddProblemDetails();
        configure?.Invoke(builder);

        var app = builder.Build();
        var clientFiles = new StaticFileOptions
        {
            OnPrepareResponse = context =>
            {
                if (context.File.Name == "index.html")
                {
                    context.Context.Response.Headers["Content-Security-Policy"] = "img-src 'self' data:";
                }
            }
        };
        app.UseExceptionHandler();
        app.UseDefaultFiles();
        app.UseStaticFiles(clientFiles);
        app.UseAuthentication();
        app.UseAuthorization();

        var api = app.MapGroup("/api");
        api.MapGet("/health", () => Results.Ok());
        api.MapSessions();
        api.MapUsers();
        api.MapLocations();
        api.MapCalendarEvents();
        api.MapFallback(() => ApiFailure.NotFound("This API route").ToResult());
        app.MapFallbackToFile("index.html", clientFiles);
        return app;
    }

    public static async Task InitializeDatabaseAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var database = scope.ServiceProvider.GetRequiredService<CalendarDbContext>();
        await database.Database.MigrateAsync();
        await CalendarSeed.InitializeAsync(scope.ServiceProvider);
    }
}
