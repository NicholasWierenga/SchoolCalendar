using System.Net;
using System.Net.Http.Json;
using SchoolCalendar.AcceptanceHost;

namespace SchoolCalendar.Server.Tests;

public sealed class CalendarApiTests : IAsyncLifetime
{
    private const string Date = "2028-02-29";
    private const string FollowingDate = "2028-03-01";
    private static readonly TestApprover Administrator = new("approver1", "Apr!2028", "Celia", "Baker", "Renee");
    private readonly TestDatabase database = TestDatabase.Create();
    private TestCalendarHost host = null!;

    public async Task InitializeAsync() => host = await TestCalendarHost.StartAsync(database, Administrator);

    public async Task DisposeAsync()
    {
        try
        {
            if (host is not null)
            {
                await host.DisposeAsync();
            }
        }
        finally
        {
            await database.DropAsync();
        }
    }

    [Fact]
    public async Task ProtectedRoutesEnforceCurrentRoleAndCredentialChanges()
    {
        using var visitor = CreateClient();
        using var unauthorized = await visitor.GetAsync(CalendarPath(Date));
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, id) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            using var forbidden = await PatchAsync(teacher, $"/api/users/{id}", new { role = "approver" });
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

            using var queue = await teacher.GetAsync("/api/events/pending");
            Assert.Equal(HttpStatusCode.Forbidden, queue.StatusCode);
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));

            using var change = await PatchAsync(admin, $"/api/users/{id}", new { password = "Changed!8", role = "approver" });
            Assert.True(change.IsSuccessStatusCode, await change.Content.ReadAsStringAsync());
            using var expiredSession = await teacher.GetAsync("/api/events/pending");
            Assert.Equal(HttpStatusCode.Unauthorized, expiredSession.StatusCode);

            using var oldPassword = await visitor.PostAsJsonAsync("/api/session", new { login = "teacher1", password = "Tch!2028" });
            Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);

            using var promoted = await SignInAsync("teacher1", "Changed!8");
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await promoted.GetAsync("/api/events/pending")));
            using var signOut = await promoted.DeleteAsync("/api/session");
            Assert.True(signOut.IsSuccessStatusCode, await signOut.Content.ReadAsStringAsync());
            using var signedOut = await promoted.GetAsync(CalendarPath(Date));
            Assert.Equal(HttpStatusCode.Unauthorized, signedOut.StatusCode);
        }
    }

    [Fact]
    public async Task AuthenticatedActorsOwnAuditFieldsAndMovingPreservesThem()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            var earliest = DateTimeOffset.UtcNow.AddSeconds(-5);
            var pending = await ReadAsync<CalendarEvent>(await teacher.PostAsJsonAsync("/api/events", new
            {
                title = "Science fair", date = Date, time = "15:00", image = "football",
                status = "approved", creatorName = "Forged", approverName = "Forged", approvedAt = earliest,
            }));
            Assert.Equal("pending", pending.Status);
            Assert.Equal("Ng, Avery", pending.CreatorName);
            Assert.Null(pending.ApproverName);
            Assert.Null(pending.ApprovedAt);
            Assert.InRange(pending.CreatedAt, earliest, DateTimeOffset.UtcNow.AddSeconds(5));
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));

            var approved = await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync(
                $"/api/events/{pending.Id}/approve", new { version = pending.Version }));
            Assert.Equal("approved", approved.Status);
            Assert.Equal("Baker, Celia Renee", approved.ApproverName);
            Assert.Equal(pending.CreatedAt, approved.CreatedAt);
            Assert.InRange(Assert.IsType<DateTimeOffset>(approved.ApprovedAt), pending.CreatedAt, DateTimeOffset.UtcNow.AddSeconds(5));

            var moved = await ReadAsync<CalendarEvent>(await PatchAsync(admin, $"/api/events/{pending.Id}",
                new { date = FollowingDate, time = "16:00", version = approved.Version }));
            Assert.Equal(approved with { Date = FollowingDate, Time = "16:00", Version = moved.Version }, moved);
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));
            Assert.Equal(moved, Assert.Single(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(FollowingDate)))));
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending")));
        }
    }

    [Fact]
    public async Task ConcurrentApprovalsLeaveExactlyOneProposalPending()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        using var secondAdmin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            for (var index = 0; index < 9; index++)
            {
                await CreateEventAsync(admin, $"Event {index}", Date, $"08:{index:00}");
            }

            var first = await CreateEventAsync(teacher, "First contender", Date, "09:00");
            var second = await CreateEventAsync(teacher, "Second contender", Date, "10:00");
            var outcomes = await Task.WhenAll(
                admin.PostAsync($"/api/events/{first.Id}/approve", null),
                secondAdmin.PostAsJsonAsync($"/api/events/{second.Id}/approve", new { }));
            using var accepted = Assert.Single(outcomes, response => response.IsSuccessStatusCode);
            using var rejected = Assert.Single(outcomes, response => !response.IsSuccessStatusCode);
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal("capacity", (await rejected.Content.ReadFromJsonAsync<ApiError>())?.Code);
            var winner = await accepted.Content.ReadFromJsonAsync<CalendarEvent>();
            Assert.NotNull(winner);
            var loser = winner.Id == first.Id ? second : first;
            var calendar = await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date)));
            Assert.Equal(10, calendar.Length);
            Assert.Contains(winner, calendar);
            Assert.DoesNotContain(calendar, row => row.Id == loser.Id);
            Assert.Equal(loser, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending"))));
        }
    }

    [Fact]
    public async Task StaleAndInvalidEditsPreservePublishedEvent()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var created = await CreateEventAsync(admin, string.Concat(Enumerable.Repeat("🎓", 25)), Date, "23:59");
        Assert.Equal("approved", created.Status);
        Assert.Equal(created.CreatorName, created.ApproverName);

        var revised = await ReadAsync<CalendarEvent>(await PatchAsync(admin, $"/api/events/{created.Id}",
            new { title = "Graduation", version = created.Version }));
        Assert.NotEqual(created.Version, revised.Version);
        using var stale = await PatchAsync(admin, $"/api/events/{created.Id}",
            new { title = "Stale edit", version = created.Version });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        using var invalid = await PatchAsync(admin, $"/api/events/{created.Id}",
            new { title = "Uncommitted", date = "2027-02-29", version = revised.Version });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(revised, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync(CalendarPath(Date)))));
    }

    private HttpClient CreateClient() => new(new HttpClientHandler { AllowAutoRedirect = false })
    {
        BaseAddress = host.Address,
        Timeout = TimeSpan.FromSeconds(20),
    };

    private async Task<HttpClient> SignInAsync(string login, string password)
    {
        var client = CreateClient();
        try
        {
            using var response = await client.PostAsJsonAsync("/api/session", new { login, password });
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    private async Task<(HttpClient Client, int Id)> CreateTeacherAsync(HttpClient admin)
    {
        const string login = "teacher1";
        const string password = "Tch!2028";
        var teacher = await ReadAsync<User>(await admin.PostAsJsonAsync("/api/users", new
        {
            login, password, firstName = "Avery", lastName = "Ng", role = "normal",
        }));
        return (await SignInAsync(login, password), teacher.Id);
    }

    private static async Task<CalendarEvent> CreateEventAsync(HttpClient actor, string title, string date, string time) =>
        await ReadAsync<CalendarEvent>(await actor.PostAsJsonAsync("/api/events", new { title, date, time }));

    private static string CalendarPath(string date) => $"/api/events?from={date}&to={date}";

    private static async Task<HttpResponseMessage> PatchAsync(HttpClient actor, string path, object patch)
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, path) { Content = JsonContent.Create(patch) };
        return await actor.SendAsync(request);
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response)
    {
        using (response)
        {
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            return (await response.Content.ReadFromJsonAsync<T>())!;
        }
    }

    private sealed record User(int Id);
    private sealed record ApiError(string Code);
    private sealed record CalendarEvent(
        int Id, string Title, string Date, string Time, string? Image, string Status, string CreatorName,
        string? ApproverName, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt, string Version);
}
