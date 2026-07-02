# Tiny static server that disables caching, so code changes always show on a normal
# reload (no hard-refresh needed). Serves the current directory on port 8123.
#
# Also exposes POST /save  { "name": "...", "dataURL": "data:image/png;base64,..." }
# used by branding/cover.html to write exact-size cover PNGs to branding/. Dev-only.
import http.server
import json
import base64
import os

PORT = 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        if self.path != "/save":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n).decode("utf-8"))
            name = os.path.basename(body["name"])  # no path traversal
            data = body["dataURL"].split(",", 1)[1]
            out = os.path.join("branding", name)
            os.makedirs("branding", exist_ok=True)
            with open(out, "wb") as f:
                f.write(base64.b64decode(data))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": out, "bytes": os.path.getsize(out)}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())


if __name__ == "__main__":
    # threaded so a slow request (e.g. a big POST /save) never blocks page/script loads
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        print(f"Serving Tear on http://localhost:{PORT} (no-cache)")
        httpd.serve_forever()
