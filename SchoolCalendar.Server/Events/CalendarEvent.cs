using System.Globalization;
using SchoolCalendar.Server.Locations;
using SchoolCalendar.Server.Users;

namespace SchoolCalendar.Server.Events;

public static class EventStatus
{
    public const string Pending = "pending";
    public const string Approved = "approved";
}

public sealed class CalendarEvent
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public int? LocationId { get; set; }
    public Location? Location { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly Time { get; set; }
    public string? Image { get; set; }
    public string Status { get; set; } = EventStatus.Pending;
    public int CreatorId { get; set; }
    public CalendarUser Creator { get; set; } = null!;
    public string CreatorName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public int? ApproverId { get; set; }
    public CalendarUser? Approver { get; set; }
    public string? ApproverName { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public byte[] Version { get; set; } = [];

    public void Approve(CalendarUser approver, DateTimeOffset now)
    {
        Status = EventStatus.Approved;
        Approver = approver;
        ApproverName = approver.DisplayName;
        ApprovedAt = now;
    }
}

public sealed record EventResponse(
    int Id, string Title, string Description, int? LocationId, string? Location,
    string Date, string Time, string? Image, string Status,
    string CreatorName, string? ApproverName, DateTimeOffset CreatedAt,
    DateTimeOffset? ApprovedAt, string Version)
{
    public static EventResponse From(CalendarEvent entry) => new(
        entry.Id, entry.Title, entry.Description, entry.LocationId, entry.Location?.Name,
        entry.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        entry.Time.ToString("HH:mm", CultureInfo.InvariantCulture), entry.Image, entry.Status,
        entry.CreatorName, entry.ApproverName, entry.CreatedAt, entry.ApprovedAt,
        Convert.ToBase64String(entry.Version));
}
