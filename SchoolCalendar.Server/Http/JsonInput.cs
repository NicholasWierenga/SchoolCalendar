using System.Buffers;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace SchoolCalendar.Server.Http;

// Keeping field presence lets a patch distinguish an omitted image or location from an explicit clear.
public readonly struct JsonInput
{
    private readonly JsonElement _body;

    public JsonInput(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            throw ApiFailure.Invalid("Send a JSON object.");
        }

        _body = body;
    }

    public bool Has(string name) => _body.TryGetProperty(name, out _);

    public string Text(string name, string? fallback = null)
    {
        if (!_body.TryGetProperty(name, out var element))
        {
            return fallback ?? throw ApiFailure.Invalid($"The {name} field is required.");
        }

        return ReadText(element, name);
    }

    public string? NullableText(string name, string? fallback = null)
    {
        if (!_body.TryGetProperty(name, out var element))
        {
            return fallback;
        }

        return element.ValueKind == JsonValueKind.Null ? null : ReadText(element, name);
    }

    public int? LocationId(int? fallback)
    {
        if (!_body.TryGetProperty("locationId", out var element))
        {
            return fallback;
        }

        return element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.Number when element.TryGetInt32(out var id) => id,
            JsonValueKind.String when int.TryParse(ReadText(element, "locationId"),
                NumberStyles.None, CultureInfo.InvariantCulture, out var id) => id,
            _ => throw ApiFailure.Invalid("Select an existing location.")
        };
    }

    private static string ReadText(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.String)
        {
            throw ApiFailure.Invalid($"The {name} field must be text.");
        }

        try
        {
            return element.GetString()!;
        }
        catch (InvalidOperationException)
        {
            throw ApiFailure.Invalid($"The {name} field contains invalid characters.");
        }
    }
}

public static class CalendarValidation
{
    public static bool IsValidLogin(string? value) =>
        value is { Length: >= 4 and <= 16 } && value.All(char.IsAsciiLetterOrDigit);

    public static void Login(string value)
    {
        if (!IsValidLogin(value))
        {
            throw ApiFailure.Invalid("Enter a logon name of 4 to 16 letters or digits.");
        }
    }

    public static void Password(string value)
    {
        if (value.Length is < 4 or > 16 || value.Any(c => c is < '!' or > '~'))
        {
            throw ApiFailure.Invalid("Enter a password of 4 to 16 letters, digits or punctuation marks.");
        }
    }

    public static void Printable(string value, string label, int min, int max)
    {
        var remaining = value.AsSpan();
        var count = 0;
        while (!remaining.IsEmpty)
        {
            var status = Rune.DecodeFromUtf16(remaining, out var rune, out var consumed);
            if (status != OperationStatus.Done ||
                Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control or UnicodeCategory.Format
                    or UnicodeCategory.Surrogate or UnicodeCategory.PrivateUse or UnicodeCategory.OtherNotAssigned
                    or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator)
            {
                throw ApiFailure.Invalid($"{label} can contain only printable text.");
            }

            remaining = remaining[consumed..];
            count++;
        }

        if (count < min || count > max)
        {
            throw ApiFailure.Invalid($"{label} must contain between {min} and {max} characters.");
        }
    }

    public static DateOnly Date(string? value)
    {
        if (value?.Length != 10 || !DateOnly.TryParseExact(
            value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            throw ApiFailure.Invalid("Enter a valid date in YYYY-MM-DD format.");
        }

        return date;
    }

    public static TimeOnly Time(string value)
    {
        if (value.Length != 5 || !TimeOnly.TryParseExact(
            value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        {
            throw ApiFailure.Invalid("Enter a valid time in HH:mm format.");
        }

        return time;
    }
}
