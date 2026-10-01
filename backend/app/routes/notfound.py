from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.error_codes import ErrorCode, error_object

router = APIRouter()

# Registered last under the /api prefix, after every real route and before the
# SPA static mount. Without it an unknown /api path falls through to the mount
# and is answered by StaticFiles, so an API typo is indistinguishable from a
# missing web page and the reply shape is an accident of the static handler
# rather than an API decision.
#
# OPTIONS is deliberately absent: CORS preflight is handled by middleware ahead
# of routing, and claiming the verb here would only shadow that.
_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]

# What the production gateway says in place of the path. Its 404 for an
# unpublished /api path is a static Istio directResponse in the chart, which
# cannot echo the request, so `edge_not_found.json` carries the body built with
# this phrase and the chart's Edge 404 workflow compares its rendered route
# against that file.
EDGE_PATH_PHRASE = "this path"


def not_found_body(where: str) -> dict[str, object]:
    """The 404 body, naming `where` as the path that has no endpoint.

    One builder for the route below and for the gateway's copy, so the two
    bodies differ in the path and nothing else.
    """
    return {
        "detail": (
            f"No API endpoint at {where}. "
            "See /docs for the full API reference, or /openapi.json for the "
            "machine-readable schema."
        ),
        "error": error_object(ErrorCode.not_found),
    }


# The bare prefix needs a route of its own: "/{path:path}" under the /api
# prefix compiles to "/api/...", which "/api" never matches, so without this
# the request falls through to the static mount and gets the HTML not-found
# page (or, with no build output, a redirect to "/api/").
@router.api_route("", methods=_METHODS, include_in_schema=False)
@router.api_route("/{path:path}", methods=_METHODS, include_in_schema=False)
async def api_not_found(request: Request, path: str = "") -> JSONResponse:
    full_path = request.url.path

    # Reaching here with a path that does have registered routes means the path
    # matched but the method did not: Starlette prefers this catch-all's full
    # match over the real route's partial one, so the 405 it would otherwise
    # have produced has to be reconstructed here.
    #
    # Read off the generated OpenAPI document rather than walking app.routes.
    # Included routers are not flattened into that list (they sit behind
    # internal wrapper objects whose shape is a FastAPI implementation detail),
    # whereas the schema is public, cached after first use, and generated from
    # the very routes being matched, so it cannot drift.
    operations = request.app.openapi().get("paths", {}).get(full_path, {})
    allowed = sorted(
        method.upper()
        for method in operations
        if method.lower() in {"get", "post", "put", "patch", "delete"}
    )
    if allowed:
        allow_header = ", ".join(allowed)
        return JSONResponse(
            status_code=405,
            content={
                "detail": (
                    f"{request.method} is not allowed on {full_path}. "
                    f"Use {allow_header}. See /docs for the full API reference."
                ),
                "error": error_object(ErrorCode.method_not_allowed),
            },
            headers={"Allow": allow_header},
        )

    return JSONResponse(status_code=404, content=not_found_body(full_path))
