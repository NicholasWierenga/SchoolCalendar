using System.Text.Json.Serialization;

namespace SchoolCalendar.Server.Users;

public static class Roles
{
    public const string Normal = "normal";
    public const string Approver = "approver";
}

public sealed class CalendarUser
{
    public int Id { get; set; }
    public string Login { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string MiddleName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Role { get; set; } = Roles.Normal;
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
    public bool IsDeleted { get; set; }
    public byte[] Version { get; set; } = [];

    public string DisplayName => MiddleName.Length == 0
        ? $"{LastName}, {FirstName}"
        : $"{LastName}, {FirstName} {MiddleName}";
}

public sealed record UserResponse(
    int Id, string Login, string FirstName, string MiddleName, string LastName, string Role)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public byte[]? Version { get; init; }

    public static UserResponse From(CalendarUser user, bool includeVersion = false) =>
        new(user.Id, user.Login, user.FirstName, user.MiddleName, user.LastName, user.Role)
        {
            Version = includeVersion ? user.Version : null
        };
}
