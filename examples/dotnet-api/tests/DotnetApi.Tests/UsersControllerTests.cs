using DotnetApi.Dtos;
using DotnetApi.Repositories;
using DotnetApi.Services;
using Xunit;

namespace DotnetApi.Tests;

public class UsersControllerTests
{
    [Fact]
    public async Task CreateAsync_NormalisesTheEmail()
    {
        var service = new UserService(new UserRepository());

        var created = await service.CreateAsync(new CreateUserRequest("  Ada@Example.COM ", "Ada"), default);

        Assert.Equal("ada@example.com", created.Email);
    }
}
