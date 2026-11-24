using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Events;
using SchoolCalendar.Server.Http;
using SchoolCalendar.Server.Locations;
using SchoolCalendar.Server.Users;

namespace SchoolCalendar.Server.Data;

internal static class CalendarSeed
{
    private const string DemoPassword = "Calendar1!";

    public static async Task InitializeAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<CalendarDbContext>();
        var configuration = services.GetRequiredService<IConfiguration>();
        var hasher = services.GetRequiredService<IPasswordHasher<CalendarUser>>();
        var clock = services.GetRequiredService<TimeProvider>();

        await using var transaction = await DatabaseLock.AcquireAsync(db, "SchoolCalendar:Initialize");
        if (configuration.GetValue<bool>("Calendar:SeedDemoData") && !await db.Users.AnyAsync())
        {
            SeedDemo(db, hasher, clock.GetUtcNow());
            await db.SaveChangesAsync();
        }

        var bootstrap = configuration.GetSection("Calendar:BootstrapApprover");
        if (bootstrap.Exists())
        {
            var login = Required(bootstrap, "Login");
            if (!await db.Users.AnyAsync(user => user.Login == login))
            {
                var password = Required(bootstrap, "Password");
                var firstName = Required(bootstrap, "FirstName");
                var middleName = bootstrap["MiddleName"] ?? "";
                var lastName = Required(bootstrap, "LastName");
                CalendarValidation.Login(login);
                CalendarValidation.Password(password);
                CalendarValidation.Printable(firstName, "First name", 1, 25);
                CalendarValidation.Printable(middleName, "Middle name", 0, 25);
                CalendarValidation.Printable(lastName, "Last name", 1, 25);
                db.Users.Add(NewUser(hasher, login, firstName, lastName, Roles.Approver, password, middleName));
                await db.SaveChangesAsync();
            }
        }

