using DotnetApi.Models;

namespace DotnetApi.Dtos;

public record UserResponse(Guid Id, string Email, string DisplayName, DateTimeOffset CreatedAt)
{
    public static UserResponse From(User user) =>
        new(user.Id, user.Email, user.DisplayName, user.CreatedAt);
}
