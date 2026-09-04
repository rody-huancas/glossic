using DotnetApi.Dtos;

namespace DotnetApi.Services;

public interface IUserService
{
    Task<IReadOnlyList<UserResponse>> ListAsync(CancellationToken token);

    Task<UserResponse?> FindAsync(Guid id, CancellationToken token);

    Task<UserResponse> CreateAsync(CreateUserRequest request, CancellationToken token);
}