        await transaction.CommitAsync();
    }

    private static string Required(IConfiguration configuration, string name) =>
        configuration[name] ?? throw new InvalidOperationException($"Calendar bootstrap configuration is missing {name}.");

    private static void SeedDemo(CalendarDbContext db, IPasswordHasher<CalendarUser> hasher, DateTimeOffset now)
    {
        var approver = NewUser(hasher, "approver", "Elena", "Rivera", Roles.Approver, DemoPassword);
        var teacher = NewUser(hasher, "teacher", "Mira", "Reyes", Roles.Normal, DemoPassword);
        CalendarUser[] users =
        [
            approver, teacher,
            Staff("jonahbell", "Jonah", "Bell"),
            Staff("theobrooks", "Theo", "Brooks"),
            Staff("rowandunn", "Rowan", "Dunn"),
            Staff("norafinch", "Nora", "Finch"),
            Staff("devonhale", "Devon", "Hale"),
            Staff("taliamoss", "Talia", "Moss"),
            Staff("elliotpark", "Elliot", "Park"),
            Staff("leenashah", "Leena", "Shah"),
            Staff("anikavega", "Anika", "Vega")
        ];
        db.Users.AddRange(users);

        var creators = users.ToDictionary(user => user.Login);
        var locations = DemoEvents.Select(entry => entry.Location).Distinct()
            .ToDictionary(name => name, name => new Location { Name = name });
        db.Locations.AddRange(locations.Values);

        foreach (var sample in DemoEvents)
        {
            var creator = creators[sample.Login];
            var entry = new CalendarEvent
            {
                Title = sample.Title,
                Description = sample.Description,
                Date = new DateOnly(2027, 4, sample.Day),
                Time = TimeOnly.ParseExact(sample.Time, "HH:mm", CultureInfo.InvariantCulture),
                Location = locations[sample.Location],
                Creator = creator,
                CreatorName = creator.DisplayName,
                CreatedAt = now.AddDays(-7)
            };
            if (sample.Approved)
            {
                entry.Approve(approver, now.AddDays(-6));
            }

            db.Events.Add(entry);
        }

        CalendarUser Staff(string login, string firstName, string lastName) =>
            NewUser(hasher, login, firstName, lastName, Roles.Normal,
                Convert.ToHexString(RandomNumberGenerator.GetBytes(8)));
    }

    private static CalendarUser NewUser(
        IPasswordHasher<CalendarUser> hasher, string login, string firstName, string lastName,
        string role, string password, string middleName = "")
    {
        var user = new CalendarUser
        {
            Login = login,
            FirstName = firstName,
            MiddleName = middleName,
            LastName = lastName,
            Role = role
        };
        user.PasswordHash = hasher.HashPassword(user, password);
        return user;
    }

    private sealed record SampleEvent(
        int Day, string Time, string Title, string Location, string Login, string Description, bool Approved = true);

    private static readonly SampleEvent[] DemoEvents =
    [
        new(16, "07:45", "Jazz Lab", "Band Room", "taliamoss",
            "The jazz ensemble rehearses its spring concert opener and trades eight-bar solos."),
        new(16, "08:30", "Book Swap", "Library", "jonahbell",
            "Bring a gently used book and trade it for a new read at the library doors."),
        new(16, "09:15", "Science Expo", "Gym", "teacher",
            "Sixth graders demonstrate their water filters and share which materials worked best."),
        new(16, "10:30", "Poetry Reading", "Room 204", "norafinch",
            "Seventh graders read original poems about places in their neighborhood."),
        new(16, "11:15", "Garden Crew", "Courtyard", "devonhale",
            "Plant sugar snap peas along the new trellis by the courtyard gate."),
        new(16, "12:15", "Chess Club", "Room 108", "elliotpark",
            "Pair up for ten-minute lunch games. Spare boards are available."),
        new(16, "12:15", "Mural Planning", "Art Studio", "anikavega",
            "Sketch local birds for the spring hallway mural with the art club."),
        new(16, "13:30", "Choir Rehearsal", "Auditorium", "leenashah",
            "Run both spring concert pieces with the piano accompanist."),
        new(16, "14:20", "Robotics Demo", "Makerspace", "theobrooks",
            "Watch a student-built robot follow a taped course through the makerspace."),
        new(16, "15:30", "Track Practice", "Athletic Field", "rowandunn",
            "Practice relay handoffs, then finish with timed 200-meter runs."),
        new(2, "10:00", "Author Visit", "Library", "jonahbell",
            "Meet a local writer and hear how a picture book takes shape."),
        new(5, "15:15", "Art Club", "Art Studio", "anikavega",
            "Experiment with block printing on recycled paper."),
        new(7, "08:00", "Choir", "Auditorium", "leenashah",
            "Practice harmonies for the spring program."),
        new(9, "15:30", "Track Meet", "Athletic Field", "rowandunn",
            "Cheer on the relay teams at the home meet."),
        new(12, "12:15", "Chess Club", "Room 108", "elliotpark",
            "Try a new opening with a partner over lunch."),
        new(14, "14:20", "Robotics Club", "Makerspace", "theobrooks",
            "Fit and test the sensors for Friday’s demonstration."),
        new(15, "15:00", "Stage Crew", "Auditorium", "leenashah",
            "Set the stage and check the choir microphones."),
        new(19, "08:15", "Book Club", "Library", "jonahbell",
            "Discuss the final chapters of the spring reading selection."),
        new(21, "11:15", "Garden Crew", "Courtyard", "devonhale",
            "Water the seedlings and mark each new row."),
        new(22, "10:30", "Earth Day Walk", "West Gate", "teacher",
            "Join the science teachers for a walk along the nature trail."),
        new(26, "14:20", "Math Circle", "Room 108", "elliotpark",
            "Solve geometry puzzles together after class."),
        new(28, "15:15", "Art Club", "Art Studio", "anikavega",
            "Print the final designs for the spring exhibit."),
        new(30, "18:00", "Spring Concert", "Auditorium", "taliamoss",
            "Hear the choir and jazz ensemble perform for families."),
        new(20, "17:30", "Family Reading Night", "Library", "jonahbell",
            "Families can join short readings and take home a book.", Approved: false),
        new(22, "15:15", "Seedling Exchange", "Courtyard", "teacher",
            "Bring one seedling to swap with another class.", Approved: false),
        new(27, "14:30", "Field Day Volunteers", "Gym", "rowandunn",
            "Meet with the PE staff to choose an activity station.", Approved: false)
    ];
}
