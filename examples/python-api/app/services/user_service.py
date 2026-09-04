from uuid import UUID, uuid4

from app.models.user import User
from app.schemas.user import UserCreate, UserRead
from app.core.security import hash_password
from app.repositories.user_repository import UserRepository, get_user_repository


class UserService:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def list_users(self) -> list[UserRead]:
        users = await self._repository.list_users()

        return [UserRead.model_validate(user) for user in users]

    async def find_user(self, user_id: UUID) -> UserRead | None:
        user = await self._repository.find_user(user_id)

        return None if user is None else UserRead.model_validate(user)

    async def create_user(self, payload: UserCreate) -> UserRead:
        user = User(
            id=uuid4(),
            email=payload.email.strip().lower(),
            display_name=payload.display_name.strip(),
            password_hash=hash_password(payload.password),
        )
        await self._repository.add(user)

        return UserRead.model_validate(user)


def get_user_service() -> UserService:
    return UserService(get_user_repository())
