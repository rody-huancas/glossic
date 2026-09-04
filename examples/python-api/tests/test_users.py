import pytest

from app.schemas.user import UserCreate
from app.services.user_service import UserService
from app.repositories.user_repository import UserRepository


@pytest.mark.asyncio
async def test_create_user_normalises_the_email() -> None:
    service = UserService(UserRepository())

    created = await service.create_user(
        UserCreate(email="Ada@Example.COM", display_name="Ada", password="correct-horse")
    )

    assert created.email == "ada@example.com"
