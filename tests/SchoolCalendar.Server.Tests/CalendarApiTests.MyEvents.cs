using System.Net;
using System.Net.Http.Json;

namespace SchoolCalendar.Server.Tests;

public sealed partial class CalendarApiTests
{
    [Fact]
    public async Task MyEventsShowsOnlyTheSignedInTeachersSubmissionsBeforeAndAfterApproval()
    {
        const string mine = "/api/events/mine";
        using var admin = await SignInAsApproverAsync();
        var (teacherClient, teacherId) = await CreateTeacherAsync(admin);
        using var teacher = teacherClient;

        var (otherTeacherClient, otherTeacherId) = await CreateTeacherAsync(admin, "teacher2");
        using var otherTeacher = otherTeacherClient;

        Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(mine)));

        var location = await ReadAsync<Location>(await admin.PostAsJsonAsync("/api/locations", new { name = "Gym" }));
        var later = await CreateEventAsync(teacher, "Later proposal", FollowingDate, "10:00");
        var pending = await ReadAsync<CalendarEvent>(await teacher.PostAsJsonAsync("/api/events", new
        {
            title = "Science fair", date = Date, time = "09:00", locationId = location.Id,
        }));
        var otherPending = await CreateEventAsync(otherTeacher, "Other pending", Date, "10:00");
        var otherSubmission = await CreateEventAsync(otherTeacher, "Other approved", Date, "11:00");
        var otherApproved = await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync(
            $"/api/events/{otherSubmission.Id}/approve", new { version = otherSubmission.Version }));
        var direct = await CreateEventAsync(admin, "Direct event", Date, "08:00");

        Assert.Equal(pending.CreatorName, otherPending.CreatorName);
        Assert.Equal("pending", pending.Status);
        Assert.Equal("Gym", pending.Location);
        Assert.Equal(new[] { pending, later }, await ReadAsync<CalendarEvent[]>(
            await teacher.GetAsync($"{mine}?creatorId={otherTeacherId}")));
        Assert.Equal(new[] { otherPending, otherApproved }, await ReadAsync<CalendarEvent[]>(await otherTeacher.GetAsync(mine)));
        Assert.Equal(new[] { direct, otherApproved }, await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));

        using var rename = await PatchAsync(admin, $"/api/users/{teacherId}", new { firstName = "Renamed" });
        Assert.True(rename.IsSuccessStatusCode, await rename.Content.ReadAsStringAsync());
        var approved = await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync(
            $"/api/events/{pending.Id}/approve", new { version = pending.Version }));

        Assert.Equal("approved", approved.Status);
        Assert.Equal(pending.CreatorName, approved.CreatorName);
        Assert.Equal(new[] { approved, later }, await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(mine)));
        Assert.Equal(new[] { otherPending, otherApproved }, await ReadAsync<CalendarEvent[]>(await otherTeacher.GetAsync(mine)));
        Assert.Equal(new[] { direct, approved, otherApproved }, await ReadAsync<CalendarEvent[]>(await otherTeacher.GetAsync(CalendarPath(Date))));

        using var signOut = await teacher.DeleteAsync("/api/session");
        Assert.Equal(HttpStatusCode.NoContent, signOut.StatusCode);
        using var signedOut = await teacher.GetAsync(mine);
        Assert.Equal(HttpStatusCode.Unauthorized, signedOut.StatusCode);
    }
}
