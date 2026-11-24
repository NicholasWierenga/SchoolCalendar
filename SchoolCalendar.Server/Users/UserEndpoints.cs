using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Data;
using SchoolCalendar.Server.Http;

namespace SchoolCalendar.Server.Users;

public static class UserEndpoints
{
    public static void MapUsers(this RouteGroupBuilder api)
    {
        var users = api.MapGroup("/users").RequireAuthorization(Roles.Approver);
        users.MapGet("", ListAsync);
        users.MapPost("", CreateAsync);
        users.MapMethods("/{id:int}", ["PUT", "PATCH"], UpdateAsync);
        users.MapDelete("/{id:int}", DeleteAsync);
    }

    private static async Task<UserResponse[]> ListAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking().Where(user => !user.IsDeleted)
            .OrderBy(user => user.LastName).ThenBy(user => user.FirstName).ThenBy(user => user.Id)
            .Select(user => new UserResponse(user.Id, user.Login, user.FirstName, user.MiddleName, user.LastName, user.Role))
            .ToArrayAsync(cancellationToken);

    private static async Task<IResult> CreateAsync(
        JsonElement body, CalendarDbContext db, IPasswordHasher<CalendarUser> hasher, CancellationToken cancellationToken)
    {
        var user = new CalendarUser();
        Apply(new JsonInput(body), user, hasher, creating: true);
        db.Users.Add(user);
        await SaveAsync(db, cancellationToken);
        return Results.Json(UserResponse.From(user), statusCode: StatusCodes.Status201Created);
    }

    private static async Task<UserResponse> UpdateAsync(
        int id, JsonElement body, CalendarDbContext db, IPasswordHasher<CalendarUser> hasher,
        CancellationToken cancellationToken)
    {
        var user = await FindAsync(id, db, cancellationToken);
        Apply(new JsonInput(body), user, hasher, creating: false);
        await SaveAsync(db, cancellationToken);
        return UserResponse.From(user);
    }

    private static async Task<IResult> DeleteAsync(int id, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var user = await FindAsync(id, db, cancellationToken);
        // Retire the account and its credentials while keeping event audit references intact.
        user.IsDeleted = true;
        user.PasswordHash = "";
        user.SecurityStamp = Guid.NewGuid();
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<CalendarUser> FindAsync(int id, CalendarDbContext db, CancellationToken cancellationToken) =>
        await db.Users.SingleOrDefaultAsync(user => user.Id == id && !user.IsDeleted, cancellationToken)
        ?? throw ApiFailure.NotFound("The user");

    private static void Apply(JsonInput input, CalendarUser user, IPasswordHasher<CalendarUser> hasher, bool creating)
    {
        var login = input.Text("login", creating ? null : user.Login);
        var firstName = input.Text("firstName", creating ? null : user.FirstName);
        var middleName = input.Text("middleName", user.MiddleName);
        var lastName = input.Text("lastName", creating ? null : user.LastName);
        var role = input.Text("role", creating ? null : user.Role);

        CalendarValidation.Login(login);
        CalendarValidation.Printable(firstName, "First name", 1, 25);
        CalendarValidation.Printable(middleName, "Middle name", 0, 25);
        CalendarValidation.Printable(lastName, "Last name", 1, 25);
        if (role is not (Roles.Normal or Roles.Approver))
        {
            throw ApiFailure.Invalid("Choose the normal or approver role.");
        }

        if (creating || input.Has("password"))
        {
            var password = input.Text("password");
            CalendarValidation.Password(password);
            user.PasswordHash = hasher.HashPassword(user, password);
            user.SecurityStamp = Guid.NewGuid();
        }

        user.Login = login;
        user.FirstName = firstName;
        user.MiddleName = middleName;
        user.LastName = lastName;
        user.Role = role;
    }

    private static async Task SaveAsync(CalendarDbContext db, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            ApiFailure.IsSqlError(exception, 2601) || ApiFailure.IsSqlError(exception, 2627))
        {
            throw ApiFailure.Conflict("That logon name is already in use.");
        }
    }
}
