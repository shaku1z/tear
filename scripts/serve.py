"""Small loopback-only static server for Tear's local development tools.

The server deliberately resolves the repository from this file instead of the
process working directory.  ``POST /save`` is a narrowly scoped helper for
``branding/cover.html``; it accepts only bounded PNG data and never follows a
symlink or Windows reparse-point output path.
"""

import argparse
import base64
import binascii
import http.server
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


PORT = 8123
MAX_JSON_BYTES = 16 * 1024 * 1024
MAX_PNG_BYTES = 8 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DATA_URL_PREFIX = "data:image/png;base64,"
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.png$")
LOOPBACK_HOSTS = frozenset(("127.0.0.1", "localhost"))

REPO_ROOT = Path(__file__).resolve().parent.parent
BRANDING_ROOT = REPO_ROOT / "branding"


class SaveRequestError(Exception):
    """A client-safe validation error for the local save endpoint."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def is_reparse_point(path):
    """Return whether a path is a symlink or a Windows reparse point."""

    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return False
    except OSError:
        return True
    attributes = getattr(info, "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & reparse_flag)


def inspect_target(target):
    """Check a target without following links and return whether it exists."""

    try:
        info = os.lstat(target)
    except FileNotFoundError:
        return False
    except OSError as error:
        raise SaveRequestError("save target is unavailable") from error
    attributes = getattr(info, "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    if stat.S_ISLNK(info.st_mode) or bool(attributes & reparse_flag):
        raise SaveRequestError("existing save target must not be a symlink or reparse point")
    if not stat.S_ISREG(info.st_mode):
        raise SaveRequestError("existing save target must be a regular file")
    return True


def ensure_branding_root():
    """Create the normal branding directory and verify its path components."""

    try:
        BRANDING_ROOT.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise SaveRequestError("branding save directory is unavailable") from error

    try:
        if is_reparse_point(REPO_ROOT) or is_reparse_point(BRANDING_ROOT):
            raise SaveRequestError("branding save directory must not be a symlink or reparse point")
        if not BRANDING_ROOT.is_dir():
            raise SaveRequestError("branding save directory is not a directory")
    except OSError as error:
        raise SaveRequestError("branding save directory is unavailable") from error


def validate_save_request(payload):
    if not isinstance(payload, dict):
        raise SaveRequestError("request must be a JSON object")

    name = payload.get("name")
    data_url = payload.get("dataURL")
    if not isinstance(name, str) or not SAFE_NAME.fullmatch(name):
        raise SaveRequestError("name must be a safe .png basename")
    if "/" in name or "\\" in name or "\x00" in name:
        raise SaveRequestError("name must be a safe .png basename")
    if not isinstance(data_url, str) or not data_url.startswith(DATA_URL_PREFIX):
        raise SaveRequestError("dataURL must be a base64 PNG data URL")

    encoded = data_url[len(DATA_URL_PREFIX):]
    max_encoded = ((MAX_PNG_BYTES + 2) // 3) * 4
    if not encoded or len(encoded) > max_encoded:
        raise SaveRequestError("decoded PNG exceeds the local size limit", 413)
    if any(character.isspace() for character in encoded):
        raise SaveRequestError("dataURL base64 must not contain whitespace")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise SaveRequestError("dataURL base64 is invalid") from None
    if not data or len(data) > MAX_PNG_BYTES:
        raise SaveRequestError("decoded PNG exceeds the local size limit", 413)
    if not data.startswith(PNG_SIGNATURE):
        raise SaveRequestError("decoded data is not a PNG")
    return name, data


def save_png(name, data, allow_overwrite):
    ensure_branding_root()
    target = BRANDING_ROOT / name
    try:
        if os.path.commonpath((str(BRANDING_ROOT), str(target))) != str(BRANDING_ROOT):
            raise SaveRequestError("save path escapes branding")
    except ValueError:
        raise SaveRequestError("save path escapes branding") from None

    existed = inspect_target(target)

    if not allow_overwrite:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        nofollow = getattr(os, "O_NOFOLLOW", 0)
        if nofollow:
            flags |= nofollow

        try:
            descriptor = os.open(str(target), flags, 0o644)
        except FileExistsError:
            raise SaveRequestError(
                "file already exists; it was preserved. Restart with --allow-overwrite for deliberate regeneration",
                409,
            ) from None
        except OSError:
            raise SaveRequestError("save target is unavailable") from None

        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        except OSError:
            raise SaveRequestError("save target could not be written") from None
        return 201, {
            "ok": True,
            "path": f"branding/{name}",
            "bytes": len(data),
        }

    temporary_path = None
    try:
        descriptor, temporary_path = tempfile.mkstemp(prefix=".tear-save-", suffix=".tmp", dir=str(BRANDING_ROOT))
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())

        ensure_branding_root()
        current_exists = inspect_target(target)
        os.replace(temporary_path, target)
        temporary_path = None
    except SaveRequestError:
        raise
    except OSError:
        raise SaveRequestError("save target could not be written") from None
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass

    return 200 if current_exists or existed else 201, {
        "ok": True,
        "path": f"branding/{name}",
        "bytes": len(data),
    }


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the repository root and expose only the bounded save endpoint."""

    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _path(self):
        return urlsplit(self.path).path

    def _send_json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass
        self.close_connection = True

    def _method_not_allowed(self):
        self._send_json(405, {"ok": False, "error": "method not allowed for /save"})

    def do_GET(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        super().do_GET()

    def do_HEAD(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        super().do_HEAD()

    def do_PUT(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        self.send_error(501, "unsupported method")

    def do_DELETE(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        self.send_error(501, "unsupported method")

    def do_PATCH(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        self.send_error(501, "unsupported method")

    def do_OPTIONS(self):
        if self._path() == "/save":
            self._method_not_allowed()
            return
        self.send_error(501, "unsupported method")

    def do_POST(self):
        if self._path() != "/save":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        media_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if media_type != "application/json":
            self._send_json(400, {"ok": False, "error": "Content-Type must be application/json"})
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            length = -1
        if length < 0:
            self._send_json(400, {"ok": False, "error": "Content-Length is required"})
            return
        if length > MAX_JSON_BYTES:
            self._send_json(413, {"ok": False, "error": "JSON request exceeds the local size limit"})
            return

        body = self.rfile.read(length)
        if len(body) != length:
            self._send_json(400, {"ok": False, "error": "request body is incomplete"})
            return
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"ok": False, "error": "request body is invalid JSON"})
            return

        try:
            name, data = validate_save_request(payload)
            status, response = save_png(name, data, self.server.allow_overwrite)
        except SaveRequestError as error:
            self._send_json(error.status, {"ok": False, "error": error.message})
            return
        self._send_json(status, response)


class TearHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(self, address, handler, allow_overwrite):
        self.allow_overwrite = allow_overwrite
        super().__init__(address, handler)


def parse_arguments(arguments):
    parser = argparse.ArgumentParser(description="Serve the Tear repository for local tooling.")
    parser.add_argument("--host", default="127.0.0.1", help="loopback host: 127.0.0.1 or localhost (default: 127.0.0.1)")
    parser.add_argument("--port", default=PORT, type=int, help=f"TCP port, or 0 for an ephemeral port (default: {PORT})")
    parser.add_argument(
        "--allow-overwrite",
        action="store_true",
        help="allow POST /save to replace an existing PNG; create-only mode is the default",
    )
    parsed = parser.parse_args(arguments)
    if parsed.host.lower() not in LOOPBACK_HOSTS:
        parser.error("--host must be 127.0.0.1 or localhost; non-loopback binding is disabled")
    if not 0 <= parsed.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    parsed.host = parsed.host.lower()
    return parsed


def main(arguments=None):
    options = parse_arguments(arguments)
    handler = lambda *args, **kwargs: NoCacheHandler(*args, directory=str(REPO_ROOT), **kwargs)
    try:
        with TearHTTPServer((options.host, options.port), handler, options.allow_overwrite) as server:
            bound = server.server_address
            port = bound[1] if isinstance(bound, tuple) else options.port
            print(f"Serving Tear on http://{options.host}:{port} (repo root: {REPO_ROOT})", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except OSError:
        print("Tear server could not bind the requested loopback address or port", file=sys.stderr)
        sys.exit(1)
