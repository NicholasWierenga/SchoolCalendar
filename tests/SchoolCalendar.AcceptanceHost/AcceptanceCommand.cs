using System.Text.Json;

namespace SchoolCalendar.AcceptanceHost;

internal static class AcceptanceCommand
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string ReplyPrefix = "SchoolCalendar fixture ";

    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "drop")
            {
                await new TestDatabase(args[1]).DropAsync();
                return 0;
            }

            if (args.Length != 2 || args[0] != "serve")
            {
                throw new ArgumentException("Expected 'serve <test database>' or 'drop <test database>'.");
            }

            await ServeAsync(new TestDatabase(args[1]));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }

    private static async Task ServeAsync(TestDatabase database)
    {
        var input = await Console.In.ReadLineAsync() ?? throw new InvalidOperationException("Missing fixture settings.");
        var settings = JsonSerializer.Deserialize<FixtureSettings>(input, Json)
            ?? throw new InvalidOperationException("Missing fixture settings.");
        var capture = new CommandCapture();
        await using var host = await TestCalendarHost.StartAsync(database, settings.Approver, settings.SeedDemoData, capture);
        Reply(new { address = host.Address });

        while (await Console.In.ReadLineAsync() is { } command && command != "stop")
        {
            try
            {
                switch (command)
                {
                    case "read-sql":
                        Reply(await database.ReadAsync());
                        break;
                    case "start-capture":
                        capture.Start();
                        Reply(true);
                        break;
                    case "stop-capture":
                        Reply(capture.Stop());
                        break;
                    default:
                        throw new ArgumentException($"Unknown fixture command '{command}'.");
                }
            }
            catch (Exception error)
            {
                Reply(new { error = error.Message });
            }
        }
    }

    private static void Reply(object value) => Console.WriteLine(ReplyPrefix + JsonSerializer.Serialize(value, Json));

    private sealed record FixtureSettings(TestApprover Approver, bool SeedDemoData);
}
