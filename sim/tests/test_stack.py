"""The wiring: the overlay, the env file and the pod agree on every variable.

The names come from the backend's own `env_url` calls, so a base URL the pod
learns to read and the sim's files do not set fails here rather than as a
request that quietly leaves the machine.
"""

from __future__ import annotations

import re

import yaml
from conftest import REPO, read_source

# The contract's seventeen, for issue #224: eleven the pod calls itself and
# six it hands the browser.
POD_SIDE = {
    "OPEN_METEO_FORECAST_URL",
    "OPEN_METEO_ARCHIVE_URL",
    "OPEN_METEO_AIR_QUALITY_URL",
    "OPEN_METEO_CUSTOMER_FORECAST_URL",
    "OPEN_METEO_CUSTOMER_ARCHIVE_URL",
    "OPEN_METEO_CUSTOMER_AIR_QUALITY_URL",
    "OVERPASS_URLS",
    "NOMINATIM_URL",
    "NIFC_URL",
    "USFS_ARCGIS_URL",
    "HMS_URL",
}
BROWSER_SIDE = {
    "BROWSER_OPEN_METEO_FORECAST_URL",
    "BROWSER_OPEN_METEO_ARCHIVE_URL",
    "BROWSER_OPEN_METEO_AIR_QUALITY_URL",
    "BROWSER_MAP_TILES_URL",
    "BROWSER_RADAR_URL",
    "BROWSER_SNOW_URL",
}


def _pod_env() -> dict[str, str]:
    lines = read_source("sim/pod.env").splitlines()
    pairs = [line.split("=", 1) for line in lines if line and not line.startswith("#")]
    return {name: value for name, value in pairs}


def _compose_env() -> dict[str, str]:
    overlay = yaml.safe_load(read_source("sim/compose.yml"))
    return dict(entry.split("=", 1) for entry in overlay["services"]["bluebird"]["environment"])


def test_the_pod_reads_exactly_the_contracts_variables():
    read = set()
    for path in (REPO / "backend" / "app").rglob("*.py"):
        read |= set(re.findall(r'env_url\(\s*"([A-Z_]+)"', path.read_text()))
    assert read == POD_SIDE | BROWSER_SIDE


def test_pod_env_sets_every_variable_at_localhost():
    env = _pod_env()
    assert set(env) == POD_SIDE | BROWSER_SIDE
    assert all(value.startswith("http://localhost:8080/") for value in env.values())


def test_the_overlay_says_what_pod_env_says_with_the_pods_host():
    compose, env = _compose_env(), _pod_env()
    assert set(compose) == set(env)
    for name, value in compose.items():
        host = "http://localhost:8080/" if name in BROWSER_SIDE else "http://sim:8080/"
        assert value == env[name].replace("http://localhost:8080/", host)


def test_every_url_this_package_owns_is_answered(client):
    # The Open-Meteo hosts and the browser-only suppliers, each asked for the
    # path the app appends to its base; the pod's other suppliers are answered
    # by their own modules. A 400 is the Open-Meteo hosts refusing a request
    # with no coordinates, which is an answer; a 404 would be no route.
    env = _pod_env()
    suffix = {
        "BROWSER_MAP_TILES_URL": "/planet",
        "BROWSER_RADAR_URL": "/nexrad-n0q-900913/0/0/0.png",
        "BROWSER_SNOW_URL": "/identify?geometry=0,0",
    }
    for name in BROWSER_SIDE | {n for n in POD_SIDE if n.startswith("OPEN_METEO")}:
        url = env[name].removeprefix("http://localhost:8080") + suffix.get(name, "")
        status = client.get(url, params={"apikey": "k"} if "CUSTOMER" in name else None).status_code
        assert status in (200, 400), (name, status)


def test_the_sim_builds_on_the_apps_runtime_base():
    def python_from(text: str) -> list[str]:
        return re.findall(r"^FROM (python:\S+)", text, re.MULTILINE)

    assert python_from(read_source("sim/Dockerfile")) == python_from(read_source("Dockerfile"))


def test_the_sim_never_enters_the_apps_image():
    assert "sim/" in read_source(".dockerignore").splitlines()
    own = read_source("sim/Dockerfile.dockerignore").splitlines()
    assert {"*", "!backend/requirements.txt", "!sim/app/"} <= set(own)


def test_dependabot_moves_the_sims_base():
    updates = yaml.safe_load(read_source(".github/dependabot.yml"))["updates"]
    assert {"package-ecosystem": "docker", "directory": "/sim"}.items() <= next(
        u for u in updates if u.get("directory") == "/sim"
    ).items()
