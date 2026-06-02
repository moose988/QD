from __future__ import annotations

import argparse
import hashlib
import os
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


RELOAD_SNIPPET = """
<script>
(() => {
  let last = "";
  async function check() {
    try {
      const response = await fetch("/__live_reload__", { cache: "no-store" });
      const text = await response.text();
      if (last && text !== last) {
        location.reload();
        return;
      }
      last = text;
    } catch (error) {
      console.debug("Live reload check failed", error);
    }
  }
  setInterval(check, 1000);
  check();
})();
</script>
</body>
""".strip()


class LivePreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str, target_file: str, **kwargs):
        self.directory = directory
        self.target_file = target_file
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path

        if route == "/__live_reload__":
            self._serve_reload_token()
            return

        if route in ("/", f"/{self.target_file}"):
            self._serve_html()
            return

        super().do_GET()

    def _serve_reload_token(self) -> None:
        token = self.server.reload_token.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(token)))
        self.end_headers()
        self.wfile.write(token)

    def _serve_html(self) -> None:
        target_path = Path(self.directory, self.target_file)
        html = target_path.read_text(encoding="utf-8")
        if "</body>" in html:
            html = html.replace("</body>", RELOAD_SNIPPET, 1)
        else:
            html += RELOAD_SNIPPET.replace("</body>", "")

        payload = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args) -> None:
        return


class LivePreviewServer(ThreadingHTTPServer):
    def __init__(self, server_address, handler_class):
        super().__init__(server_address, handler_class)
        self.reload_token = ""


def build_token(directory: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        try:
            stat = path.stat()
        except OSError:
            continue
        digest.update(str(path.relative_to(directory)).encode("utf-8"))
        digest.update(str(stat.st_mtime_ns).encode("utf-8"))
        digest.update(str(stat.st_size).encode("utf-8"))
    return digest.hexdigest()


def watch_files(server: LivePreviewServer, directory: Path) -> None:
    while True:
        server.reload_token = build_token(directory)
        time.sleep(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Simple live preview server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5500)
    parser.add_argument("--file", default="index.html")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    directory = Path.cwd()
    target = directory / args.file
    if not target.exists():
        raise SystemExit(f"File not found: {target}")

    handler = lambda *a, **kw: LivePreviewHandler(
        *a,
        directory=str(directory),
        target_file=args.file,
        **kw,
    )
    server = LivePreviewServer((args.host, args.port), handler)
    server.reload_token = build_token(directory)

    watcher = threading.Thread(target=watch_files, args=(server, directory), daemon=True)
    watcher.start()

    url = f"http://{args.host}:{args.port}/{args.file}"
    print(f"Live preview running at {url}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping live preview...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
