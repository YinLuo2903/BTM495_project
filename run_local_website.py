import argparse
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

from backend.apis.local_website_api import (
    SHUTDOWN_KEY_HEADER,
    create_server,
    ensure_local_admin_login,
    ensure_local_demo_login,
)
from backend.utils.logger import configure_backend_logging, get_logger
from database.load_mockdata import SAMPLE_DATA_VERSION, has_shop_data, load_mockdata, sample_data_version
from database.sqlite_database import DATA_DIR, initialize_database

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
logger = get_logger(__name__)


def open_browser(url: str) -> None:
    if not webbrowser.open(url):
        print("Could not open the default browser. Open this URL manually:")
        print(url)


def key_file(port: int):
    """Where the running server keeps the key that lets a newer launch stop it."""
    return DATA_DIR / f"server-{port}.key"


def take_over(host: str, port: int):
    """Ask an earlier launch of this site on the port to stop, then start in its place.

    Only a server that wrote our key file is asked; anything else on the port is left alone
    and None is returned.
    """
    try:
        key = key_file(port).read_text(encoding="utf-8").strip()
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", method="POST", headers={SHUTDOWN_KEY_HEADER: key})
        urllib.request.urlopen(request, timeout=3).close()
    except urllib.error.HTTPError as refused:  # something else on the port, or the wrong key
        refused.close()
        return None
    except (OSError, ValueError):  # no key file, or nothing answering
        return None
    logger.info("Stopped the earlier copy of the site on port %d.", port)
    for _ in range(50):  # wait up to 5 s for the port to be released
        try:
            return create_server(host, port)
        except OSError:
            time.sleep(0.1)
    return None


def close_terminal_window() -> None:
    """After a newer launch took over, close this copy's macOS Terminal window.

    macOS Terminal keeps a window open after its program ends, so each replaced copy would
    leave a "[Process completed]" window behind. A detached osascript closes it once it is
    idle. Other systems close their console windows themselves.
    """
    if sys.platform != "darwin" or os.environ.get("TERM_PROGRAM") != "Apple_Terminal" or not sys.stdin.isatty():
        return
    tty = os.ttyname(sys.stdin.fileno())
    # Only windows on our terminal that are no longer running anything: finished windows
    # keep reporting the terminal they last used, and macOS reuses those names.
    # The packaged program's launcher cleans up its temporary files after we exit, so the
    # window can stay busy for a few seconds: keep checking for up to 10 s.
    script = f"""
        tell application "Terminal"
            repeat 20 times
                delay 0.5
                repeat with w in (get windows)
                    try
                        if tty of selected tab of w is "{tty}" and not (busy of selected tab of w) then
                            close w
                            return
                        end if
                    end try
                end repeat
            end repeat
        end tell"""
    subprocess.Popen(
        ["osascript", "-e", script],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local web/database smoke test.")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind address (default: loopback only)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port (default: 8765)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    parser.add_argument(
        "--no-mockdata",
        action="store_true",
        help="Do not load the sample CSV data into an empty database",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    configure_backend_logging()
    logger.info("Starting local integration server.")
    try:
        logger.info("Initializing SQLite database schema.")
        initialize_database()
        logger.info("Database initialization complete.")
        # Fresh database (new clone or machine): fill it with the sample CSV data. A database
        # from an older version gets the newly added sample rows once; nothing else changes.
        # This runs before the demo logins so the CSV rows keep their IDs.
        if args.no_mockdata:
            logger.info("Skipping sample data (--no-mockdata).")
        elif not has_shop_data():
            counts = load_mockdata()
            logger.info("Loaded sample data: %d rows from %d CSV files.", sum(counts.values()), len(counts))
        elif sample_data_version() < SAMPLE_DATA_VERSION:
            load_mockdata(upgrade=True)
            logger.info("Added the new sample data (version %d) to the existing database.", SAMPLE_DATA_VERSION)
        else:
            logger.info("Shop data found; sample data is up to date.")
        ensure_local_demo_login()
        logger.info("Local demo login is ready (login@example.com).")
        ensure_local_admin_login()
        logger.info("Admin login is ready (admin@lpvr.com).")

        logger.info("Starting HTTP server on %s:%d.", args.host, args.port)
        try:
            server = create_server(args.host, args.port)
        except OSError:
            server = take_over(args.host, args.port)
            if server is None:
                logger.error(
                    "Port %d is already in use. Stop the other server (or close its "
                    "terminal) or start with --port <another port>.",
                    args.port,
                )
                raise SystemExit(1)
        server.shutdown_key = secrets.token_urlsafe(32)
        key_path = key_file(args.port)
        key_path.write_text(server.shutdown_key, encoding="utf-8")
        with server:
            host, port = server.server_address[:2]
            display_host = "localhost" if host in ("127.0.0.1", "::1") else host
            url = f"http://{display_host}:{port}/"

            logger.info("Server ready at %s.", url)
            logger.info("Press Ctrl+C to stop the server.")
            if not args.no_browser:
                logger.info("Opening the local website in your browser.")
                open_browser(url)

            try:
                server.serve_forever()
                logger.info("Server stopped: a newer copy of the site took over.")
                close_terminal_window()
            except KeyboardInterrupt:
                logger.info("Server stopped by user.")
            finally:
                # Leave the key file if a newer launch has already replaced it with its own.
                if key_path.exists() and key_path.read_text(encoding="utf-8") == server.shutdown_key:
                    key_path.unlink()
    except Exception:
        logger.exception("Local integration server failed.")
        raise


if __name__ == "__main__":
    main()
