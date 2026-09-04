using DotnetApi.Models;

namespace DotnetApi.Repositories;

public interface IUserRepository
{
    Task<IReadOnlyList<User>> ListAsync(CancellationToken token);

    Task<User?> FindAsync(Guid id, CancellationToken token);

    Task AddAsync(User user, CancellationToken token);
}
