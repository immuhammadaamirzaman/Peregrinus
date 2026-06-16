"""Authentication endpoints: register, login, refresh, me."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, Token, TokenRefreshRequest
from app.schemas.user import UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    """Self-service sign-up. Account is created PENDING admin approval."""
    return await auth_service.register(db, data)


@router.post("/login", response_model=Token)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    """OAuth2 password flow. ``username`` is the user's email."""
    return await auth_service.authenticate(db, form.username, form.password)


@router.post("/refresh", response_model=Token)
async def refresh(
    data: TokenRefreshRequest, db: AsyncSession = Depends(get_db)
) -> Token:
    return await auth_service.refresh_tokens(db, data.refresh_token)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
