using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace SchoolCalendar.AcceptanceHost;

public sealed class TestDatabase
{
    private readonly string name;
    private readonly SqlConnectionStringBuilder server;

    public TestDatabase(string name)
    {
        if (!Regex.IsMatch(name, @"\ASchoolCalendarTest_[0-9a-f]{32}\z", RegexOptions.CultureInvariant))
        {
            throw new ArgumentException("Expected a disposable test database name.", nameof(name));
        }

        this.name = name;
        server = new SqlConnectionStringBuilder(
            Environment.GetEnvironmentVariable("SCHOOLCALENDAR_TEST_SQL_CONNECTION") ??
            @"Server=(localdb)\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=true")
        {
            InitialCatalog = "master",
            AttachDBFilename = string.Empty,
            Pooling = false
        };
    }

    public string ConnectionString => new SqlConnectionStringBuilder(server.ConnectionString)
    {
        InitialCatalog = name
    }.ConnectionString;

    public static TestDatabase Create() => new($"SchoolCalendarTest_{Guid.NewGuid():N}");

    public async Task DropAsync()
    {
        await using var connection = new SqlConnection(server.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"""
            IF DB_ID(@name) IS NOT NULL
            BEGIN
              ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
              DROP DATABASE [{name}];
            END
            """;
        command.Parameters.AddWithValue("@name", name);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<object> ReadAsync()
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        var users = await ReadRowsAsync(connection, """
            SELECT Id AS id, Login AS login, FirstName AS firstName, MiddleName AS middleName,
                   LastName AS lastName, Role AS role
            FROM dbo.Users WHERE IsDeleted = 0 ORDER BY Id;
            """);
        var locations = await ReadRowsAsync(connection, """
            SELECT Id AS id, Name AS name FROM dbo.Locations ORDER BY Id;
            """);
        var events = await ReadRowsAsync(connection, """
            SELECT Id AS id, Title AS title, Description AS description, LocationId AS locationId,
                   [Date] AS date, [Time] AS time, Image AS image, Status AS status,
                   CreatorName AS creatorName, CreatedAt AS createdAt,
                   ApproverName AS approverName, ApprovedAt AS approvedAt
            FROM dbo.Events ORDER BY Id;
            """);
        return new { users, locations, events };
    }

    private static async Task<List<Dictionary<string, object?>>> ReadRowsAsync(
        SqlConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync())
        {
            var row = new Dictionary<string, object?>();
            for (var index = 0; index < reader.FieldCount; index++)
            {
                var column = reader.GetName(index);
                var value = reader.GetValue(index);
                row[column] = value switch
                {
                    DBNull => null,
                    DateTime date when column == "date" => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    TimeSpan time when column == "time" => time.ToString(@"hh\:mm", CultureInfo.InvariantCulture),
                    _ => value
                };
            }

            rows.Add(row);
        }

        return rows;
    }
}
