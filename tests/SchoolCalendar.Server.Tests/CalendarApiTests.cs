using System.Net;
using System.Net.Http.Json;
using SchoolCalendar.AcceptanceHost;

namespace SchoolCalendar.Server.Tests;

public sealed partial class CalendarApiTests : IAsyncLifetime
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
    public async Task SignInRejectsLoginWithTrailingSpace()
    {
        using var signedIn = await SignInAsync(Administrator.Login, Administrator.Password);
        using var session = await signedIn.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);

        using var visitor = CreateClient();
        using var paddedLogin = await visitor.PostAsJsonAsync("/api/session", new
        {
            login = Administrator.Login + " ",
            password = Administrator.Password,
        });
        Assert.Equal(HttpStatusCode.Unauthorized, paddedLogin.StatusCode);

        using var noSession = await visitor.GetAsync("/api/session");
        Assert.Equal(HttpStatusCode.Unauthorized, noSession.StatusCode);
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
    public async Task ApproversCanReviewPublishedAndPendingEventsWithinTheCalendarRange()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            var request = await CreateEventAsync(teacher, "Choir proposal", Date, "08:00");
            var published = await CreateEventAsync(admin, "Jazz practice", FollowingDate, "13:00");
            var later = await CreateEventAsync(teacher, "Later proposal", "2028-03-02", "09:00");
            var range = $"?from={Date}&to={FollowingDate}";
            var review = "/api/events/manage" + range;

            Assert.Equal(new[] { request, published }, await ReadAsync<CalendarEvent[]>(await admin.GetAsync(review)));
            Assert.Equal(new[] { request, published, later }, await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/manage")));
            Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync(review)).StatusCode);
            Assert.Equal(new[] { published }, await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events" + range)));
            Assert.Equal(new[] { published }, await ReadAsync<CalendarEvent[]>(await teacher.GetAsync("/api/events" + range)));
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
    public async Task EditAndApprovePublishesRevisedProposalWithOriginalCreator()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            var location = await ReadAsync<Location>(await admin.PostAsJsonAsync("/api/locations", new { name = "Gym" }));
            var pending = await ReadAsync<CalendarEvent>(await teacher.PostAsJsonAsync("/api/events", new
            {
                title = "Science fair", description = "Student exhibits", date = Date, time = "15:00",
                locationId = location.Id, image = "football",
            }));

            var approved = await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync($"/api/events/{pending.Id}/approve", new
            {
                version = pending.Version,
                changes = new
                {
                    title = "Science exhibition", date = FollowingDate, time = "16:00", locationId = (int?)null,
                    creatorName = "Forged", approverName = "Forged", approvedAt = pending.CreatedAt.AddDays(-1),
                },
            }));

            Assert.Equal("Science exhibition", approved.Title);
            Assert.Equal("Student exhibits", approved.Description);
            Assert.Equal(FollowingDate, approved.Date);
            Assert.Equal("16:00", approved.Time);
            Assert.Null(approved.LocationId);
            Assert.Null(approved.Location);
            Assert.Equal("football", approved.Image);
            Assert.Equal("approved", approved.Status);
            Assert.Equal(pending.CreatorName, approved.CreatorName);
            Assert.Equal(pending.CreatedAt, approved.CreatedAt);
            Assert.Equal("Baker, Celia Renee", approved.ApproverName);
            Assert.InRange(Assert.IsType<DateTimeOffset>(approved.ApprovedAt), pending.CreatedAt, DateTimeOffset.UtcNow.AddSeconds(5));
            Assert.NotEqual(pending.Version, approved.Version);
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));
            Assert.Equal(approved, Assert.Single(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(FollowingDate)))));
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending")));
        }
    }

    [Fact]
    public async Task EditAndApproveChecksCapacityOnTheRevisedDateAndPreservesRejectedProposal()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            for (var index = 0; index < 10; index++)
            {
                await CreateEventAsync(admin, $"Event {index}", Date, $"08:{index:00}");
            }

            var first = await CreateEventAsync(teacher, "Can move", Date, "10:00");
            var moved = await ReadAsync<CalendarEvent>(await admin.PostAsJsonAsync($"/api/events/{first.Id}/approve",
                new { version = first.Version, changes = new { date = FollowingDate } }));
            Assert.Equal(FollowingDate, moved.Date);
            Assert.Equal("approved", moved.Status);

            var second = await CreateEventAsync(teacher, "Keep pending", FollowingDate, "11:00");
            using var rejected = await admin.PostAsJsonAsync($"/api/events/{second.Id}/approve",
                new { version = second.Version, changes = new { date = Date, title = "Uncommitted" } });
            Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
            Assert.Equal("capacity", (await rejected.Content.ReadFromJsonAsync<ApiError>())?.Code);
            Assert.Equal(second, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending"))));
            Assert.Equal(moved, Assert.Single(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(FollowingDate)))));
            Assert.Equal(10, (await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date)))).Length);
        }
    }

    [Fact]
    public async Task EditAndApproveRejectsUnauthorizedStaleAndInvalidChanges()
    {
        using var admin = await SignInAsync(Administrator.Login, Administrator.Password);
        var (teacher, _) = await CreateTeacherAsync(admin);
        using (teacher)
        {
            var pending = await CreateEventAsync(teacher, "Science fair", Date, "15:00");
            var approval = $"/api/events/{pending.Id}/approve";
            var edit = new { version = pending.Version, changes = new { title = "Uncommitted" } };
            using var forbidden = await teacher.PostAsJsonAsync(approval, edit);
            Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

            var revised = await ReadAsync<CalendarEvent>(await PatchAsync(admin,
                $"/api/events/{pending.Id}", new { version = pending.Version, title = "Revised proposal" }));
            using var stale = await admin.PostAsJsonAsync(approval, edit);
            Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

            using var missingVersion = await admin.PostAsJsonAsync(approval, new { changes = edit.changes });
            Assert.Equal(HttpStatusCode.BadRequest, missingVersion.StatusCode);

            using var invalid = await admin.PostAsJsonAsync(approval,
                new { version = revised.Version, changes = new { title = "Uncommitted", date = "2027-02-29" } });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
            Assert.Equal(revised, Assert.Single(await ReadAsync<CalendarEvent[]>(await admin.GetAsync("/api/events/pending"))));
            Assert.Empty(await ReadAsync<CalendarEvent[]>(await teacher.GetAsync(CalendarPath(Date))));
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
    private sealed record Location(int Id);
    private sealed record ApiError(string Code);
    private sealed record CalendarEvent(
        int Id, string Title, string Description, int? LocationId, string? Location, string Date, string Time,
        string? Image, string Status, string CreatorName, string? ApproverName, DateTimeOffset CreatedAt,
        DateTimeOffset? ApprovedAt, string Version);
}
