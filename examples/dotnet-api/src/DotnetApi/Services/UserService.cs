using DotnetApi.Dtos;
using DotnetApi.Models;
using DotnetApi.Repositories;

namespace DotnetApi.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _repository;

    public UserService(IUserRepository repository) => _repository = repository;

    public async Task<IReadOnlyList<UserResponse>> ListAsync(CancellationToken token)
    {
        var users = await _repository.ListAsync(token);

        return users.Select(UserResponse.From).ToList();
    }

    public async Task<UserResponse?> FindAsync(Guid id, CancellationToken token)
    {
        var user = await _repository.FindAsync(id, token);

        return user is null ? null : UserResponse.From(user);
    }

    public async Task<UserResponse> CreateAsync(CreateUserRequest request, CancellationToken token)
    {
        var user = new User
        {
            Id          = Guid.NewGuid(),
            Email       = request.Email.Trim().ToLowerInvariant(),
            DisplayName = request.DisplayName.Trim(),
        };

        await _repository.AddAsync(user, token);

        return UserResponse.From(user);
    }
}
