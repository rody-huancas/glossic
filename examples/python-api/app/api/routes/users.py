from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.user import UserCreate, UserRead
from app.services.user_service import UserService, get_user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(service: UserService = Depends(get_user_service)) -> list[UserRead]:
    return await service.list_users()


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: UUID, service: UserService = Depends(get_user_service)) -> UserRead:
    user = await service.find_user(user_id)

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    return user


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    service: UserService = Depends(get_user_service),
) -> UserRead:
    return await service.create_user(payload)
