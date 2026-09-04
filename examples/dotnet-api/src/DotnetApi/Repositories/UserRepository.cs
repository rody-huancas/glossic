using System.Collections.Concurrent;
using DotnetApi.Models;

namespace DotnetApi.Repositories;

public class UserRepository : IUserRepository
{
    private readonly ConcurrentDictionary<Guid, User> _users = new();

    public Task<IReadOnlyList<User>> ListAsync(CancellationToken token)
    {
        IReadOnlyList<User> ordered = _users.Values.OrderBy(user => user.Email).ToList();

        return Task.FromResult(ordered);
    }

    public Task<User?> FindAsync(Guid id, CancellationToken token)
    {
        _users.TryGetValue(id, out var user);

        return Task.FromResult(user);
    }

    public Task AddAsync(User user, CancellationToken token)
    {
        _users[user.Id] = user;

        return Task.CompletedTask;
    }
}
