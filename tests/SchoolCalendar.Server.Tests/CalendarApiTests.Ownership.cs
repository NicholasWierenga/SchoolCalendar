using System.Net.Http.Json;
using System.Text.Json;

namespace SchoolCalendar.Server.Tests;

public sealed partial class CalendarApiTests
{
    [Fact]
    public async Task CalendarMarksPublishedEventsForTheTeacherWhoSubmittedThem()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacherClient, teacherId) = await CreateTeacherAsync(admin);
        using var teacher = teacherClient;
        await ReadAsync<User>(await admin.PostAsJsonAsync("/api/users", new
        {
            login = "teacher2", password = "Tch!2028", firstName = "Avery", lastName = "Ng", role = "normal",
        }));
        using var otherTeacher = await SignInAsync("teacher2", "Tch!2028");

        var directlyPublished = await CreateEventAsync(admin, "Staff event", Date, "08:00");
        var submission = await CreateEventAsync(teacher, "Science fair", Date, "09:00");
        var otherSubmission = await CreateEventAsync(otherTeacher, "Reading club", Date, "10:00");
        Assert.Equal(submission.CreatorName, otherSubmission.CreatorName);

        var calendarPath = CalendarPath(Date);
        var beforeApproval = Assert.Single(await ReadAsync<JsonElement[]>(await teacher.GetAsync(calendarPath)));
        Assert.Equal(directlyPublished.Id, beforeApproval.GetProperty("id").GetInt32());
        Assert.False(beforeApproval.TryGetProperty("isOwn", out _));
        var pending = Assert.Single(await ReadAsync<JsonElement[]>(await teacher.GetAsync("/api/events/mine")));
        Assert.False(pending.TryGetProperty("isOwn", out _));

        var approved = await ReadAsync<JsonElement>(await admin.PostAsJsonAsync(
            $"/api/events/{submission.Id}/approve", new { version = submission.Version }));
        Assert.False(approved.TryGetProperty("isOwn", out _));
        await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync(
            $"/api/events/{otherSubmission.Id}/approve", new { version = otherSubmission.Version }));

        var teacherCalendar = await ReadPublishedEventsAsync(teacher);
        Assert.False(teacherCalendar[0].TryGetProperty("isOwn", out _));
        Assert.True(teacherCalendar[1].GetProperty("isOwn").GetBoolean());
        Assert.False(teacherCalendar[1].TryGetProperty("creatorId", out _));
        Assert.False(teacherCalendar[2].TryGetProperty("isOwn", out _));

        var otherCalendar = await ReadPublishedEventsAsync(otherTeacher);
        Assert.False(otherCalendar[0].TryGetProperty("isOwn", out _));
        Assert.False(otherCalendar[1].TryGetProperty("isOwn", out _));
        Assert.True(otherCalendar[2].GetProperty("isOwn").GetBoolean());

        Assert.All(await ReadPublishedEventsAsync(admin), entry => Assert.False(entry.TryGetProperty("isOwn", out _)));
        await ReadAsync<User>(await PatchAsync(admin, $"/api/users/{teacherId}", new { role = "approver" }));
        Assert.All(await ReadPublishedEventsAsync(teacher), entry => Assert.False(entry.TryGetProperty("isOwn", out _)));

        async Task<JsonElement[]> ReadPublishedEventsAsync(HttpClient viewer)
        {
            var entries = await ReadAsync<JsonElement[]>(await viewer.GetAsync(calendarPath));
            Assert.Equal(new[] { directlyPublished.Id, submission.Id, otherSubmission.Id },
                entries.Select(entry => entry.GetProperty("id").GetInt32()));
            return entries;
        }
    }
}
