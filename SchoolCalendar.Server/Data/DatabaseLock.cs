using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SchoolCalendar.Server.Http;

namespace SchoolCalendar.Server.Data;

internal static class DatabaseLock
{
    public static async Task<IDbContextTransaction> AcquireAsync(
        CalendarDbContext db, string resource, CancellationToken cancellationToken = default)
    {
        var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            // Transaction-owned SQL Server locks coordinate all app processes using this database.
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock
                    @Resource = {resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
                IF @result < 0 THROW 51000, 'Could not lock calendar records.', 1;
                """, cancellationToken);
            return transaction;
        }
        catch (Exception exception)
        {
            await transaction.DisposeAsync();
            if (exception is SqlException { Number: 51000 })
            {
                throw ApiFailure.Conflict("The calendar is busy. Try again.");
            }

            throw;
        }
    }
}
