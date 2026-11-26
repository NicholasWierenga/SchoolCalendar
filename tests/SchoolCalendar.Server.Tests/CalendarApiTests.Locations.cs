using System.Net;
using System.Net.Http.Json;

namespace SchoolCalendar.Server.Tests;

public sealed partial class CalendarApiTests
{
    [Fact]
    public async Task LocationRenameAppearsOnPendingAndPublishedEvents()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacherClient, _) = await CreateTeacherAsync(admin);
        using var teacher = teacherClient;
        var location = await CreateDirectoryLocationAsync(admin);
        var pending = await CreateLocatedEventAsync(teacher, location.Id, "Pending workshop", "09:00");
        var published = await CreateLocatedEventAsync(admin, location.Id, "Published workshop", "10:00");
        Assert.Equal(location.Name, pending.Location);
        Assert.Equal(location.Name, published.Location);

        var renamed = await ReadAsync<DirectoryLocation>(await PatchAsync(admin, $"/api/locations/{location.Id}",
            new { name = "West Workshop", version = location.Version }));

        Assert.Equal(location.Id, renamed.Id);
        Assert.Equal("West Workshop", renamed.Name);
        Assert.NotEqual(location.Version, renamed.Version);
        Assert.Equal(renamed, Assert.Single(await ReadAsync<DirectoryLocation[]>(await teacher.GetAsync("/api/locations"))));
        Assert.Equal(pending with { Location = renamed.Name },
            Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending"))));
        Assert.Equal(published with { Location = renamed.Name },
            Assert.Single(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date)))));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LocationDeletePreservesReferences(bool published)
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacherClient, _) = await CreateTeacherAsync(admin);
        using var teacher = teacherClient;
        var location = await CreateDirectoryLocationAsync(admin);
        var entry = await CreateLocatedEventAsync(published ? admin : teacher, location.Id, "Linked workshop", "09:00");
        var path = $"/api/locations/{location.Id}";

        using var rejected = await admin.DeleteAsync($"{path}?version={Uri.EscapeDataString(location.Version)}");

        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        var error = await rejected.Content.ReadFromJsonAsync<LocationError>();
        Assert.Equal("conflict", error?.Code);
        Assert.Equal("Events still use this location. Change those events before deleting it.", error?.Message);
        Assert.Equal(location, Assert.Single(await ReadAsync<DirectoryLocation[]>(await admin.GetAsync("/api/locations"))));
        var eventPath = published ? CalendarPath(Date) : "/api/events/pending";
        Assert.Equal(entry, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync(eventPath))));

        var detached = await ReadAsync<CalendarEvent>(await PatchAsync(admin, $"/api/events/{entry.Id}",
            new { locationId = (int?)null, version = entry.Version }));
        using var deleted = await admin.DeleteAsync(path);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Empty(await ReadAsync<DirectoryLocation[]>(await admin.GetAsync("/api/locations")));
        Assert.Equal(detached, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync(eventPath))));
    }

    [Fact]
    public async Task LocationWritesRejectStaleOrInvalidVersions()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var location = await CreateDirectoryLocationAsync(admin);
        var path = $"/api/locations/{location.Id}";
        Assert.Equal(8, Convert.FromBase64String(location.Version).Length);
        var revised = await ReadAsync<DirectoryLocation>(
            await admin.PutAsJsonAsync(path, new { name = "Updated Workshop" }));
        Assert.NotEqual(location.Version, revised.Version);

        using var staleUpdate = await PatchAsync(admin, path, new { name = "Stale edit", version = location.Version });
        using var staleDelete = await admin.DeleteAsync($"{path}?version={Uri.EscapeDataString(location.Version)}");
        Assert.Equal(HttpStatusCode.Conflict, staleUpdate.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, staleDelete.StatusCode);

        using var invalidUpdate = await PatchAsync(admin, path, new { name = "Invalid edit", version = "invalid" });
        using var invalidDelete = await admin.DeleteAsync($"{path}?version=invalid");
        Assert.Equal(HttpStatusCode.BadRequest, invalidUpdate.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidDelete.StatusCode);
        Assert.Equal(revised, Assert.Single(await ReadAsync<DirectoryLocation[]>(await admin.GetAsync("/api/locations"))));

        using var deleted = await admin.DeleteAsync($"{path}?version={Uri.EscapeDataString(revised.Version)}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
    }

    private static async Task<DirectoryLocation> CreateDirectoryLocationAsync(HttpClient admin) =>
        await ReadAsync<DirectoryLocation>(await admin.PostAsJsonAsync("/api/locations", new { name = "Workshop" }));

    private static async Task<CalendarEvent> CreateLocatedEventAsync(HttpClient actor, int locationId, string title, string time) =>
        await ReadAsync<CalendarEvent>(await actor.PostAsJsonAsync("/api/events", new { title, date = Date, time, locationId }));

    private sealed record DirectoryLocation(int Id, string Name, string Version);
    private sealed record LocationError(string Code, string Message);
}
