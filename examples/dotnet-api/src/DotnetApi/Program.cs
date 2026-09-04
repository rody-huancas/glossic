using DotnetApi.Middleware;
using DotnetApi.Repositories;
using DotnetApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();

var app = builder.Build();

app.UseMiddleware<RequestLoggingMiddleware>();
app.MapControllers();

app.Run();
