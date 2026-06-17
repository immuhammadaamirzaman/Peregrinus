"""Authentication endpoints: register, login, refresh, logout, me.

The refresh token is delivered and read as an **httpOnly** cookie scoped to the
auth path, so it is never exposed to JavaScript (XSS-safe) and is sent only on
auth requests. The access token is returned in the body for the SPA to hold in
memory and send as a Bearer header.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user
from app.core.exceptions import AuthenticationError
from app.core.ratelimit import limiter
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, Token
from app.schemas.user import UserRead
from app.services import auth_service
from app.services.auth_service import IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "dm_refresh_token"
_REFRESH_PATH = f"{settings.api_v1_prefix}/auth"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 86_400,
        httponly=True,
        secure=settings.is_production,  # require HTTPS in prod; relaxed for local dev
        samesite="strict",
        path=_REFRESH_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=_REFRESH_PATH)


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_auth)
async def register(
    request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)
) -> User:
    """Self-service sign-up. Account is created PENDING admin approval."""
    return await auth_service.register(db, data)


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_auth)
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    """OAuth2 password flow. ``username`` is the user's email."""
    tokens: IssuedTokens = await auth_service.authenticate(db, form.username, form.password)
    _set_refresh_cookie(response, tokens.refresh_token)
    return Token(access_token=tokens.access_token)


@router.post("/refresh", response_model=Token)
@limiter.limit(settings.rate_limit_auth)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Rotate the httpOnly refresh-token cookie into a fresh access token."""
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise AuthenticationError("Missing refresh token.")
    tokens: IssuedTokens = await auth_service.refresh_tokens(db, refresh_token)
    _set_refresh_cookie(response, tokens.refresh_token)
    return Token(access_token=tokens.access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> None:
    """Revoke the current refresh session and clear the cookie."""
    await auth_service.logout(db, request.cookies.get(REFRESH_COOKIE))
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
