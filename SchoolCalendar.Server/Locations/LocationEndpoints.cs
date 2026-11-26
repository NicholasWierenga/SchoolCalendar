using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Data;
using SchoolCalendar.Server.Http;
using SchoolCalendar.Server.Users;

namespace SchoolCalendar.Server.Locations;

public static class LocationEndpoints
{
    public static void MapLocations(this RouteGroupBuilder api)
    {
        var locations = api.MapGroup("/locations").RequireAuthorization();
        locations.MapGet("", ListAsync);

        var management = locations.MapGroup("").RequireAuthorization(Roles.Approver);
        management.MapPost("", CreateAsync);
        management.MapMethods("/{id:int}", ["PUT", "PATCH"], UpdateAsync);
        management.MapDelete("/{id:int}", DeleteAsync);
    }

    private static Task<LocationResponse[]> ListAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        db.Locations.AsNoTracking().OrderBy(location => location.Name).ThenBy(location => location.Id)
            .Select(location => new LocationResponse(location.Id, location.Name, Convert.ToBase64String(location.Version)))
            .ToArrayAsync(cancellationToken);

    private static async Task<IResult> CreateAsync(JsonElement body, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = new Location { Name = ValidName(new JsonInput(body)) };
        db.Locations.Add(location);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Json(LocationResponse.From(location), statusCode: StatusCodes.Status201Created);
    }

    private static async Task<LocationResponse> UpdateAsync(
        int id, JsonElement body, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = await FindAsync(id, db, cancellationToken);
        var input = new JsonInput(body);
        ApiFailure.CheckVersion(location.Version, input.NullableText("version"));
        location.Name = ValidName(input);
        await db.SaveChangesAsync(cancellationToken);
        return LocationResponse.From(location);
    }

    private static async Task<IResult> DeleteAsync(
        int id, string? version, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = await FindAsync(id, db, cancellationToken);
        ApiFailure.CheckVersion(location.Version, version);
        db.Locations.Remove(location);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (ApiFailure.IsSqlError(exception, 547))
        {
            throw ApiFailure.Conflict("Events still use this location. Change those events before deleting it.");
        }

        return Results.NoContent();
    }

    private static async Task<Location> FindAsync(int id, CalendarDbContext db, CancellationToken cancellationToken) =>
        await db.Locations.FindAsync([id], cancellationToken) ?? throw ApiFailure.NotFound("The location");

    private static string ValidName(JsonInput input)
    {
        var name = input.Text("name");
        CalendarValidation.Printable(name, "Location name", 1, 50);
        return name;
    }
}
