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
        events.MapGet("/mine", ListMineAsync);

        var management = events.MapGroup("").RequireAuthorization(Roles.Approver);
        management.MapGet("/pending", ListPendingAsync);
        management.MapGet("/manage", ListAllAsync);
        management.MapMethods("/{id:int}", ["PUT", "PATCH"], UpdateAsync);
        management.MapDelete("/{id:int}", DeleteAsync);
        management.MapPost("/{id:int}/approve", ApproveAsync);
    }

    private static Task<EventResponse[]> ListCalendarAsync(
        string? from, string? to, HttpContext http, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var actor = http.Features.Get<CalendarUser>()!;
        var entries = InDateRange(db.Events.Where(entry => entry.Status == EventStatus.Approved), from, to);
        return ListAsync(entries, cancellationToken, actor.Role == Roles.Normal ? actor.Id : null);
    }

    private static Task<EventResponse[]> ListMineAsync(HttpContext http, CalendarDbContext db, CancellationToken cancellationToken)
    {
        var creatorId = http.Features.Get<CalendarUser>()!.Id;
        return ListAsync(db.Events.Where(entry => entry.CreatorId == creatorId), cancellationToken);
    }

    private static IQueryable<CalendarEvent> InDateRange(IQueryable<CalendarEvent> events, string? from, string? to)
    {
        var first = CalendarValidation.Date(from);
        var last = CalendarValidation.Date(to);
        if (last < first)
        {
            throw ApiFailure.Invalid("The last date must be on or after the first date.");
        }

        return events.Where(entry => entry.Date >= first && entry.Date <= last);
    }

    private static Task<EventResponse[]> ListPendingAsync(CalendarDbContext db, CancellationToken cancellationToken) =>
        ListAsync(db.Events.Where(entry => entry.Status == EventStatus.Pending), cancellationToken);

    private static Task<EventResponse[]> ListAllAsync(
        string? from, string? to, CalendarDbContext db, CancellationToken cancellationToken) =>
        ListAsync(from is null && to is null ? db.Events : InDateRange(db.Events, from, to), cancellationToken);

    private static async Task<EventResponse[]> ListAsync(
        IQueryable<CalendarEvent> entries, CancellationToken cancellationToken, int? ownEventCreatorId = null)
    {
        var rows = await entries.AsNoTracking().Include(entry => entry.Location)
            .OrderBy(entry => entry.Date).ThenBy(entry => entry.Time).ThenBy(entry => entry.Id)
            .ToListAsync(cancellationToken);
        return rows.Select(entry => EventResponse.From(entry, entry.CreatorId == ownEventCreatorId)).ToArray();
    }

    private static async Task<IResult> CreateAsync(
        JsonElement body, HttpContext http, CalendarDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        await using var transaction = await DatabaseLock.AcquireAsync(db, EventWriteLock, cancellationToken);
        var creator = http.Features.Get<CalendarUser>()!;
        var input = new JsonInput(body);
        // If the form promised a different action, let the user review the draft before writing it.
        if (input.NullableText("expectedRole") is string expectedRole && expectedRole != creator.Role)
        {
            return ApiFailure.Conflict("Your access changed. Review the updated action and save again.").ToResult();
        }

        var now = clock.GetUtcNow();
        var entry = new CalendarEvent
        {
            Creator = creator,
            CreatorName = creator.DisplayName,
            CreatedAt = now
        };
        await ApplyAsync(input, entry, db, creating: true, cancellationToken);
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
        var (version, changes) = await ReadApprovalAsync(http, cancellationToken);
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

    private static async Task<(string? Version, JsonInput? Changes)> ReadApprovalAsync(
        HttpContext http, CancellationToken cancellationToken)
    {
        if (http.Features.Get<IHttpRequestBodyDetectionFeature>()?.CanHaveBody != true)
        {
            return (null, null);
        }
        if (!http.Request.HasJsonContentType())
        {
            throw ApiFailure.Invalid("Send a JSON object.");
        }

        var body = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
        if (body.ValueKind == JsonValueKind.Null) return (null, null);

        var version = new JsonInput(body).NullableText("version");
        if (!body.TryGetProperty("changes", out var patch)) return (version, null);

        var changes = new JsonInput(patch);
        if (version is null)
        {
            throw ApiFailure.Invalid("The version field is required to edit and approve an event.");
        }
        return (version, changes);
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
            throw ApiFailure.Capacity(date, DailyCapacity);
        }
    }

    private static async Task ApplyAsync(
        JsonInput input, CalendarEvent entry, CalendarDbContext db, bool creating, CancellationToken cancellationToken)
    {
        var title = input.Text("title", creating ? null : entry.Title);
        var description = input.Text("description", entry.Description);
        var date = creating || input.Has("date") ? CalendarValidation.Date(input.Text("date")) : entry.Date;
        var time = creating || input.Has("time") ? CalendarValidation.Time(input.Text("time")) : entry.Time;
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
