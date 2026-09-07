#!/usr/bin/env python3
"""Sample public Copernicus GLO-30 COGs without an API key or Python packages."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

BUCKETS = {
    10: "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com",
    30: "https://copernicus-dem-90m.s3.eu-central-1.amazonaws.com",
}
LICENSE_URL = (
    "https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/"
    "copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf"
)
MAX_POINTS = 70_000
MAX_DOWNLOAD_BYTES = 80_000_000
TIFF_TYPE = {1: ("B", 1), 3: ("H", 2), 4: ("I", 4), 11: ("f", 4), 12: ("d", 8)}


def tile_name(latitude: int, longitude: int, arc_seconds: int) -> str:
    northing = f"{'N' if latitude >= 0 else 'S'}{abs(latitude):02d}_00"
    easting = f"{'E' if longitude >= 0 else 'W'}{abs(longitude):03d}_00"
    return f"Copernicus_DSM_COG_{arc_seconds}_{northing}_{easting}_DEM"


def tile_url(latitude: int, longitude: int, arc_seconds: int) -> str:
    name = tile_name(latitude, longitude, arc_seconds)
    return f"{BUCKETS[arc_seconds]}/{name}/{name}.tif"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tiff_tags(data: bytes) -> dict[int, list[float]]:
    if len(data) < 8 or data[:2] not in (b"II", b"MM"):
        raise RuntimeError("Invalid TIFF byte order")
    endian = "<" if data[:2] == b"II" else ">"
    if struct.unpack_from(f"{endian}H", data, 2)[0] != 42:
        raise RuntimeError("Unsupported TIFF header")
    directory = struct.unpack_from(f"{endian}I", data, 4)[0]
    if directory + 2 > len(data):
        raise RuntimeError("Invalid TIFF directory offset")
    count = struct.unpack_from(f"{endian}H", data, directory)[0]
    tags: dict[int, list[float]] = {}
    for index in range(count):
        entry = directory + 2 + index * 12
        if entry + 12 > len(data):
            raise RuntimeError("Truncated TIFF directory")
        tag, kind, values = struct.unpack_from(f"{endian}HHI", data, entry)
        if kind not in TIFF_TYPE:
            continue
        code, size = TIFF_TYPE[kind]
        byte_count = values * size
        offset = (
            entry + 8
            if byte_count <= 4
            else struct.unpack_from(f"{endian}I", data, entry + 8)[0]
        )
        if offset + byte_count > len(data):
            raise RuntimeError("Invalid TIFF tag value offset")
        tags[tag] = list(struct.unpack_from(f"{endian}{values}{code}", data, offset))
    return tags


def tag(tags: dict[int, list[float]], number: int) -> list[float]:
    if number not in tags:
        raise RuntimeError(f"TIFF tag {number} is missing")
    return tags[number]


def read_float_raster(data: bytes, expected_width: int, expected_height: int) -> list[float]:
    endian = "<" if data[:2] == b"II" else ">"
    tags = tiff_tags(data)
    width = int(tag(tags, 256)[0])
    height = int(tag(tags, 257)[0])
    if (width, height) != (expected_width, expected_height):
        raise RuntimeError(f"Unexpected TIFF crop size {width}x{height}")
    if (
        tag(tags, 258) != [32]
        or tag(tags, 259) != [1]
        or tag(tags, 277) != [1]
        or tag(tags, 339) != [3]
    ):
        raise RuntimeError("TIFF crop is not uncompressed float32 grayscale")
    offsets = [int(value) for value in tag(tags, 273)]
    counts = [int(value) for value in tag(tags, 279)]
    if len(offsets) != len(counts):
        raise RuntimeError("TIFF strip metadata does not match")
    pixels = b"".join(data[offset : offset + count] for offset, count in zip(offsets, counts))
    expected = width * height * 4
    if len(pixels) != expected:
        raise RuntimeError("TIFF crop returned truncated pixels")
    return list(struct.unpack(f"{endian}{width * height}f", pixels))


def pixel_coordinates(
    tags: dict[int, list[float]], longitude: float, latitude: float
) -> tuple[float, float]:
    scale = tag(tags, 33550)
    tiepoint = tag(tags, 33922)
    if len(scale) < 2 or len(tiepoint) < 6 or min(scale[:2]) <= 0:
        raise RuntimeError("DEM has invalid georeferencing")
    return (
        tiepoint[0] + (longitude - tiepoint[3]) / scale[0],
        tiepoint[1] + (tiepoint[4] - latitude) / scale[1],
    )


def download_tile(
    key: tuple[int, int], cache: pathlib.Path
) -> tuple[pathlib.Path, int, str, str]:
    latitude, longitude = key
    for arc_seconds in (10, 30):
        temporary: pathlib.Path | None = None
        url = tile_url(latitude, longitude, arc_seconds)
        path = cache / f"{tile_name(latitude, longitude, arc_seconds)}.tif"
        if not path.exists():
            try:
                request = urllib.request.Request(
                    url, headers={"User-Agent": "f1-terrain-builder/1"}
                )
                with urllib.request.urlopen(request, timeout=60) as response:
                    length = int(response.headers.get("Content-Length", 0))
                    if length > MAX_DOWNLOAD_BYTES:
                        raise RuntimeError(f"DEM tile exceeds {MAX_DOWNLOAD_BYTES} bytes: {url}")
                    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as target:
                        temporary = pathlib.Path(target.name)
                        copied = 0
                        while chunk := response.read(1024 * 1024):
                            copied += len(chunk)
                            if copied > MAX_DOWNLOAD_BYTES:
                                raise RuntimeError(
                                    f"DEM tile exceeds {MAX_DOWNLOAD_BYTES} bytes: {url}"
                                )
                            target.write(chunk)
                    temporary.replace(path)
            except urllib.error.HTTPError as error:
                if error.code not in (403, 404) or arc_seconds == 30:
                    raise
                continue
            finally:
                if temporary and temporary.exists():
                    temporary.unlink()
        return path, arc_seconds, url, sha256(path)
    raise RuntimeError(f"No Copernicus DEM tile for {latitude},{longitude}")


def bilinear(values: list[float], width: int, x: float, y: float) -> float:
    x0 = min(width - 1, max(0, math.floor(x)))
    y0 = min(len(values) // width - 1, max(0, math.floor(y)))
    x1 = min(width - 1, x0 + 1)
    y1 = min(len(values) // width - 1, y0 + 1)
    fx = min(1.0, max(0.0, x - x0))
    fy = min(1.0, max(0.0, y - y0))
    top = values[y0 * width + x0] * (1 - fx) + values[y0 * width + x1] * fx
    bottom = values[y1 * width + x0] * (1 - fx) + values[y1 * width + x1] * fx
    return top * (1 - fy) + bottom * fy


def sample_tile(
    points: list[tuple[int, float, float]],
    downloaded: tuple[pathlib.Path, int, str, str],
) -> tuple[dict[int, float], dict[str, object]]:
    source, arc_seconds, url, digest = downloaded
    source_tags = tiff_tags(source.read_bytes())
    source_width = int(tag(source_tags, 256)[0])
    source_height = int(tag(source_tags, 257)[0])
    pixels = [
        (index, *pixel_coordinates(source_tags, lon, lat))
        for index, lon, lat in points
    ]
    left = max(0, math.floor(min(x for _, x, _ in pixels)))
    top = max(0, math.floor(min(y for _, _, y in pixels)))
    right = min(source_width - 1, math.floor(max(x for _, x, _ in pixels)) + 1)
    bottom = min(source_height - 1, math.floor(max(y for _, _, y in pixels)) + 1)
    width = right - left + 1
    height = bottom - top + 1
    with tempfile.TemporaryDirectory(prefix="f1-dem-crop-") as directory:
        crop = pathlib.Path(directory) / "crop.tif"
        command = [
            "tiffcrop",
            "-L",
            "-c",
            "none",
            "-s",
            "-r",
            str(height),
            "-U",
            "px",
            "-z",
            # tiffcrop uses one-based inclusive pixel coordinates.
            f"{left + 1},{top + 1},{right + 1},{bottom + 1}",
            str(source),
            str(crop),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "tiffcrop failed")
        data = crop.read_bytes()
    values = read_float_raster(data, width, height)
    if any(not math.isfinite(value) or value <= -32_000 for value in values):
        raise RuntimeError(f"DEM contains missing heights: {url}")
    heights = {
        index: bilinear(values, width, x - left, y - top) for index, x, y in pixels
    }
    return heights, {
        "dataset": f"Copernicus DEM GLO-{'30 Public' if arc_seconds == 10 else '90'}",
        "url": url,
        "sha256": digest,
        "resolutionArcSeconds": arc_seconds / 10,
    }


def sample(points: list[tuple[float, float]], cache: pathlib.Path) -> dict[str, object]:
    if not points or len(points) > MAX_POINTS:
        raise ValueError(f"points must contain 1..{MAX_POINTS} [longitude, latitude] pairs")
    grouped: dict[tuple[int, int], list[tuple[int, float, float]]] = {}
    for index, (longitude, latitude) in enumerate(points):
        if not (-180 <= longitude < 180 and -90 < latitude < 90):
            raise ValueError(f"invalid coordinate: {longitude},{latitude}")
        grouped.setdefault((math.floor(latitude), math.floor(longitude)), []).append(
            (index, longitude, latitude)
        )
    cache.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        downloads = dict(zip(grouped, pool.map(lambda key: download_tile(key, cache), grouped)))
    heights = [0.0] * len(points)
    sources: list[dict[str, object]] = []
    for key, tile_points in grouped.items():
        sampled, provenance = sample_tile(tile_points, downloads[key])
        for index, height in sampled.items():
            heights[index] = round(height, 1)
        sources.append(provenance)
    return {
        "heights": heights,
        "source": {
            "accessedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
            "license": LICENSE_URL,
            "objects": sorted(sources, key=lambda item: str(item["url"])),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", help='JSON file containing {"points":[[lon,lat],...]}')
    parser.add_argument("--cache", default="/tmp/f1-copernicus-dem")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.self_test:
        assert tile_name(34, 136, 10) == "Copernicus_DSM_COG_10_N34_00_E136_00_DEM"
        assert tile_name(-24, -47, 30) == "Copernicus_DSM_COG_30_S24_00_W047_00_DEM"
        assert bilinear([0, 10, 20, 30], 2, 0.5, 0.5) == 15
        fixture = (
            b"II"
            + struct.pack("<HIH", 42, 8, 1)
            + struct.pack("<HHII", 256, 4, 1, 129)
            + b"\0\0\0\0"
        )
        assert tiff_tags(fixture)[256] == [129]
        high_latitude = {
            33550: [1 / 2400, 1 / 3600, 0],
            33922: [0, 0, 0, -2, 53, 0],
        }
        assert pixel_coordinates(high_latitude, -1.5, 52.5) == (1200, 1800)
        print("ok")
        return
    if not args.input:
        raise SystemExit("input is required unless --self-test is used")
    payload = json.loads(pathlib.Path(args.input).read_text())
    raw_points = payload.get("points") if isinstance(payload, dict) else None
    if not isinstance(raw_points, list) or any(
        not isinstance(point, list)
        or len(point) != 2
        or any(not isinstance(value, (int, float)) for value in point)
        for point in raw_points or []
    ):
        raise ValueError('input must contain {"points":[[longitude,latitude],...]}')
    if not shutil.which("tiffcrop"):
        raise RuntimeError("tiffcrop is required to extract the source COGs")
    points = [(float(lon), float(lat)) for lon, lat in raw_points]
    json.dump(sample(points, pathlib.Path(args.cache)), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
