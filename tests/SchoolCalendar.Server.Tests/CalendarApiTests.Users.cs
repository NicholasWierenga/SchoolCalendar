using System.Net;
using System.Net.Http.Json;
using SchoolCalendar.AcceptanceHost;

namespace SchoolCalendar.Server.Tests;

public sealed partial class CalendarApiTests
{
    [Fact]
    public async Task UserDirectoryProtectsTheLastActiveApprover()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var original = Assert.Single(await ReadAsync<DirectoryUser[]>(await admin.GetAsync("/api/users")));

        using var blockedDemotion = await admin.PutAsJsonAsync($"/api/users/{original.Id}",
            new { role = "normal", version = original.Version });
        Assert.Equal(HttpStatusCode.Conflict, blockedDemotion.StatusCode);
        Assert.Contains("At least one active approver", await blockedDemotion.Content.ReadAsStringAsync());

        var backup = await CreateDirectoryUserAsync(admin, "backup1", "approver");
        var demoted = await ReadAsync<DirectoryUser>(await PatchAsync(admin, $"/api/users/{backup.Id}",
            new { role = "normal", version = backup.Version }));
        Assert.Equal("normal", demoted.Role);

        var promoted = await ReadAsync<DirectoryUser>(await PatchAsync(admin, $"/api/users/{backup.Id}",
            new { role = "approver", version = demoted.Version }));
        using var removed = await admin.DeleteAsync(VersionedUserPath(promoted));
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);

        using var blockedRemoval = await admin.DeleteAsync($"/api/users/{original.Id}");
        Assert.Equal(HttpStatusCode.Conflict, blockedRemoval.StatusCode);
        Assert.Contains("At least one active approver", await blockedRemoval.Content.ReadAsStringAsync());
        Assert.Equal(original, Assert.Single(await ReadAsync<DirectoryUser[]>(await admin.GetAsync("/api/users"))));
    }

    [Fact]
    public async Task UserDirectoryRejectsStaleEditsAndDeletes()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var created = await CreateDirectoryUserAsync(admin, "versioned1", "normal");
        Assert.Equal(8, Convert.FromBase64String(created.Version).Length);

        var updated = await ReadAsync<DirectoryUser>(await PatchAsync(admin, $"/api/users/{created.Id}",
            new { firstName = "Casey", version = created.Version }));
        Assert.Equal("Casey", updated.FirstName);
        Assert.NotEqual(created.Version, updated.Version);

        using var staleUpdate = await PatchAsync(admin, $"/api/users/{created.Id}",
            new { firstName = "Stale", version = created.Version });
        Assert.Equal(HttpStatusCode.Conflict, staleUpdate.StatusCode);
        using var staleRemoval = await admin.DeleteAsync(VersionedUserPath(created));
        Assert.Equal(HttpStatusCode.Conflict, staleRemoval.StatusCode);
        Assert.Contains(updated, await ReadAsync<DirectoryUser[]>(await admin.GetAsync("/api/users")));

        using var removed = await admin.DeleteAsync(VersionedUserPath(updated));
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        var remaining = await ReadAsync<DirectoryUser[]>(await admin.GetAsync("/api/users"));
        Assert.DoesNotContain(remaining, user => user.Id == created.Id);
    }

    [Fact]
    public async Task UserDirectorySerializesConcurrentApproverRemovalAcrossAppInstances()
    {
        var otherApprover = new TestApprover("approver2", "Second!8", "Ellis", "Hart");
        await using var otherHost = await TestCalendarHost.StartAsync(database, otherApprover);
        using var firstAdmin = await SignInAsync(Administrator.Login, Administrator.Password);
        using var otherAdmin = new HttpClient { BaseAddress = otherHost.Address, Timeout = TimeSpan.FromSeconds(20) };
        using var signIn = await otherAdmin.PostAsJsonAsync("/api/session",
            new { otherApprover.Login, otherApprover.Password });
        Assert.True(signIn.IsSuccessStatusCode, await signIn.Content.ReadAsStringAsync());

        var roster = await ReadAsync<DirectoryUser[]>(await firstAdmin.GetAsync("/api/users"));
        var first = Assert.Single(roster, user => user.Login == Administrator.Login);
        var other = Assert.Single(roster, user => user.Login == otherApprover.Login);
        var demotion = PatchAsync(firstAdmin, $"/api/users/{first.Id}", new { role = "normal", version = first.Version });
        var removal = otherAdmin.DeleteAsync(VersionedUserPath(other));
        await Task.WhenAll(demotion, removal);
        using var demotionResponse = await demotion;
        using var removalResponse = await removal;

        var outcomes = new[] { demotionResponse, removalResponse };
        var accepted = Assert.Single(outcomes, response => response.IsSuccessStatusCode);
        var rejected = Assert.Single(outcomes, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Contains("At least one active approver", await rejected.Content.ReadAsStringAsync());
        var survivingClient = accepted == demotionResponse ? otherAdmin : firstAdmin;
        var survivors = await ReadAsync<DirectoryUser[]>(await survivingClient.GetAsync("/api/users"));
        var activeApprover = Assert.Single(survivors, user => user.Role == "approver");
        Assert.Equal(accepted == demotionResponse ? other : first, activeApprover);
    }

    private static string VersionedUserPath(DirectoryUser user) =>
        $"/api/users/{user.Id}?version={Uri.EscapeDataString(user.Version)}";

    private static async Task<DirectoryUser> CreateDirectoryUserAsync(HttpClient admin, string login, string role) =>
        await ReadAsync<DirectoryUser>(await admin.PostAsJsonAsync("/api/users", new
        {
            login, password = "Roster!8", firstName = "Blair", lastName = "Lee", role
        }));

    private sealed record DirectoryUser(int Id, string Login, string FirstName, string Role, string Version);
}
