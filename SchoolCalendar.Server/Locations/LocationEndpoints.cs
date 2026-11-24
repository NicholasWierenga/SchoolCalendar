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
        locations.MapPost("", CreateAsync).RequireAuthorization(Roles.Approver);
        locations.MapMethods("/{id:int}", ["PUT", "PATCH"], UpdateAsync).RequireAuthorization(Roles.Approver);
        locations.MapDelete("/{id:int}", DeleteAsync).RequireAuthorization(Roles.Approver);
    }

    private static async Task<LocationResponse[]> ListAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        await db.Locations.AsNoTracking().OrderBy(location => location.Name).ThenBy(location => location.Id)
            .Select(location => new LocationResponse(location.Id, location.Name)).ToArrayAsync(cancellationToken);

    private static async Task<IResult> CreateAsync(JsonElement body, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = new Location { Name = ValidName(body) };
        db.Locations.Add(location);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Json(new LocationResponse(location.Id, location.Name), statusCode: StatusCodes.Status201Created);
    }

    private static async Task<LocationResponse> UpdateAsync(
        int id, JsonElement body, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = await FindAsync(id, db, cancellationToken);
        location.Name = ValidName(body);
        await db.SaveChangesAsync(cancellationToken);
        return new LocationResponse(location.Id, location.Name);
    }

    private static async Task<IResult> DeleteAsync(int id, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var location = await FindAsync(id, db, cancellationToken);
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

    private static string ValidName(JsonElement body)
    {
        var name = new JsonInput(body).Text("name");
        CalendarValidation.Printable(name, "Location name", 1, 50);
        return name;
    }
}
