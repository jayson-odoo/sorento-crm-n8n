#!/usr/bin/env python3
"""Local host for the Sorento voice console.

Why this exists instead of serving the page from an n8n webhook:

  1. n8n returns `content-security-policy: sandbox ...` (WITHOUT allow-same-origin) on
     every generic webhook response. The document then has a null origin, sessionStorage
     throws SecurityError, and getUserMedia is unavailable — a mic page cannot work there.
     A second CSP header cannot relax it; browsers intersect CSP headers.
  2. Hosting the page on any other origin fails too: the chat webhook honours the node's
     `allowedOrigins` on the OPTIONS preflight but the actual POST response always carries
     `Access-Control-Allow-Origin: <n8n base url>`, so the browser blocks the response.

So the page is served from localhost (a secure context — mic works) and this server
proxies POST /chat to n8n server-side, where CORS does not apply. The page therefore makes
a SAME-ORIGIN request and no CORS is involved at all.

Usage:  python3 serve.py [port]      # default 8000, then open http://localhost:8000/
"""
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CHAT_WEBHOOK = (
    "https://automate-sorento.foundryx.my/webhook/"
    "58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat"
)
ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_POST(self):  # noqa: N802
        if self.path.rstrip("/") != "/chat":
            self.send_error(404, "only /chat is proxied")
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        req = urllib.request.Request(
            CHAT_WEBHOOK,
            data=body,
            method="POST",
            headers={
                # Forward the multipart boundary verbatim; rewriting it corrupts the upload.
                "Content-Type": self.headers.get("Content-Type", "application/json"),
                # Cloudflare fronts the n8n host and rejects the default "Python-urllib/3.x"
                # agent with `error code: 1010` (browser integrity check). Any normal
                # browser UA passes.
                "User-Agent": self.headers.get(
                    "User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
                ),
                "Accept": "*/*",
            },
        )
        try:
            # Whisper + the full spine can take a while on a long clip.
            with urllib.request.urlopen(req, timeout=300) as resp:
                payload, status = resp.read(), resp.status
        except urllib.error.HTTPError as e:
            payload, status = e.read(), e.code
        except Exception as e:  # noqa: BLE001
            payload, status = str(e).encode(), 502

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Sorento voice console → http://localhost:{port}/   (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
