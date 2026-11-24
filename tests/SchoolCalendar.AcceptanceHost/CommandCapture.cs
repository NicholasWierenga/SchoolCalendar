using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace SchoolCalendar.AcceptanceHost;

internal sealed class CommandCapture : DbCommandInterceptor
{
    private readonly object gate = new();
    private List<CommandRecord>? activeCommands;

    public void Start()
    {
        lock (gate)
        {
            activeCommands = [];
        }
    }

    public IReadOnlyList<CommandRecord> Stop()
    {
        lock (gate)
        {
            var recorded = activeCommands ?? throw new InvalidOperationException("No EF command capture is active.");
            activeCommands = null;
            return recorded;
        }
    }

    private void Record(DbCommand command)
    {
        lock (gate)
        {
            if (activeCommands is null)
            {
                return;
            }

            activeCommands.Add(new CommandRecord(
                "ef-core",
                command.CommandType == CommandType.StoredProcedure ? "procedure" : "text",
                command.CommandText,
                command.Parameters.Cast<DbParameter>().Select(parameter => parameter.Value).OfType<string>().ToArray()));
        }
    }

    public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        Record(command);
        return result;
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
    {
        Record(command);
        return ValueTask.FromResult(result);
    }

    public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result)
    {
        Record(command);
        return result;
    }

    public override ValueTask<int> NonQueryExecutedAsync(
        DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        Record(command);
        return ValueTask.FromResult(result);
    }

    internal sealed record CommandRecord(string Source, string CommandType, string CommandText, string[] Arguments);
}
