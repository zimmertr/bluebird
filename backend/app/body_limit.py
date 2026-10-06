"""The ceiling on a request body's size (issue #618).

FastAPI reads a whole body and parses it as JSON before a route's dependencies
run, the rate limit among them, and the parse costs roughly 16 bytes of Python
objects per body byte. With nothing in front of it, one large body could take a
pod's memory and every replica could be taken the same way while staying under
the edge's request-count rule. So the size is checked here, before routing:
a declared `Content-Length` over the cap is answered without reading a byte,
and a chunked body, which declares nothing, is counted as it arrives and cut
off at the cap.

Pure ASGI rather than `BaseHTTPMiddleware`, for the reason the security headers
are: the analyze route streams, and the base class would buffer it.
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.error_codes import ApiError, ErrorCode, api_error_handler
from app.models import ErrorResponse

# The 413 as each route that takes a body declares it in the OpenAPI document,
# one copy so the three POST routes describe it the same way.
TOO_LARGE_RESPONSE: dict[str, object] = {
    "model": ErrorResponse,
    "description": (
        "The request body is larger than `limits.max_request_bytes` in "
        "`GET /api/capabilities`, and was refused before it was read."
    ),
}


class BodyTooLarge(ApiError):
    """Raised from `receive` once a streamed body passes the cap.

    An `ApiError` rather than a private exception because of where it surfaces:
    inside FastAPI's body read, which re-raises an `HTTPException` as it is and
    turns any other exception into its own 400. As an `ApiError` it reaches
    `api_error_handler`, which also renders the `Content-Length` refusal
    below, so the two cases answer one body.
    """

    def __init__(self, max_bytes: int) -> None:
        super().__init__(
            status_code=413,
            detail=f"Request body is too large. Maximum is {max_bytes:,} bytes.",
            code=ErrorCode.validation,
        )


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                # The server's HTTP parser refuses a malformed length before
                # the app is called, so this is unreachable behind uvicorn.
                return None
    return None


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = _declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            refusal = await api_error_handler(Request(scope), BodyTooLarge(self.max_bytes))
            await refusal(scope, receive, send)
            return

        received = 0

        async def bounded_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise BodyTooLarge(self.max_bytes)
            return message

        await self.app(scope, bounded_receive, send)
