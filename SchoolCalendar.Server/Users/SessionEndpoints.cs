using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Data;
using SchoolCalendar.Server.Http;

namespace SchoolCalendar.Server.Users;

public static class SessionEndpoints
{
    public static void MapSessions(this RouteGroupBuilder api)
    {
        var sessions = api.MapGroup("/session");
        sessions.MapGet("", (HttpContext http) => UserResponse.From(http.Features.Get<CalendarUser>()!))
            .RequireAuthorization();
        sessions.MapPost("", SignInAsync);
        sessions.MapDelete("", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> SignInAsync(
        JsonElement body, HttpContext http, CalendarDbContext db, IPasswordHasher<CalendarUser> hasher,
        CancellationToken cancellationToken)
    {
        var input = new JsonInput(body);
        var login = input.NullableText("login");
        var password = input.NullableText("password");
        var user = login?.Length is >= 4 and <= 16
            ? await db.Users.SingleOrDefaultAsync(x => x.Login == login && !x.IsDeleted, cancellationToken)
            : null;

        if (user is null || password?.Length is not (>= 4 and <= 16) ||
            hasher.VerifyHashedPassword(user, user.PasswordHash, password) == PasswordVerificationResult.Failed)
        {
            throw ApiFailure.Unauthenticated("The logon name or password is incorrect.");
        }

        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, CalendarCookieEvents.Principal(user));
        http.Response.Headers.CacheControl = "no-store";
        return Results.Ok(UserResponse.From(user));
    }
}

public sealed class CalendarCookieEvents(CalendarDbContext db) : CookieAuthenticationEvents
{
    private const string StampClaim = "calendar:stamp";

    internal static ClaimsPrincipal Principal(CalendarUser user) =>
        new(new ClaimsIdentity(
            [
                new(ClaimTypes.NameIdentifier, user.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
                new(ClaimTypes.Name, user.DisplayName),
                new(ClaimTypes.Role, user.Role),
                new(StampClaim, user.SecurityStamp.ToString("D"))
            ],
            CookieAuthenticationDefaults.AuthenticationScheme));

    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var principal = context.Principal;
        var user = int.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? await db.Users.SingleOrDefaultAsync(x => x.Id == id && !x.IsDeleted, context.HttpContext.RequestAborted)
            : null;
        if (user is null || principal?.FindFirstValue(StampClaim) != user.SecurityStamp.ToString("D"))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        // Roles and names take effect on the next request, even for an existing cookie.
        context.HttpContext.Features.Set(user);
        context.ReplacePrincipal(Principal(user));
        context.Response.Headers.CacheControl = "no-store";
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context) =>
        ApiFailure.Unauthenticated().WriteAsync(context.HttpContext, context.HttpContext.RequestAborted);

    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context) =>
        ApiFailure.Forbidden().WriteAsync(context.HttpContext, context.HttpContext.RequestAborted);
}
