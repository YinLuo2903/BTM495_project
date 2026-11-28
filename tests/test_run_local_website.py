import sys
import tempfile
import threading
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import run_local_website
from backend.apis.local_website_api import create_server


class RunLocalWebsiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _running_server(self, key: str, key_on_disk: str | None):
        """A real server on a free port, as an earlier launch would leave it."""
        server = create_server("127.0.0.1", 0)
        server.shutdown_key = key
        port = server.server_address[1]
        key_path = Path(self.tmp.name) / f"server-{port}.key"
        if key_on_disk is not None:
            key_path.write_text(key_on_disk, encoding="utf-8")
        def serve() -> None:  # like main(): stop serving, then release the port
            with server:
                server.serve_forever()

        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        patcher = patch("run_local_website.key_file", return_value=key_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        return server, thread, port

    def test_second_launch_stops_the_first_and_takes_its_port(self) -> None:
        first, thread, port = self._running_server("secret", key_on_disk="secret")
        second = run_local_website.take_over("127.0.0.1", port)
        self.assertIsNotNone(second)
        self.addCleanup(second.server_close)
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive())  # the first server's serve_forever() returned
        self.assertEqual(second.server_address[1], port)

    def test_does_not_stop_a_server_without_the_right_key(self) -> None:
        first, thread, port = self._running_server("secret", key_on_disk="guess")
        self.assertIsNone(run_local_website.take_over("127.0.0.1", port))
        self.assertTrue(thread.is_alive())
        first.shutdown()

    def test_leaves_the_port_alone_when_no_key_file_exists(self) -> None:
        first, thread, port = self._running_server("secret", key_on_disk=None)
        self.assertIsNone(run_local_website.take_over("127.0.0.1", port))
        self.assertTrue(thread.is_alive())
        first.shutdown()

    def test_main_logs_initialization_server_ready_and_shutdown(self) -> None:
        server = MagicMock()
        server.__enter__.return_value = server
        server.server_address = ("127.0.0.1", 8765)
        server.serve_forever.side_effect = KeyboardInterrupt

        with (
            patch(
                "run_local_website.parse_args",
                return_value=Namespace(
                    host="127.0.0.1",
                    port=8765,
                    no_browser=True,
                    no_mockdata=False,
                ),
            ),
            patch("run_local_website.initialize_database") as initialize_database,
            patch("run_local_website.has_shop_data", return_value=True),
            patch("run_local_website.sample_data_version", return_value=run_local_website.SAMPLE_DATA_VERSION),
            patch("run_local_website.load_mockdata") as load_mockdata,
            patch("run_local_website.ensure_local_demo_login") as ensure_demo_login,
            patch("run_local_website.ensure_local_admin_login") as ensure_admin_login,
            patch("run_local_website.create_server", return_value=server),
            patch("run_local_website.key_file", return_value=Path(self.tmp.name) / "server.key"),
            self.assertLogs("backend.run_local_website", level="INFO") as logs,
        ):
            run_local_website.main()

        initialize_database.assert_called_once_with()
        load_mockdata.assert_not_called()
        ensure_demo_login.assert_called_once_with()
        ensure_admin_login.assert_called_once_with()
        output = "\n".join(logs.output)
        self.assertIn("Admin login is ready (admin@lpvr.com).", output)
        self.assertIn("Starting local integration server.", output)
        self.assertIn("Initializing SQLite database schema.", output)
        self.assertIn("Database initialization complete.", output)
        self.assertIn("Local demo login is ready (login@example.com).", output)
        self.assertIn("Starting HTTP server on 127.0.0.1:8765.", output)
        self.assertIn("Server ready at http://localhost:8765/.", output)
        self.assertIn("Server stopped by user.", output)

    def _run_main_with_empty_database(self, no_mockdata: bool, has_data: bool = False, version: int = 0) -> tuple[MagicMock, MagicMock, str]:
        server = MagicMock()
        server.__enter__.return_value = server
        server.server_address = ("127.0.0.1", 8765)
        server.serve_forever.side_effect = KeyboardInterrupt
        calls = MagicMock()
        with (
            patch(
                "run_local_website.parse_args",
                return_value=Namespace(host="127.0.0.1", port=8765, no_browser=True, no_mockdata=no_mockdata),
            ),
            patch("run_local_website.initialize_database"),
            patch("run_local_website.has_shop_data", return_value=has_data),
            patch("run_local_website.sample_data_version", return_value=version),
            patch("run_local_website.load_mockdata", calls.load_mockdata),
            patch("run_local_website.ensure_local_demo_login", calls.ensure_demo_login),
            patch("run_local_website.ensure_local_admin_login"),
            patch("run_local_website.create_server", return_value=server),
            patch("run_local_website.key_file", return_value=Path(self.tmp.name) / "server.key"),
            self.assertLogs("backend.run_local_website", level="INFO") as logs,
        ):
            calls.load_mockdata.return_value = {"item": 9, "orders": 9}
            run_local_website.main()
        return calls, calls.load_mockdata, "\n".join(logs.output)

    def test_main_loads_sample_data_into_empty_database_before_demo_logins(self) -> None:
        calls, load_mockdata, output = self._run_main_with_empty_database(no_mockdata=False)
        load_mockdata.assert_called_once_with()
        # CSV rows must go in first so the demo login does not take customer ID 1.
        names = [name for name, *_ in calls.mock_calls]
        self.assertLess(names.index("load_mockdata"), names.index("ensure_demo_login"))
        self.assertIn("Loaded sample data: 18 rows from 2 CSV files.", output)

    def test_main_adds_new_sample_data_to_a_database_from_an_older_version(self) -> None:
        _, load_mockdata, output = self._run_main_with_empty_database(no_mockdata=False, has_data=True, version=1)
        load_mockdata.assert_called_once_with(upgrade=True)
        self.assertIn("Added the new sample data", output)

    def test_main_leaves_an_up_to_date_database_alone(self) -> None:
        _, load_mockdata, output = self._run_main_with_empty_database(
            no_mockdata=False, has_data=True, version=run_local_website.SAMPLE_DATA_VERSION)
        load_mockdata.assert_not_called()
        self.assertIn("sample data is up to date", output)

    def test_main_skips_sample_data_with_flag(self) -> None:
        _, load_mockdata, output = self._run_main_with_empty_database(no_mockdata=True)
        load_mockdata.assert_not_called()
        self.assertIn("Skipping sample data (--no-mockdata).", output)


if __name__ == "__main__":
    unittest.main()
