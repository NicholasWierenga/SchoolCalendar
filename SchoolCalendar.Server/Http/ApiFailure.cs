using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace SchoolCalendar.Server.Http;

public sealed class ApiFailure(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    private object Body => new { code = Code, message = Message };

    public IResult ToResult() => Results.Json(Body, statusCode: Status);

    public static ApiFailure Invalid(string message) => new(400, "invalid", message);
    public static ApiFailure Unauthenticated(string message = "Sign in to continue.") =>
        new(401, "unauthenticated", message);
    public static ApiFailure Forbidden() => new(403, "forbidden", "This action requires approver access.");
    public static ApiFailure NotFound(string item) => new(404, "not_found", $"{item} was not found.");
    public static ApiFailure Conflict(string message) => new(409, "conflict", message);
    public static ApiFailure Capacity(DateOnly date, int limit) =>
        new(409, "capacity", $"{date:MMM d, yyyy} already has {limit} approved events.");
    internal static ApiFailure RecordChanged() => Conflict("This record changed. Reload it and try again.");

    public Task WriteAsync(HttpContext context, CancellationToken cancellationToken)
    {
        context.Response.StatusCode = Status;
        return context.Response.WriteAsJsonAsync(Body, cancellationToken: cancellationToken);
    }

    public static bool IsSqlError(DbUpdateException exception, int number) =>
        exception.InnerException is SqlException sqlError && sqlError.Number == number;

    public static void CheckVersion(byte[] currentVersion, string? expectedVersion)
    {
        if (expectedVersion is null)
        {
            return;
        }

        Span<byte> decoded = stackalloc byte[8];
        if (!Convert.TryFromBase64String(expectedVersion, decoded, out var length) || length != decoded.Length)
        {
            throw Invalid("The record version is invalid.");
        }

        if (!decoded.SequenceEqual(currentVersion))
        {
            throw RecordChanged();
        }
    }
}

public sealed class ApiExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var error = exception switch
        {
            ApiFailure failure => failure,
            BadHttpRequestException badRequest =>
                new ApiFailure(badRequest.StatusCode, "invalid", "The request could not be read."),
            JsonException => ApiFailure.Invalid("The request could not be read."),
            DbUpdateConcurrencyException => ApiFailure.RecordChanged(),
            _ => null
        };
        if (error is null)
        {
            return false;
        }

        await error.WriteAsync(httpContext, cancellationToken);
        return true;
    }
}
