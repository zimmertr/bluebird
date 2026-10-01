"""The Python half of the image's third-party license file (#571).

The script runs inside the image build, so the build is what holds it to the
real set of installed packages; these tests hold what it does with each one,
over distributions written to a temporary directory and read back through
`importlib.metadata` the way the build reads the real ones.
"""

from __future__ import annotations

import sys
from importlib.metadata import distributions
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from write_third_party_licenses import collect, main, render  # noqa: E402 — after the sys.path insert above


def _dist(site: Path, name: str, version: str, headers: str, files: dict[str, str]) -> None:
    """Writes one installed distribution: METADATA, the given files, and a RECORD naming them."""
    info = site / f"{name.replace('-', '_')}-{version}.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(f"Metadata-Version: 2.4\nName: {name}\nVersion: {version}\n{headers}")
    for path, body in files.items():
        (info / path).parent.mkdir(parents=True, exist_ok=True)
        (info / path).write_text(body)
    record = [f"{info.name}/METADATA,,", *(f"{info.name}/{path},," for path in files), f"{info.name}/RECORD,,"]
    (info / "RECORD").write_text("\n".join(record) + "\n")


def _installed(site: Path):
    return distributions(path=[str(site)])


def test_reads_a_pep_639_licenses_directory_with_no_header_naming_it(tmp_path):
    # httpx 0.28.1 ships its text under licenses/ and declares no License-File.
    _dist(tmp_path, "httpx", "0.28.1", "License: BSD-3-Clause\n", {"licenses/LICENSE.md": "httpx text\n"})
    [notice] = collect(_installed(tmp_path))
    assert (notice.name, notice.version, notice.license) == ("httpx", "0.28.1", "BSD-3-Clause")
    assert notice.texts == (("licenses/LICENSE.md", "httpx text"),)


def test_reads_a_license_at_the_dist_info_root_for_an_older_wheel(tmp_path):
    _dist(
        tmp_path,
        "old",
        "1.0",
        "Classifier: License :: OSI Approved :: MIT License\n",
        {"LICENSE.txt": "old text", "top_level.txt": "old"},
    )
    [notice] = collect(_installed(tmp_path))
    assert notice.license == "MIT License"
    assert notice.texts == (("LICENSE.txt", "old text"),)


def test_carries_every_file_and_prefers_the_license_expression(tmp_path):
    _dist(
        tmp_path,
        "prometheus_client",
        "0.26.0",
        "License-Expression: Apache-2.0 AND BSD-2-Clause\nLicense: a whole license text\nspanning lines\n",
        {"licenses/LICENSE": "apache", "licenses/NOTICE": "notice"},
    )
    [notice] = collect(_installed(tmp_path))
    assert notice.license == "Apache-2.0 AND BSD-2-Clause"
    assert [file for file, _ in notice.texts] == ["licenses/LICENSE", "licenses/NOTICE"]


def test_fails_naming_every_package_without_a_text(tmp_path):
    _dist(tmp_path, "fine", "1.0", "License-Expression: MIT\n", {"licenses/LICENSE": "x"})
    _dist(tmp_path, "bare", "2.0", "License-Expression: MIT\n", {})
    _dist(tmp_path, "also-bare", "3.0", "", {})
    with pytest.raises(SystemExit, match="also-bare 3.0, bare 2.0"):
        collect(_installed(tmp_path))


def test_one_block_per_package_sorted_by_name(tmp_path):
    _dist(tmp_path, "zeta", "1.0", "License-Expression: MIT\n", {"licenses/LICENSE": "Z"})
    _dist(tmp_path, "Alpha", "2.0", "License-Expression: ISC\n", {"licenses/LICENSE": "A", "licenses/NOTICE": "N"})
    text = render(collect(_installed(tmp_path)))
    assert text.startswith("Python packages\n###############\n\n")
    assert text.index("\nAlpha 2.0\nLicense: ISC\n") < text.index("\nzeta 1.0\nLicense: MIT\n")
    assert "--- licenses/NOTICE ---\n\nN" in text
    assert "--- licenses/LICENSE ---\n\nZ" not in text


def test_main_appends_to_the_file_the_frontend_build_began(tmp_path, monkeypatch):
    site = tmp_path / "site"
    _dist(site, "only", "1.0", "License-Expression: MIT\n", {"licenses/LICENSE": "only text"})
    monkeypatch.setattr("write_third_party_licenses.distributions", lambda: _installed(site))
    out = tmp_path / "third-party-licenses.txt"
    out.write_text("npm packages\n")
    main(["write_third_party_licenses.py", str(out)])
    written = out.read_text()
    assert written.startswith("npm packages\n\nPython packages\n")
    assert "only text" in written
