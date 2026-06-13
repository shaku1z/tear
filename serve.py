# Tiny static server that disables caching, so code changes always show on a normal
# reload (no hard-refresh needed). Serves the current directory on port 8123.
import http.server
import socketserver

PORT = 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
        print(f"Serving Tear on http://localhost:{PORT} (no-cache)")
        httpd.serve_forever()
