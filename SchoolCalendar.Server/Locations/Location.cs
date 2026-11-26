namespace SchoolCalendar.Server.Locations;

public sealed class Location
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public byte[] Version { get; set; } = [];
}

public sealed record LocationResponse(int Id, string Name, string Version)
{
    public static LocationResponse From(Location location) =>
        new(location.Id, location.Name, Convert.ToBase64String(location.Version));
}
