#!/usr/bin/env python3
"""Serve the report builder from its repository and open it in a browser."""

from __future__ import annotations

import argparse
import functools
import http.server
from pathlib import Path
import threading
import webbrowser


APP_DIRECTORY = Path(__file__).resolve().parent


class ApplicationHandler(http.server.SimpleHTTPRequestHandler):
    """Serve application assets while preventing stale files during development."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def parse_arguments() -> argparse.Namespace:
    """Read optional network settings without changing the safe local defaults."""

    parser = argparse.ArgumentParser(description="Run the 3S PV Reliability Report Builder.")
    parser.add_argument("--port", type=int, default=8000, help="Local port (default: 8000).")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the application in the default browser.",
    )
    return parser.parse_args()


def main() -> None:
    """Start a server rooted beside this script, regardless of the current directory."""

    arguments = parse_arguments()
    if not (APP_DIRECTORY / "index.html").is_file():
        raise SystemExit(f"Application entry point not found in {APP_DIRECTORY}")

    # Passing the directory directly to the handler is critical: it prevents a
    # command launched from a home folder from exposing that folder's file list.
    handler = functools.partial(ApplicationHandler, directory=str(APP_DIRECTORY))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", arguments.port), handler)
    url = f"http://127.0.0.1:{arguments.port}/index.html"

    print(f"3S PV Reliability Report Builder is available at {url}")
    print("Press Ctrl+C to stop the server.")
    if not arguments.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
