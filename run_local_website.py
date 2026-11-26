import argparse
import webbrowser

from backend.apis.local_website_api import (
    create_server,
    ensure_local_admin_login,
    ensure_local_demo_login,
)
from backend.utils.logger import configure_backend_logging, get_logger
from database.load_mockdata import has_shop_data, load_mockdata
from database.sqlite_database import initialize_database

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
logger = get_logger(__name__)


def open_browser(url: str) -> None:
    if not webbrowser.open(url):
        print("Could not open the default browser. Open this URL manually:")
        print(url)


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
        # Fresh database (new clone or machine): fill it with the sample CSV data.
        # This runs before the demo logins so the CSV rows keep their IDs.
        if args.no_mockdata:
            logger.info("Skipping sample data (--no-mockdata).")
        elif has_shop_data():
            logger.info("Shop data found; sample data not loaded.")
        else:
            counts = load_mockdata()
            logger.info("Loaded sample data: %d rows from %d CSV files.", sum(counts.values()), len(counts))
        ensure_local_demo_login()
        logger.info("Local demo login is ready (login@example.com).")
        ensure_local_admin_login()
        logger.info("Admin login is ready (admin@lpvr.com).")

        logger.info("Starting HTTP server on %s:%d.", args.host, args.port)
        try:
            server = create_server(args.host, args.port)
        except OSError:
            logger.error(
                "Port %d is already in use. Stop the other server (or close its "
                "terminal) or start with --port <another port>.",
                args.port,
            )
            raise SystemExit(1)
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
            except KeyboardInterrupt:
                logger.info("Server stopped by user.")
    except Exception:
        logger.exception("Local integration server failed.")
        raise


if __name__ == "__main__":
    main()
