using Microsoft.EntityFrameworkCore;
using SchoolCalendar.Server.Events;
using SchoolCalendar.Server.Locations;
using SchoolCalendar.Server.Users;

namespace SchoolCalendar.Server.Data;

public sealed class CalendarDbContext(DbContextOptions<CalendarDbContext> options) : DbContext(options)
{
    public DbSet<CalendarUser> Users => Set<CalendarUser>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CalendarUser>(user =>
        {
            user.ToTable(table => table.HasCheckConstraint("CK_Users_Role", "[Role] IN ('normal', 'approver')"));
            user.Property(x => x.Login).IsUnicode(false).HasMaxLength(16).UseCollation("Latin1_General_100_BIN2");
            user.Property(x => x.PasswordHash).IsUnicode(false).HasMaxLength(256);
            // SQL Server's Unicode length is in UTF-16 units, while the form limits count code points.
            user.Property(x => x.FirstName).HasMaxLength(50);
            user.Property(x => x.MiddleName).HasMaxLength(50);
            user.Property(x => x.LastName).HasMaxLength(50);
            user.Property(x => x.Role).IsUnicode(false).HasMaxLength(8);
            user.Property(x => x.Version).IsRowVersion();
            user.HasIndex(x => x.Login).IsUnique().HasFilter("[IsDeleted] = 0");
        });

        modelBuilder.Entity<Location>(location =>
        {
            location.Property(x => x.Name).HasMaxLength(100);
            location.Property(x => x.Version).IsRowVersion();
        });

        modelBuilder.Entity<CalendarEvent>(entry =>
        {
            entry.Property(x => x.Title).HasMaxLength(50);
            entry.Property(x => x.Description).HasMaxLength(510);
            entry.Property(x => x.Time).HasPrecision(0);
            entry.Property(x => x.Status).IsUnicode(false).HasMaxLength(8);
            entry.Property(x => x.CreatorName).HasMaxLength(153);
            entry.Property(x => x.ApproverName).HasMaxLength(153);
            entry.Property(x => x.Version).IsRowVersion();
            entry.HasIndex(x => new { x.Status, x.Date, x.Time });
            entry.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.NoAction);
            entry.HasOne(x => x.Creator).WithMany().HasForeignKey(x => x.CreatorId).OnDelete(DeleteBehavior.NoAction);
            entry.HasOne(x => x.Approver).WithMany().HasForeignKey(x => x.ApproverId).OnDelete(DeleteBehavior.NoAction);

            entry.ToTable(table => table.HasCheckConstraint("CK_Events_Approval", """
                ([Status] = 'pending' AND [ApproverId] IS NULL AND [ApproverName] IS NULL AND [ApprovedAt] IS NULL)
                OR
                ([Status] = 'approved' AND [ApproverId] IS NOT NULL AND [ApproverName] IS NOT NULL AND [ApprovedAt] IS NOT NULL)
                """));
        });
    }
}
