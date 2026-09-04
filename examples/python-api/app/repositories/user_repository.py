from uuid import UUID

from app.models.user import User


class UserRepository:
    """In-memory stand-in; a real one would take an AsyncSession."""

    def __init__(self) -> None:
        self._users: dict[UUID, User] = {}

    async def list_users(self) -> list[User]:
        return sorted(self._users.values(), key=lambda user: user.email)

    async def find_user(self, user_id: UUID) -> User | None:
        return self._users.get(user_id)

    async def add(self, user: User) -> None:
        self._users[user.id] = user


_repository = UserRepository()


def get_user_repository() -> UserRepository:
    return _repository
