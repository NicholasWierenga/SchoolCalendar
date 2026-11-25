using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Data;
using SchoolCalendar.Server.Http;
using SchoolCalendar.Server.Users;

namespace SchoolCalendar.Server.Events;

public static class EventEndpoints
{
    private const string EventWriteLock = "SchoolCalendar:EventWrites";
    private const int DailyCapacity = 10;

    public static void MapCalendarEvents(this RouteGroupBuilder api)
    {
        var events = api.MapGroup("/events").RequireAuthorization();
        events.MapGet("", ListCalendarAsync);
        events.MapPost("", CreateAsync);
        events.MapGet("/pending", ListPendingAsync).RequireAuthorization(Roles.Approver);
        events.MapGet("/manage", ListAllAsync).RequireAuthorization(Roles.Approver);
        events.MapMethods("/{id:int}", ["PUT", "PATCH"], UpdateAsync).RequireAuthorization(Roles.Approver);
        events.MapDelete("/{id:int}", DeleteAsync).RequireAuthorization(Roles.Approver);
        events.MapPost("/{id:int}/approve", ApproveAsync).RequireAuthorization(Roles.Approver);
    }

    private static Task<EventResponse[]> ListCalendarAsync(
        string? from, string? to, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var first = CalendarValidation.Date(from);
        var last = CalendarValidation.Date(to);
        if (last < first)
        {
            throw ApiFailure.Invalid("The last date must be on or after the first date.");
        }

        return ListAsync(db.Events.Where(entry =>
            entry.Status == EventStatus.Approved && entry.Date >= first && entry.Date <= last), cancellationToken);
    }

    private static Task<EventResponse[]> ListPendingAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db.Events.Where(entry => entry.Status == EventStatus.Pending), cancellationToken);

    private static Task<EventResponse[]> ListAllAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db.Events, cancellationToken);

    private static async Task<EventResponse[]> ListAsync(
        IQueryable<CalendarEvent> entries, CancellationToken cancellationToken)
    {
        var rows = await entries.AsNoTracking().Include(entry => entry.Location)
            .OrderBy(entry => entry.Date).ThenBy(entry => entry.Time).ThenBy(entry => entry.Id)
            .ToListAsync(cancellationToken);
        return rows.Select(EventResponse.From).ToArray();
    }

    private static async Task<IResult> CreateAsync(
        JsonElement body, HttpContext http, CalendarDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        await using var transaction = await DatabaseLock.AcquireAsync(db, EventWriteLock, cancellationToken);
        var creator = http.Features.Get<CalendarUser>()!;
        var now = clock.GetUtcNow();
        var entry = new CalendarEvent
        {
            Creator = creator,
            CreatorName = creator.DisplayName,
            CreatedAt = now
        };
        await ApplyAsync(new JsonInput(body), entry, db, creating: true, cancellationToken);
        if (creator.Role == Roles.Approver)
        {
            await CheckCapacityAsync(db, entry.Date, cancellationToken);
            entry.Approve(creator, now);
        }

        db.Events.Add(entry);
        await SaveAsync(db, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.Json(EventResponse.From(entry), statusCode: StatusCodes.Status201Created);
    }

    private static async Task<EventResponse> UpdateAsync(
        int id, JsonElement body, CalendarDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await DatabaseLock.AcquireAsync(db, EventWriteLock, cancellationToken);
        var entry = await FindAsync(id, db, cancellationToken);
        var input = new JsonInput(body);
        ApiFailure.CheckVersion(entry.Version, input.NullableText("version"));
        var originalDate = entry.Date;
        await ApplyAsync(input, entry, db, creating: false, cancellationToken);
        if (entry.Status == EventStatus.Approved && entry.Date != originalDate)
        {
            await CheckCapacityAsync(db, entry.Date, cancellationToken);
        }

        await SaveAsync(db, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return EventResponse.From(entry);
    }

    private static async Task<EventResponse> ApproveAsync(
        int id, HttpContext http, CalendarDbContext db, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        string? version = null;
        JsonInput? changes = null;
        if (http.Features.Get<IHttpRequestBodyDetectionFeature>()?.CanHaveBody == true)
        {
            if (!http.Request.HasJsonContentType())
            {
                throw ApiFailure.Invalid("Send a JSON object.");
            }

            var body = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            if (body.ValueKind != JsonValueKind.Null)
            {
                version = new JsonInput(body).NullableText("version");
                if (body.TryGetProperty("changes", out var patch))
                {
                    changes = new JsonInput(patch);
                    if (version is null)
                    {
                        throw ApiFailure.Invalid("The version field is required to edit and approve an event.");
                    }
                }
            }
        }

        await using var transaction = await DatabaseLock.AcquireAsync(db, EventWriteLock, cancellationToken);
        var entry = await FindAsync(id, db, cancellationToken);
        ApiFailure.CheckVersion(entry.Version, version);
        if (entry.Status != EventStatus.Pending)
        {
            throw ApiFailure.Conflict("This event is already approved.");
        }

        if (changes is JsonInput input)
        {
            await ApplyAsync(input, entry, db, creating: false, cancellationToken);
        }

        await CheckCapacityAsync(db, entry.Date, cancellationToken);
        entry.Approve(http.Features.Get<CalendarUser>()!, clock.GetUtcNow());
        await SaveAsync(db, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return EventResponse.From(entry);
    }

    private static async Task<IResult> DeleteAsync(
        int id, string? version, CalendarDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await DatabaseLock.AcquireAsync(db, EventWriteLock, cancellationToken);
        var entry = await FindAsync(id, db, cancellationToken);
        ApiFailure.CheckVersion(entry.Version, version);
        db.Events.Remove(entry);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<CalendarEvent> FindAsync(int id, CalendarDbContext db, CancellationToken cancellationToken) =>
        await db.Events.Include(entry => entry.Location).SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
        ?? throw ApiFailure.NotFound("The event");

    private static async Task CheckCapacityAsync(CalendarDbContext db, DateOnly date, CancellationToken cancellationToken)
    {
        var count = await db.Events.CountAsync(
            entry => entry.Status == EventStatus.Approved && entry.Date == date, cancellationToken);
        if (count >= DailyCapacity)
        {
            throw ApiFailure.Capacity(date);
        }
    }

    private static async Task ApplyAsync(
        JsonInput input, CalendarEvent entry, CalendarDbContext db, bool creating, CancellationToken cancellationToken)
    {
        var title = input.Text("title", creating ? null : entry.Title);
        var description = input.Text("description", entry.Description);
        var date = CalendarValidation.Date(input.Text("date",
            creating ? null : entry.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));
        var time = CalendarValidation.Time(input.Text("time",
            creating ? null : entry.Time.ToString("HH:mm", CultureInfo.InvariantCulture)));
        var locationId = input.LocationId(entry.LocationId);
        var image = input.NullableText("image", entry.Image);

        CalendarValidation.Printable(title, "Title", 1, 25);
        CalendarValidation.Printable(description, "Description", 0, 255);
        if (locationId != entry.LocationId)
        {
            entry.Location = locationId is int id
                ? await db.Locations.FindAsync([id], cancellationToken)
                    ?? throw ApiFailure.Invalid("Select an existing location.")
                : null;
        }

        entry.Title = title;
        entry.Description = description;
        entry.LocationId = locationId;
        entry.Date = date;
        entry.Time = time;
        entry.Image = image;
    }

    private static async Task SaveAsync(CalendarDbContext db, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (ApiFailure.IsSqlError(exception, 547))
        {
            throw ApiFailure.Invalid("The selected location no longer exists.");
        }
    }
}
