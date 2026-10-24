"""Custom ASGI middleware.

:class:`MaxBodySizeMiddleware` enforces a hard cap on request body size. Unlike
a header-only guard, it also bounds requests that omit ``Content-Length`` (e.g.
``Transfer-Encoding: chunked``) by counting bytes as they arrive and rejecting
the request the moment it exceeds the limit. Only the request side is wrapped,
so streaming responses (the SSE log endpoint) are unaffected.
"""

from __future__ import annotations

from collections import deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Pre-serialised body matching the app's standard error envelope.
_TOO_LARGE_BODY = (
    b'{"error":{"code":"payload_too_large","detail":"Request body too large."}}'
)


class MaxBodySizeMiddleware:
    """Reject HTTP requests whose body exceeds ``max_bytes`` with a 413."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Fast path: trust a declared Content-Length and reject before reading.
        for name, value in scope["headers"]:
            if name == b"content-length" and value.isdigit():
                if int(value) > self.max_bytes:
                    await self._reject(send)
                    return
                break

        # Buffer the body, aborting the moment it exceeds the cap so an
        # unbounded chunked stream cannot exhaust memory. Small JSON control
        # payloads (the only bodies this API accepts) buffer cheaply.
        buffered: list[Message] = []
        total = 0
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > self.max_bytes:
                    await self._reject(send)
                    return
                more_body = message.get("more_body", False)
                buffered.append(message)
            else:  # http.disconnect — stop buffering and replay what we have.
                buffered.append(message)
                break

        # Replay the buffered body, then fall through to the real receive
        # channel. Delegating once the buffer drains is essential rather than
        # cosmetic: ``http.disconnect`` has to keep reaching the application, or
        # Starlette's ``request.is_disconnected()`` never becomes true and the
        # SSE log stream keeps polling for a client that has already gone,
        # holding a slot in the ``max_sse_connections`` budget until the job
        # reaches a terminal state.
        pending = deque(buffered)

        async def replay() -> Message:
            if pending:
                return pending.popleft()
            return await receive()

        await self.app(scope, replay, send)

    async def _reject(self, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(_TOO_LARGE_BODY)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": _TOO_LARGE_BODY})
