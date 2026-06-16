"""Shared schema building blocks."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    """Base for response models read from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    """Generic acknowledgement payload."""

    detail: str


class Page(BaseModel, Generic[T]):
    """Simple offset-paginated envelope."""

    items: list[T]
    total: int
    limit: int
    offset: int
