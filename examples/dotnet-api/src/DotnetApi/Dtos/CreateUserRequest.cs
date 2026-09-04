using System.ComponentModel.DataAnnotations;

namespace DotnetApi.Dtos;

public record CreateUserRequest(
    [property: Required, EmailAddress] string Email,
    [property: Required, MaxLength(120)] string DisplayName);
