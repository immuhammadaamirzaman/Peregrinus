"""Domain exceptions and FastAPI exception handlers.

Services raise these framework-agnostic errors; a single set of handlers
translates them into consistent JSON responses, so routers stay thin.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base class for expected, client-facing application errors."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"
    detail: str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    detail = "Resource not found."


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    detail = "Resource already exists."


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "authentication_error"
    detail = "Could not validate credentials."


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    detail = "You do not have permission to perform this action."


class ValidationError(AppError):
    status_code = 422  # Unprocessable Content
    code = "validation_error"
    detail = "Validation failed."


class ConnectionTestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "connection_test_failed"
    detail = "Could not connect to the database."


class InvalidStateError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "invalid_state"
    detail = "The resource is not in a valid state for this operation."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "detail": exc.detail}},
            headers=(
                {"WWW-Authenticate": "Bearer"}
                if isinstance(exc, AuthenticationError)
                else None
            ),
        )
