"""The machine-readable half of an error body.

Every hand-raised API error answers with a `detail` sentence written for a
person. A program cannot branch on prose, and the one question it has is
whether an identical retry can help: an Overpass or Open-Meteo failure is
worth retrying, an inverted window never is. So each error also carries
`error: {code, retryable}`, chosen from the closed vocabulary below.

The codes are contract. `detail` may be reworded for a reader at any time; a
code may not, and `retryable` is read as a promise about a retry. Adding a
code is an API change, and `docs/API.md` carries the table callers read.

One place builds the field: an `ApiError` names its code at the raise site and
`api_error_handler` renders the body, so no route writes the shape by hand.
The two routes that answer without raising (the over-cap refusal and the /api
catch-all) call `error_object` instead, for the same reason.
"""

from __future__ import annotations

from enum import StrEnum

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class ErrorCode(StrEnum):
    """Why a request failed, in the caller's vocabulary rather than the implementation's."""

    validation = "validation"
    refusal = "refusal"
    model_coverage = "model_coverage"
    invalid_api_key = "invalid_api_key"
    not_found = "not_found"
    method_not_allowed = "method_not_allowed"
    rate_limited = "rate_limited"
    upstream_rate_limited = "upstream_rate_limited"
    upstream_unavailable = "upstream_unavailable"
    busy = "busy"
    snapshot_unavailable = "snapshot_unavailable"
    internal = "internal"


# Is sending the identical request again worth trying?
#
# False means only the caller can change the outcome: the request is malformed,
# asks a regional model about somewhere it does not model, carries a key
# Open-Meteo refuses, names a path that does not exist, or covers more
# destinations than the analysis cap allows. True means the request was fine
# and the deployment or an upstream was not, so the same bytes can succeed
# later — on a 429 or 503 the `Retry-After` header says when.
RETRYABLE: dict[ErrorCode, bool] = {
    ErrorCode.validation: False,
    ErrorCode.refusal: False,
    ErrorCode.model_coverage: False,
    ErrorCode.invalid_api_key: False,
    ErrorCode.not_found: False,
    ErrorCode.method_not_allowed: False,
    ErrorCode.rate_limited: True,
    ErrorCode.upstream_rate_limited: True,
    ErrorCode.upstream_unavailable: True,
    ErrorCode.busy: True,
    ErrorCode.snapshot_unavailable: True,
    ErrorCode.internal: True,
}


def error_object(code: ErrorCode) -> dict[str, object]:
    """The `error` member of a failure body, for a caller building one by hand."""
    return {"code": code.value, "retryable": RETRYABLE[code]}


class ApiError(HTTPException):
    """An `HTTPException` that also names its cause in the code vocabulary.

    The status code stays explicit at the raise site rather than being derived
    from the code: `validation` answers 400 where the request is unrunnable and
    422 where a query parameter will not parse, and collapsing those onto one
    status to save an argument would change what callers already receive.
    """

    def __init__(
        self,
        status_code: int,
        detail: str,
        code: ErrorCode,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code


async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    """Render an `ApiError` as `{detail, error}`.

    Registered for `ApiError` alone, never for `HTTPException`: Starlette
    resolves a handler by walking the exception's MRO, so a plain
    `HTTPException` still gets FastAPI's stock body. That is what keeps the
    404 the document pages raise out of the API contract this module defines.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error": error_object(exc.code)},
        headers=exc.headers,
    )
