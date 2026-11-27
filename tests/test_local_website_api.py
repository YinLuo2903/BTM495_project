import http.client
import json
import hashlib
import logging
import re
import sqlite3
import sys
import threading
import time
import unittest
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.apis.appointment_booking_api import OPEN_WEEKDAYS
from backend.apis.local_website_api import (
    create_server,
    ensure_local_admin_login,
    ensure_local_demo_login,
)
from backend.apis.profile_api import ManageProfile
from backend.apis.session_api import SESSION_LIFETIME_SECONDS
from backend.apis.shopping_cart_api import ShoppingCartAPI
from backend.models.admin import Admin
from backend.models.customer import Customer


class LocalDryRunWebsiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "test.db"
        with closing(sqlite3.connect(self.database_path)) as connection:
            schema_path = Path(__file__).resolve().parents[1] / "database" / "schema.sql"
            connection.executescript(schema_path.read_text(encoding="utf-8"))
            connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
            connection.executemany(
                "INSERT INTO sample (id) VALUES (?)",
                [(1,), (2,)],
            )
            connection.execute(
                "INSERT INTO customer (customer_id, first_name) "
                "VALUES (1, 'Test Customer')"
            )
            connection.execute(
                "INSERT INTO orders (order_id, customer_id, totalAmount) "
                "VALUES (101, 1, 42.50)"
            )
            connection.commit()

        self.database_patch = patch(
            "backend.apis.local_website_api.DB_PATH",
            self.database_path,
        )
        self.database_patch.start()
        self.server = create_server("127.0.0.1", 0)
        self.server_thread = threading.Thread(
            target=self.server.serve_forever,
            daemon=True,
        )
        self.server_thread.start()
        host, port = self.server.server_address[:2]
        self.base_url = f"http://{host}:{port}"
        self.api_url = f"{self.base_url}/api/status"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join()
        self.database_patch.stop()
        self.temp_dir.cleanup()

    def test_status_reports_readable_tables_and_row_counts(self) -> None:
        with urlopen(self.api_url) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["database"], "test.db")
        self.assertEqual(
            payload["tables"],
            [
                {"name": "admin", "rows": 0},
                {"name": "appointment", "rows": 0},
                {"name": "customer", "rows": 1},
                {"name": "event", "rows": 0},
                {"name": "event_registration", "rows": 0},
                {"name": "inventory", "rows": 0},
                {"name": "inventory_history", "rows": 0},
                {"name": "item", "rows": 0},
                {"name": "order_item", "rows": 0},
                {"name": "orders", "rows": 1},
                {"name": "payment", "rows": 0},
                {"name": "sample", "rows": 2},
                {"name": "shopping_cart", "rows": 0},
                {"name": "status", "rows": 3},
                {"name": "user_session", "rows": 0},
            ],
        )

        with closing(sqlite3.connect(self.database_path)) as connection:
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM sample").fetchone()[0],
                2,
            )

    def test_frontend_page_is_served(self) -> None:
        for path in ("/", "/view/index.html", "/views/index.html"):
            with self.subTest(path=path):
                with urlopen(self.base_url + path) as response:
                    self.assertEqual(response.status, 200)
                    page = response.read().decode("utf-8")
                self.assertIn('<div id="root"></div>', page)
                self.assertRegex(page, r'src="/assets/[^"]+\.js"')
                self.assertRegex(page, r'href="/assets/[^"]+\.css"')
                for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', page):
                    with urlopen(self.base_url + asset) as response:
                        self.assertEqual(response.status, 200)

    def test_customer_and_admin_routes_serve_built_frontend(self) -> None:
        pages = {
            "customer": ("index", "items", "item", "events", "appointments",
                         "cart", "checkout", "orders", "profile", "login", "signup"),
            "admin": ("index", "items", "inventory", "orders", "events", "appointments"),
        }
        for section, names in pages.items():
            for name in names:
                with self.subTest(section=section, page=name):
                    with urlopen(f"{self.base_url}/views/{section}/{name}.html?id=1") as response:
                        self.assertEqual(response.status, 200)
                        page = response.read().decode("utf-8")
                    self.assertIn('<div id="root"></div>', page)
                    for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', page):
                        with urlopen(self.base_url + asset) as response:
                            self.assertEqual(response.status, 200)
                    self.assertRegex(page, r'src="/assets/[^"]+\.js"')
                    self.assertRegex(page, r'href="/assets/[^"]+\.css"')

    def test_missing_frontend_build_reports_error(self) -> None:
        with patch("backend.apis.local_website_api.FRONTEND_BUILD_DIR", Path(self.temp_dir.name) / "missing"):
            for path in ("/", "/views/customer/login.html"):
                with self.subTest(path=path):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(self.base_url + path)
                    self.assertEqual(error.exception.code, 503)

    def test_login_endpoint_calls_profile_login_and_returns_role(self) -> None:
        ManageProfile(self.database_path).createAccount(
            Customer(first_name="Login", last_name="Test", email="login@example.com"),
            "test-password",
        )

        with self.assertLogs("backend", level="INFO") as logs:
            with self._post_login(
                {"email": "login@example.com", "password": "test-password"}
            ) as response:
                self.assertEqual(response.status, 200)
                payload = json.load(response)

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(
            payload["user"],
            {"name": "Login Test", "is_admin": False},
        )
        self.assertRegex(payload["token"], r"^[A-Za-z0-9_-]{43}$")
        self.assertIsInstance(payload["expires_at"], int)
        with closing(sqlite3.connect(self.database_path)) as connection:
            row = connection.execute(
                "SELECT token_hash, admin_id, customer_id, created_at, expires_at "
                "FROM user_session"
            ).fetchone()
        self.assertEqual(row[0], hashlib.sha256(payload["token"].encode("ascii")).hexdigest())
        self.assertIsNone(row[1])
        self.assertIsNotNone(row[2])
        self.assertEqual(row[4], payload["expires_at"])
        self.assertEqual(row[4] - row[3], SESSION_LIFETIME_SECONDS)
        log_output = "\n".join(logs.output)
        self.assertIn(
            "Login input received (email supplied, password supplied)",
            log_output,
        )
        self.assertIn("Login output: successful authentication", log_output)
        self.assertNotIn("test-password", log_output)
        self.assertNotIn("login@example.com", log_output)
        self.assertNotIn(payload["token"], log_output)

    def test_sessions_validate_expire_and_logout_independently_for_both_roles(self) -> None:
        profile = ManageProfile(self.database_path)
        profile.createAccount(Customer(first_name="Customer", last_name="Tester", email="customer@example.com"), "password1")
        profile.createAccount(Admin(name="Admin", email="admin@example.com"), "password2")
        sessions = []
        with patch("backend.apis.session_api.time.time", return_value=1_000_000):
            for email, password in (
                ("customer@example.com", "password1"),
                ("admin@example.com", "password2"),
            ):
                with self._post_login({"email": email, "password": password}) as response:
                    self.assertEqual(response.status, 200)
                    sessions.append(json.load(response))
            self.assertNotEqual(sessions[0]["token"], sessions[1]["token"])
            for item in sessions:
                with self._session_request("/api/session", item["token"]) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(json.load(response)["user"], item["user"])
            with self._session_request("/api/logout", sessions[0]["token"], "POST") as response:
                self.assertEqual(response.status, 200)
            with self._session_request("/api/session", sessions[0]["token"]) as response:
                self.assertEqual(response.status, 401)
            with self._session_request("/api/session", sessions[1]["token"]) as response:
                self.assertEqual(response.status, 200)
        with patch("backend.apis.session_api.time.time", return_value=1_000_000 + SESSION_LIFETIME_SECONDS):
            with self._session_request("/api/session", sessions[1]["token"]) as response:
                self.assertEqual(response.status, 401)
            with self._post_login({"email": "customer@example.com", "password": "password1"}) as response:
                self.assertEqual(response.status, 200)
            with closing(sqlite3.connect(self.database_path)) as connection:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM user_session").fetchone()[0], 1)

    def test_session_endpoints_reject_missing_and_invalid_tokens(self) -> None:
        for token in ("", "not-a-token", "a" * 43):
            for path, method in (("/api/session", "GET"), ("/api/logout", "POST")):
                with self.subTest(token=token, path=path):
                    with self._session_request(path, token, method) as response:
                        self.assertEqual(response.status, 401)

    def test_login_session_database_failure_returns_error(self) -> None:
        ManageProfile(self.database_path).createAccount(
            Customer(first_name="Login", last_name="Test", email="login@example.com"), "test-password"
        )
        with patch("backend.apis.local_website_api.SessionManager.create", side_effect=sqlite3.OperationalError("test")):
            with self._post_login({"email": "login@example.com", "password": "test-password"}) as response:
                self.assertEqual(response.status, 500)
                self.assertNotIn("token", json.load(response))

    def test_session_database_failures_return_errors(self) -> None:
        for path, method, operation in (
            ("/api/session", "GET", "get_user"),
            ("/api/logout", "POST", "revoke"),
        ):
            with self.subTest(path=path):
                with patch(
                    f"backend.apis.local_website_api.SessionManager.{operation}",
                    side_effect=sqlite3.OperationalError("test"),
                ):
                    with self._session_request(path, "a" * 43, method) as response:
                        self.assertEqual(response.status, 500)
                        self.assertEqual(json.load(response)["status"], "error")

    def test_local_demo_login_is_created_idempotently(self) -> None:
        ensure_local_demo_login(self.database_path)
        ensure_local_demo_login(self.database_path)

        user = ManageProfile(self.database_path).login(
            "login@example.com",
            "1234",
        )
        self.assertIsNotNone(user)
        assert user is not None
        self.assertEqual(user.name, "Local Dry-Run")
        self.assertFalse(user.isAdmin)

        with closing(sqlite3.connect(self.database_path)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM customer WHERE email = ?",
                    ("login@example.com",),
                ).fetchone()[0],
                1,
            )

    def test_local_demo_login_does_not_replace_existing_account(self) -> None:
        profile = ManageProfile(self.database_path)
        profile.createAccount(
            Customer(first_name="Existing", last_name="Login", email="login@example.com"),
            "existing-password",
        )

        with self.assertRaisesRegex(RuntimeError, "already in use"):
            ensure_local_demo_login(self.database_path)

        self.assertIsNotNone(
            profile.login("login@example.com", "existing-password")
        )

    def test_local_admin_login_is_created_idempotently_and_signs_in_as_admin(self) -> None:
        ensure_local_admin_login(self.database_path)
        ensure_local_admin_login(self.database_path)

        user = ManageProfile(self.database_path).login("admin@lpvr.com", "123456789")
        self.assertIsInstance(user, Admin)
        assert user is not None
        self.assertEqual(user.name, "Admin")
        self.assertEqual(user.phone, "514-123-4567")
        self.assertEqual(user.address, "7141 Rue Sherbrooke O PS 145, Montréal, QC H4B 2B9")

        with closing(sqlite3.connect(self.database_path)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM admin WHERE email = ?", ("admin@lpvr.com",)
                ).fetchone()[0],
                1,
            )

        # The login page uses is_admin to send this account to the admin dashboard.
        with self._post_login({"email": "admin@lpvr.com", "password": "123456789"}) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)
        self.assertEqual(payload["user"], {"name": "Admin", "is_admin": True})

    def test_local_admin_login_does_not_replace_existing_account(self) -> None:
        profile = ManageProfile(self.database_path)
        profile.createAccount(
            Customer(first_name="Taken", last_name="Email", email="admin@lpvr.com"),
            "existing-password",
        )

        with self.assertRaisesRegex(RuntimeError, "already in use"):
            ensure_local_admin_login(self.database_path)

        self.assertIsInstance(
            profile.login("admin@lpvr.com", "existing-password"), Customer
        )

    def test_login_endpoint_rejects_incorrect_credentials(self) -> None:
        with self.assertLogs("backend", level="WARNING") as logs:
            with self._post_login(
                {"email": "missing@example.com", "password": "wrong-password"}
            ) as response:
                self.assertEqual(response.status, 401)
                payload = json.load(response)

        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["message"], "Email or password is incorrect.")
        self.assertIn("Login output: rejected credentials", "\n".join(logs.output))
        self.assertNotIn("wrong-password", "\n".join(logs.output))
        with closing(sqlite3.connect(self.database_path)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM user_session").fetchone()[0], 0)

    def test_dashboard_shows_orders_and_payment_history(self) -> None:
        with self.assertLogs("backend", level="DEBUG") as logs:
            with urlopen(self.base_url + "/api/dashboard") as response:
                self.assertEqual(response.status, 200)
                payload = json.load(response)

        self.assertEqual(
            payload["orders"],
            [
                {
                    "order_id": 101,
                    "order_date": None,
                    "total_amount": 42.5,
                    "paid": False,
                    "customer_id": 1,
                    "customer_name": "Test Customer",
                    "status_id": None,
                }
            ],
        )
        self.assertEqual(payload["payments"], [])
        log_output = "\n".join(logs.output)
        self.assertIn("get_dashboard_data: SELECT ", log_output)
        self.assertIn("| found 1 row(s)", log_output)
        self.assertIn(
            "Backend output: Dashboard loaded: 1 order, $42.50 total, "
            "0 payment record(s). Orders: #101 $42.50, date unknown, unpaid.",
            log_output,
        )
        self.assertRegex(
            log_output,
            r"HTTP GET /api/dashboard -> OK in \d+\.\d+ ms",
        )
        self.assertNotIn("127.0.0.1 - - [", log_output)

    def test_dashboard_marks_paid_orders_and_lists_payments(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                "INSERT INTO payment "
                "(order_id, paymentDateTime, amount, paymentMethod, statusID) "
                "VALUES (?, ?, ?, ?, (SELECT statusID FROM status "
                "WHERE name = 'Completed'))",
                (101, "2025-01-01 12:00:00", 42.5, "Credit Card"),
            )
            connection.commit()

        with urlopen(self.base_url + "/api/dashboard") as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertTrue(payload["orders"][0]["paid"])
        self.assertEqual(
            payload["payments"],
            [
                {
                    "payment_id": 1,
                    "order_id": 101,
                    "payment_date": "2025-01-01 12:00:00",
                    "amount": 42.5,
                    "payment_method": "Credit Card",
                    "paid_status": True,
                    "status_id": 2,
                    "customer_name": "Test Customer",
                }
            ],
        )

    def test_dashboard_does_not_mark_pending_or_failed_payments_paid(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            for status_name in ("Pending", "Cancelled"):
                connection.execute(
                    "INSERT INTO payment "
                    "(order_id, paymentDateTime, amount, paymentMethod, statusID) "
                    "VALUES (?, ?, ?, ?, (SELECT statusID FROM status "
                    "WHERE name = ?))",
                    (101, "2025-01-01 12:00:00", 42.5, "Cash", status_name),
                )
            connection.commit()

        with urlopen(self.base_url + "/api/dashboard") as response:
            payload = json.load(response)

        self.assertFalse(payload["orders"][0]["paid"])
        self.assertEqual(
            [payment["paid_status"] for payment in payload["payments"]],
            [False, False],
        )

    def test_sample_order_is_created_and_reused_until_paid(self) -> None:
        request = Request(
            self.base_url + "/api/sample-orders",
            data=b"",
            method="POST",
        )
        with urlopen(request) as response:
            self.assertEqual(response.status, 201)
            first_payload = json.load(response)

        with urlopen(request) as response:
            self.assertEqual(response.status, 201)
            second_payload = json.load(response)

        self.assertEqual(first_payload, second_payload)
        self.assertEqual(first_payload["order"]["total_amount"], 50.0)
        with closing(sqlite3.connect(self.database_path)) as connection:
            sample_user_count = connection.execute(
                "SELECT COUNT(*) FROM customer "
                "WHERE email = 'local-payment-demo@example.invalid'"
            ).fetchone()[0]
            sample_order_count = connection.execute(
                "SELECT COUNT(*) FROM orders WHERE customer_id = "
                "(SELECT customer_id FROM customer "
                "WHERE email = 'local-payment-demo@example.invalid')"
            ).fetchone()[0]
        self.assertEqual(sample_user_count, 1)
        self.assertEqual(sample_order_count, 1)

    def _upload(self, data: bytes, content_type: str):
        request = Request(
            self.base_url + "/api/uploads", data=data,
            headers={"Content-Type": content_type}, method="POST",
        )
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_uploads_an_image_and_serves_it(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        with TemporaryDirectory() as folder, patch(
            "backend.apis.local_website_api.UPLOAD_DIR", Path(folder)
        ):
            status, body = self._upload(png, "image/png")
            self.assertEqual(status, 201)
            self.assertRegex(body["image_path"], r"^/uploads/[0-9a-f]{32}\.png$")
            with urlopen(self.base_url + body["image_path"]) as response:
                self.assertEqual(response.headers["Content-Type"], "image/png")
                self.assertEqual(response.read(), png)
            for missing in ("/uploads/nothing.png", "/uploads/..%2F..%2Fschema.sql"):
                with self.subTest(path=missing), self.assertRaises(HTTPError) as error:
                    urlopen(self.base_url + missing)
                self.assertEqual(error.exception.code, 404)

    def test_rejects_uploads_that_are_not_small_images(self) -> None:
        with TemporaryDirectory() as folder, patch(
            "backend.apis.local_website_api.UPLOAD_DIR", Path(folder)
        ):
            self.assertEqual(
                self._upload(b"GIF89a....", "image/gif"),
                (415, {"status": "error", "message": "Choose a JPG, PNG or WebP image."}),
            )
            self.assertEqual(
                self._upload(b"<svg onload=alert(1)>", "image/png"),
                (400, {"status": "error", "message": "The file is not a valid image."}),
            )
            # Too large: refused from the header alone, before the body is read.
            connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
            connection.putrequest("POST", "/api/uploads")
            connection.putheader("Content-Type", "image/jpeg")
            connection.putheader("Content-Length", str(3 * 1024 * 1024))
            connection.endheaders()
            response = connection.getresponse()
            self.assertEqual((response.status, json.load(response)["message"]), (413, "Choose an image up to 2 MB."))
            connection.close()
            self.assertEqual(list(Path(folder).iterdir()), [])

    def _call(self, method: str, path: str, payload: dict | None = None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            self.base_url + path,
            data=data,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            return urlopen(request)
        except HTTPError as error:
            return error

    def _add_payment(self, order_id: int = 101) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                "INSERT INTO payment "
                "(order_id, paymentDateTime, amount, paymentMethod, statusID) "
                "VALUES (?, '2025-01-01 12:00:00', 42.5, 'Credit Card', "
                "(SELECT statusID FROM status "
                "WHERE name = 'Completed'))",
                (order_id,),
            )
            connection.commit()

    def _count(self, table: str) -> int:
        with closing(sqlite3.connect(self.database_path)) as connection:
            return connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    def _json(self, method: str, path: str, payload: dict | None = None):
        with self._call(method, path, payload) as response:
            return response.status, json.load(response)

    def _auth_json(
        self, method: str, path: str, token: str, payload: dict | None = None
    ):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            self.base_url + path,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method=method,
        )
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_signup_saves_customer_and_assigns_lpvr_code(self) -> None:
        status, body = self._json(
            "POST",
            "/api/signup",
            {
                "first_name": " Jamie ",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": " 514-555-0123 ",
                "address": "12 Rue Sherbrooke O, Montreal, QC H2X 1Y2",
                "password": "secret-pass",
            },
        )
        self.assertEqual(status, 201)
        # The fixture already holds customer 1, so the new customer is LPVR002.
        self.assertEqual(
            body["customer"],
            {
                "customer_code": "LPVR002",
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal, QC H2X 1Y2",
            },
        )
        with closing(sqlite3.connect(self.database_path)) as connection:
            row = connection.execute(
                "SELECT customer_code, first_name, last_name, password_hash "
                "FROM customer WHERE email = 'jamie@example.com'"
            ).fetchone()
        self.assertEqual(row[:3], ("LPVR002", "Jamie", "Rivera"))
        self.assertTrue(row[3].startswith("pbkdf2_sha256$"))
        self.assertNotIn("secret-pass", row[3])

        status, body = self._json(
            "POST",
            "/api/login",
            {"email": "jamie@example.com", "password": "secret-pass"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["user"], {"name": "Jamie Rivera", "is_admin": False})

    def test_signup_rejects_invalid_and_duplicate_accounts(self) -> None:
        valid = {
            "first_name": "Jamie",
            "last_name": "Rivera",
            "email": "jamie@example.com",
            "phone": "514-555-0123",
            "address": "12 Rue Sherbrooke O, Montreal",
            "password": "secret-pass",
        }
        for field, value, message in (
            ("phone", " ", "Phone number is required."),
            ("address", "", "Home address is required."),
            ("phone", "call me", "Phone number must contain 7 to 15 digits."),
            ("phone", "123", "Phone number must contain 7 to 15 digits."),
            ("first_name", " ", "First name is required."),
            ("last_name", "", "Last name is required."),
            ("email", "not-an-email", "Email must contain"),
            ("password", "short", "Password must be at least 8 characters."),
        ):
            with self.subTest(field=field):
                status, body = self._json("POST", "/api/signup", {**valid, field: value})
                self.assertEqual(status, 400)
                self.assertIn(message, body["message"])
        self.assertEqual(self._count("customer"), 1)

        self.assertEqual(self._json("POST", "/api/signup", valid)[0], 201)
        status, body = self._json(
            "POST", "/api/signup", {**valid, "first_name": "Other"}
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["message"], "An account with this email already exists.")
        self.assertEqual(self._count("customer"), 2)

    def test_profile_requires_customer_session_and_saves_changes(self) -> None:
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST",
            "/api/login",
            {"email": "jamie@example.com", "password": "secret-pass"},
        )[1]["token"]

        status, body = self._auth_json("GET", "/api/profile", token)
        self.assertEqual(status, 200)
        self.assertEqual(body["customer"]["customer_code"], "LPVR002")
        self.assertEqual(body["customer"]["first_name"], "Jamie")

        status, body = self._auth_json(
            "PATCH",
            "/api/profile",
            token,
            {"first_name": "Jay", "phone": "514-555-0000", "address": "1 Rue Test"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["customer"]["first_name"], "Jay")
        self.assertEqual(body["customer"]["last_name"], "Rivera")
        self.assertEqual(body["customer"]["customer_code"], "LPVR002")
        status, body = self._auth_json("GET", "/api/session", token)
        self.assertEqual(body["user"]["name"], "Jay Rivera")

        for payload, expected in (
            ({"last_name": " "}, 400),
            ({"email": "bad"}, 400),
            ({"customer_code": "LPVR999"}, 400),
            ({"phone": 5145550000}, 400),
            ({"phone": ""}, 400),
            ({"phone": "not a phone"}, 400),
            ({"address": " "}, 400),
        ):
            with self.subTest(payload=payload):
                status, _ = self._auth_json("PATCH", "/api/profile", token, payload)
                self.assertEqual(status, expected)
        status, body = self._auth_json("GET", "/api/profile", token)
        self.assertEqual(body["customer"]["last_name"], "Rivera")
        self.assertEqual(body["customer"]["email"], "jamie@example.com")

        ManageProfile(self.database_path).createAccount(
            Admin(name="Morgan", email="admin@example.com"), "admin-password"
        )
        admin_token = self._json(
            "POST",
            "/api/login",
            {"email": "admin@example.com", "password": "admin-password"},
        )[1]["token"]
        for bearer in (admin_token, "", "x" * 43):
            with self.subTest(bearer=bearer[:5]):
                self.assertEqual(self._auth_json("GET", "/api/profile", bearer)[0], 401)
                self.assertEqual(
                    self._auth_json("PATCH", "/api/profile", bearer, {"first_name": "X"})[0],
                    401,
                )

    def test_inventory_routes_cover_every_inventory_api(self) -> None:
        status, body = self._json(
            "POST",
            "/api/inventory",
            {"item_id": 5, "name": "Tube", "price": 8.5, "stock_quantity": 4},
        )
        self.assertEqual(status, 201)
        status, body = self._json(
            "PATCH",
            "/api/inventory/5",
            {"price": 9, "stock_quantity": 2, "reason": "Cycle count"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["stockQuantity"], [4, 2])
        self.assertEqual(self._json("PATCH", "/api/inventory/5", {"price": 9})[0], 400)

        _, body = self._json("GET", "/api/inventory")
        self.assertEqual(
            [(i["item_id"], i["price"], i["stock_quantity"]) for i in body["items"]],
            [(5, 9, 2)],
        )
        _, body = self._json("GET", "/api/inventory/5/history")
        self.assertEqual(
            [(h["oldQuantity"], h["newQuantity"]) for h in body["history"]],
            [(None, 4), (4, 2)],
        )

        self.assertEqual(self._json("GET", "/api/inventory/9/history")[0], 404)
        self.assertEqual(self._json("POST", "/api/inventory", {"bogus": 1})[0], 400)
        self.assertEqual(self._json("PATCH", "/api/inventory/5", {"bogus": 1})[0], 400)
        self.assertEqual(self._json("DELETE", "/api/inventory/5")[0], 200)
        self.assertEqual(self._json("DELETE", "/api/inventory/5")[0], 404)
        self.assertEqual(self._count("inventory"), 0)
        self.assertEqual(self._count("inventory_history"), 0)

    def test_event_registration_routes(self) -> None:
        status, body = self._json(
            "POST", "/api/events", {"name": "Ride", "participant_limit": 1}
        )
        self.assertEqual(status, 201)
        event_id = body["event_id"]
        self.assertEqual(self._json("POST", "/api/events", {"name": " "})[0], 400)

        register = {"event_id": event_id, "customer_id": 1}
        self.assertEqual(self._json("POST", "/api/event-registrations", register)[0], 201)
        self.assertEqual(self._json("POST", "/api/event-registrations", register)[0], 400)
        self.assertEqual(
            self._json("POST", "/api/event-registrations", {"event_id": "x"})[0], 400
        )
        _, body = self._json("GET", "/api/events")
        self.assertEqual(body["events"][0]["customer_ids"], [1])
        self.assertEqual(body["customers"][0]["customer_id"], 1)

        path = f"/api/event-registrations/{event_id}/1"
        self.assertEqual(self._json("DELETE", path)[0], 200)
        self.assertEqual(self._json("DELETE", path)[0], 404)
        self.assertEqual(self._json("DELETE", "/api/event-registrations/x/1")[0], 404)
        self.assertEqual(self._json("DELETE", f"/api/events/{event_id}")[0], 200)
        self.assertEqual(self._json("DELETE", f"/api/events/{event_id}")[0], 404)

    def test_signed_in_customer_registers_for_events(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                "INSERT INTO event (event_id, name, description, location, "
                "eventDateTime, participantLimit, statusID) "
                "VALUES (7, 'Winter Prep', 'Get ready', 'Workshop', "
                "'2026-11-21 13:00:00', 1, 1)"
            )
            connection.commit()
        _, body = self._json("GET", "/api/events")
        self.assertEqual(
            {key: body["events"][0][key] for key in (
                "description", "location", "event_date_time", "status_id"
            )},
            {
                "description": "Get ready",
                "location": "Workshop",
                "event_date_time": "2026-11-21 13:00:00",
                "status_id": 1,
            },
        )

        self.assertEqual(self._auth_json("GET", "/api/my-events", "")[0], 401)
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST",
            "/api/login",
            {"email": "jamie@example.com", "password": "secret-pass"},
        )[1]["token"]

        self.assertEqual(self._auth_json("GET", "/api/my-events", token), (
            200, {"status": "ok", "event_ids": []}
        ))
        self.assertEqual(self._auth_json("POST", "/api/my-events/7", token)[0], 201)
        self.assertEqual(
            self._auth_json("GET", "/api/my-events", token)[1]["event_ids"], [7]
        )
        status, body = self._auth_json("POST", "/api/my-events/7", token)
        self.assertEqual((status, body["message"]), (400, "Customer is already registered."))
        self.assertEqual(self._auth_json("POST", "/api/my-events/99", token)[0], 404)
        self.assertEqual(self._auth_json("POST", "/api/my-events/x", token)[0], 404)
        self.assertEqual(self._auth_json("GET", "/api/my-events/7", token)[0], 404)

        self.assertEqual(self._auth_json("DELETE", "/api/my-events/7", token)[0], 200)
        self.assertEqual(self._auth_json("DELETE", "/api/my-events/7", token)[0], 404)
        self.assertEqual(
            self._auth_json("GET", "/api/my-events", token)[1]["event_ids"], []
        )

    def test_customer_books_repair_appointment(self) -> None:
        day = date.today() + timedelta(days=2)
        while day.weekday() not in OPEN_WEEKDAYS:
            day += timedelta(days=1)
        month = day.strftime("%Y-%m")

        self.assertEqual(
            self._json("GET", "/api/appointments/availability?month=2026-1")[0], 400
        )
        status, body = self._json("GET", f"/api/appointments/availability?month={month}")
        self.assertEqual(status, 200)
        days = {entry["date"]: entry for entry in body["days"]}
        self.assertEqual(days[day.isoformat()], {"date": day.isoformat(), "state": "open", "booked": []})

        booking = {
            "date": day.isoformat(),
            "time": "14:00",
            "repair_type": "Gear Adjustment",
            "description": "Chain skips on the smallest cog.",
        }
        self.assertEqual(self._auth_json("POST", "/api/my-appointments", "", booking)[0], 401)
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST",
            "/api/login",
            {"email": "jamie@example.com", "password": "secret-pass"},
        )[1]["token"]

        status, body = self._auth_json("POST", "/api/my-appointments", token, booking)
        self.assertEqual(status, 201)
        self.assertEqual(body["appointment"]["time"], "14:00")
        status, body = self._auth_json("POST", "/api/my-appointments", token, booking)
        self.assertEqual(status, 409)
        status, body = self._auth_json(
            "POST", "/api/my-appointments", token, {**booking, "time": "15:00", "repair_type": "Paint"}
        )
        self.assertEqual((status, body["message"]), (400, "Select a repair type."))
        status, body = self._auth_json("GET", "/api/my-appointments", token)
        self.assertEqual(status, 200)
        self.assertEqual([(a["time"], a["repair_type"], a["description"]) for a in body["appointments"]],
                         [(f"{day.isoformat()} 14:00:00", "Gear Adjustment", "Chain skips on the smallest cog.")])
        self.assertEqual(self._auth_json("GET", "/api/my-appointments", "")[0], 401)
        self.assertEqual(self._auth_json("DELETE", "/api/my-appointments", token)[0], 404)

        _, body = self._json("GET", f"/api/appointments/availability?month={month}")
        self.assertEqual(
            {entry["date"]: entry for entry in body["days"]}[day.isoformat()]["booked"], ["14:00"]
        )

    def test_signed_in_customer_adds_items_to_cart_within_stock(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.executemany(
                "INSERT INTO item (item_id, name, price) VALUES (?, ?, ?)",
                [(1, "Road Bike", 2199.0), (2, "Floor Pump", 49.0), (3, "Tune-up", 40.0)],
            )
            # Item 3 has no inventory row, so its stock is not tracked.
            connection.executemany(
                "INSERT INTO inventory (item_id, quantity) VALUES (?, ?)", [(1, 2), (2, 0)]
            )
            connection.commit()

        self.assertEqual(self._auth_json("GET", "/api/my-cart", "")[0], 401)
        self.assertEqual(
            self._auth_json("POST", "/api/my-cart", "", {"item_id": 1})[0], 401
        )
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST", "/api/login", {"email": "jamie@example.com", "password": "secret-pass"}
        )[1]["token"]

        status, body = self._auth_json("GET", "/api/my-cart", token)
        self.assertEqual((status, body["items"], body["count"], body["total"]), (200, [], 0, 0))

        status, body = self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})
        self.assertEqual(status, 200)
        self.assertEqual(body["message"], "Road Bike added to your cart.")
        self.assertEqual(
            [(line["item_id"], line["quantity"]) for line in body["items"]], [(1, 1)]
        )
        self.assertEqual(body["count"], 1)
        self.assertEqual(self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})[1]["count"], 2)

        # A third bike would exceed the stock of 2; the cart stays as it was.
        status, body = self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})
        self.assertEqual(status, 409)
        self.assertEqual(body["message"], "Your cart already has 2 of Road Bike; only 2 in stock.")
        self.assertEqual(body["count"], 2)

        status, body = self._auth_json("POST", "/api/my-cart", token, {"item_id": 2})
        self.assertEqual((status, body["message"]), (409, "Floor Pump is out of stock."))

        status, body = self._auth_json(
            "POST", "/api/my-cart", token, {"item_id": 3, "quantity": 5}
        )
        self.assertEqual((status, body["count"]), (200, 7))

        self.assertEqual(self._auth_json("POST", "/api/my-cart", token, {"item_id": 99})[0], 404)
        for bad in ({"item_id": "1"}, {"item_id": 0}, {"item_id": 1, "quantity": 0}, {"item_id": 3, "quantity": 100}):
            self.assertEqual(self._auth_json("POST", "/api/my-cart", token, bad)[0], 400, bad)
        self.assertEqual(self._auth_json("DELETE", "/api/my-cart", token)[0], 404)

        # The shopping cart page reads names, prices, subtotals and the total from here.
        status, body = self._auth_json("GET", "/api/my-cart", token)
        self.assertEqual(
            body["items"],
            [
                {"item_id": 1, "name": "Road Bike", "category": "", "price": 2199.0,
                 "quantity": 2, "subtotal": 4398.0, "stock_quantity": 2},
                {"item_id": 3, "name": "Tune-up", "category": "", "price": 40.0,
                 "quantity": 5, "subtotal": 200.0, "stock_quantity": None},
            ],
        )
        self.assertEqual((body["count"], body["total"]), (7, 4598.0))

    def test_customer_updates_quantity_and_removes_cart_lines(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.executemany(
                "INSERT INTO item (item_id, name, price) VALUES (?, ?, ?)",
                [(1, "Road Bike", 2199.0), (2, "Brake Pads", 24.95)],
            )
            connection.execute("INSERT INTO inventory (item_id, quantity) VALUES (1, 4)")
            connection.commit()
        self.assertEqual(self._auth_json("PATCH", "/api/my-cart/1", "", {"quantity": 2})[0], 401)
        self.assertEqual(self._auth_json("DELETE", "/api/my-cart/1", "")[0], 401)
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST", "/api/login", {"email": "jamie@example.com", "password": "secret-pass"}
        )[1]["token"]
        self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})
        self._auth_json("POST", "/api/my-cart", token, {"item_id": 2})

        status, body = self._auth_json("PATCH", "/api/my-cart/1", token, {"quantity": 4})
        self.assertEqual((status, body["message"]), (200, "Road Bike quantity updated to 4."))
        self.assertEqual((body["count"], body["total"]), (5, 8820.95))

        # Above the stock of 4: refused and the cart is unchanged.
        status, body = self._auth_json("PATCH", "/api/my-cart/1", token, {"quantity": 5})
        self.assertEqual((status, body["message"], body["count"]), (409, "You already have the maximum available quantity of Road Bike.", 5))

        for bad in ({"quantity": 0}, {"quantity": "2"}, {}):
            expected = 200 if bad == {} else 400  # quantity defaults to 1
            self.assertEqual(self._auth_json("PATCH", "/api/my-cart/2", token, bad)[0], expected, bad)
        self.assertEqual(self._auth_json("PATCH", "/api/my-cart/99", token, {"quantity": 1})[0], 404)
        self.assertEqual(self._auth_json("PATCH", "/api/my-cart/abc", token, {"quantity": 1})[0], 404)
        self.assertEqual(self._auth_json("GET", "/api/my-cart/1", token)[0], 404)

        status, body = self._auth_json("DELETE", "/api/my-cart/1", token)
        self.assertEqual((status, body["message"]), (200, "Road Bike removed from your cart."))
        self.assertEqual([line["item_id"] for line in body["items"]], [2])
        self.assertEqual((body["count"], body["total"]), (1, 24.95))
        self.assertEqual(self._auth_json("DELETE", "/api/my-cart/1", token)[0], 404)
        self.assertEqual(self._auth_json("GET", "/api/my-cart", token, None)[1]["count"], 1)

    def test_customer_pays_for_selected_cart_items(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.executemany(
                "INSERT INTO item (item_id, name, price) VALUES (?, ?, ?)",
                [(1, "Road Bike", 2199.0), (2, "Brake Pads", 24.95), (3, "Helmet", 79.95)],
            )
            connection.executemany(
                "INSERT INTO inventory (item_id, quantity) VALUES (?, ?)", [(1, 4), (2, 50), (3, 35)]
            )
            connection.commit()
        approved = {"cardholder_name": "Jamie Rivera", "card_number": "4242424242424242", "expiration_date": "12/99", "cvv": "123"}
        self.assertEqual(
            self._auth_json("POST", "/api/my-checkout", "", {"item_ids": [1], **approved})[0], 401
        )
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST", "/api/login", {"email": "jamie@example.com", "password": "secret-pass"}
        )[1]["token"]
        self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})
        self._auth_json("POST", "/api/my-cart", token, {"item_id": 2, "quantity": 2})
        self._auth_json("POST", "/api/my-cart", token, {"item_id": 3})

        status, body = self._auth_json(
            "POST", "/api/my-checkout", token,
            {"item_ids": [1], "cardholder_name": "J", "card_number": "4242", "expiration_date": "13/30", "cvv": "12"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(set(body["errors"]), {"cardholder_name", "card_number", "expiration_date", "cvv"})
        for name in ("", "  ", "4242 Jamie", "-Jamie", None, "x" * 51):
            status, body = self._auth_json(
                "POST", "/api/my-checkout", token, {"item_ids": [1], **approved, "cardholder_name": name}
            )
            self.assertEqual(
                (status, body["errors"]),
                (400, {"cardholder_name": "Enter the name as it appears on the card."}),
                name,
            )
        status, body = self._auth_json(
            "POST", "/api/my-checkout", token, {"item_ids": [1], **approved, "expiration_date": "01/20"}
        )
        self.assertEqual((status, body["errors"]), (400, {"expiration_date": "This card has expired."}))
        for bad_ids in ([], "1", [0], [99]):
            expected = 409 if bad_ids == [99] else 400
            self.assertEqual(
                self._auth_json("POST", "/api/my-checkout", token, {"item_ids": bad_ids, **approved})[0],
                expected,
                bad_ids,
            )

        # A well-formed card the mock gateway declines: no order is created.
        status, body = self._auth_json(
            "POST", "/api/my-checkout", token, {"item_ids": [1, 2], **approved, "card_number": "4000000000000002"}
        )
        self.assertEqual(status, 402)
        self.assertEqual(body["message"], "Payment declined. Check your card details or use a different card.")
        self.assertEqual(self._count("orders"), 1)  # only the fixture order

        status, body = self._auth_json("POST", "/api/my-checkout", token, {"item_ids": [1, 2], **approved})
        self.assertEqual(status, 200)
        self.assertEqual(body["message"], "Payment successful")
        order = body["order"]
        self.assertEqual((order["total"], order["card_last4"]), (2248.9, "4242"))
        # The unselected helmet stays in the cart.
        self.assertEqual([line["item_id"] for line in body["items"]], [3])
        self.assertEqual((body["count"], body["total"]), (1, 79.95))

        with closing(sqlite3.connect(self.database_path)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT item_id, quantity, unit_price FROM order_item WHERE order_id = ? ORDER BY item_id",
                    (order["order_id"],),
                ).fetchall(),
                [(1, 1, 2199.0), (2, 2, 24.95)],
            )
            self.assertEqual(
                connection.execute(
                    "SELECT amount, paymentMethod, statusID FROM payment WHERE order_id = ?",
                    (order["order_id"],),
                ).fetchall(),
                [(2248.9, "Credit Card", 2)],
            )
            self.assertEqual(
                dict(connection.execute("SELECT item_id, quantity FROM inventory").fetchall()),
                {1: 3, 2: 48, 3: 35},
            )
        self.assertEqual(self._auth_json("GET", "/api/my-cart", token)[1]["count"], 1)
        # The dashboard counts the order as paid.
        _, dashboard = self._json("GET", "/api/dashboard")
        paid = {row["order_id"]: row["paid"] for row in dashboard["orders"]}
        self.assertTrue(paid[order["order_id"]])

    def test_concurrent_cart_adds_are_all_kept(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("INSERT INTO item (item_id, name, price) VALUES (1, 'Tune-up', 40.0)")
            connection.commit()
        self._json(
            "POST",
            "/api/signup",
            {
                "first_name": "Jamie",
                "last_name": "Rivera",
                "email": "jamie@example.com",
                "phone": "514-555-0123",
                "address": "12 Rue Sherbrooke O, Montreal",
                "password": "secret-pass",
            },
        )
        token = self._json(
            "POST", "/api/login", {"email": "jamie@example.com", "password": "secret-pass"}
        )[1]["token"]
        self._auth_json("GET", "/api/my-cart", token)  # create the cart row first

        statuses: list[int] = []
        start = threading.Barrier(10)

        def add() -> None:
            start.wait()
            statuses.append(self._auth_json("POST", "/api/my-cart", token, {"item_id": 1})[0])

        # Widen the load→save window so a missing lock reliably loses updates.
        load_cart = ShoppingCartAPI.loadCart

        def slow_load(api: ShoppingCartAPI, customer_id: int):
            cart = load_cart(api, customer_id)
            time.sleep(0.05)
            return cart

        threads = [threading.Thread(target=add) for _ in range(10)]
        with patch.object(ShoppingCartAPI, "loadCart", slow_load):
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        self.assertEqual(statuses, [200] * 10)
        self.assertEqual(self._auth_json("GET", "/api/my-cart", token)[1]["count"], 10)

    def test_edit_order_and_payment_amounts(self) -> None:
        self._add_payment()
        with self._call("PATCH", "/api/orders/101", {"amount": 10.5}) as response:
            self.assertEqual(response.status, 200)
        with self._call("PATCH", "/api/payments/1", {"amount": 7}) as response:
            self.assertEqual(response.status, 200)
        with urlopen(self.base_url + "/api/dashboard") as response:
            payload = json.load(response)
        self.assertEqual(payload["orders"][0]["total_amount"], 10.5)
        self.assertEqual(payload["payments"][0]["amount"], 7)

    def test_edit_rejects_bad_amount_and_missing_records(self) -> None:
        for body in ({"amount": 0}, {"amount": "5"}, {"amount": True}, {}):
            with self._call("PATCH", "/api/orders/101", body) as response:
                self.assertEqual(response.code, 400)
        with self._call("PATCH", "/api/orders/999", {"amount": 5}) as response:
            self.assertEqual(response.code, 404)
        with self._call("PATCH", "/api/orders", {"amount": 5}) as response:
            self.assertEqual(response.code, 404)
        with self._call("PATCH", "/api/orders/101", None) as response:
            self.assertEqual(response.code, 400)

    def test_delete_single_order_removes_its_payments(self) -> None:
        self._add_payment()
        with self._call("DELETE", "/api/orders/101") as response:
            self.assertEqual(response.status, 200)
        self.assertEqual(self._count("orders"), 0)
        self.assertEqual(self._count("payment"), 0)
        with self._call("DELETE", "/api/orders/101") as response:
            self.assertEqual(response.code, 404)

    def test_delete_single_payment_keeps_order(self) -> None:
        self._add_payment()
        with self._call("DELETE", "/api/payments/1") as response:
            self.assertEqual(response.status, 200)
        self.assertEqual(self._count("payment"), 0)
        self.assertEqual(self._count("orders"), 1)

    def test_remove_all_payments_and_orders(self) -> None:
        self._add_payment()
        with self._call("DELETE", "/api/payments") as response:
            self.assertEqual(response.status, 200)
        self.assertEqual((self._count("payment"), self._count("orders")), (0, 1))
        self._add_payment()
        with self._call("DELETE", "/api/orders") as response:
            self.assertEqual(response.status, 200)
        self.assertEqual((self._count("payment"), self._count("orders")), (0, 0))

    def test_unknown_record_routes_are_not_found(self) -> None:
        for method, path in (
            ("DELETE", "/api/items/1"),
            ("DELETE", "/api/orders/abc"),
            ("DELETE", "/api/orders/1/2"),
        ):
            with self._call(method, path) as response:
                self.assertEqual(response.code, 404)

    def _post_payment(self, payload: dict[str, object]):
        request = Request(
            self.base_url + "/api/payments",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            return urlopen(request)
        except HTTPError as error:
            return error

    def _post_login(self, payload: dict[str, object]):
        request = Request(
            self.base_url + "/api/login",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            return urlopen(request)
        except HTTPError as error:
            return error

    def _session_request(self, path: str, token: str, method: str = "GET"):
        request = Request(
            self.base_url + path,
            headers={"Authorization": f"Bearer {token}"} if token else {},
            method=method,
        )
        try:
            return urlopen(request)
        except HTTPError as error:
            return error

    def test_approved_payment_is_processed_without_database_write(self) -> None:
        with self._post_payment(
            {
                "order_id": 101,
                "card_number": "4242424242424242",
                "expiration_date": "12/30",
                "cvv": "123",
            }
        ) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertTrue(payload["payment"]["paid_status"])
        self.assertEqual(payload["payment"]["amount"], 42.5)
        with closing(sqlite3.connect(self.database_path)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM payment").fetchone()[0]
        self.assertEqual(count, 0)

    def test_declined_test_card_is_processed_without_database_write(self) -> None:
        with self._post_payment(
            {
                "order_id": 101,
                "card_number": "4000000000000002",
                "expiration_date": "12/30",
                "cvv": "123",
            }
        ) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertFalse(payload["payment"]["paid_status"])
        self.assertEqual(payload["payment"]["details"], "Payment Failed")
        self.assertIsNone(payload["payment"]["payment_date"])
        with closing(sqlite3.connect(self.database_path)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM payment").fetchone()[0]
        self.assertEqual(count, 0)

    def test_unapproved_card_returns_failed_without_database_write(self) -> None:
        with self._post_payment(
            {
                "order_id": 101,
                "card_number": "not-a-card",
                "expiration_date": "12/30",
                "cvv": "123",
            }
        ) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertFalse(payload["payment"]["paid_status"])
        self.assertEqual(payload["payment"]["details"], "Payment Failed")
        with closing(sqlite3.connect(self.database_path)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM payment").fetchone()[0]
        self.assertEqual(count, 0)

    def test_same_order_can_be_processed_again_without_payment_history(self) -> None:
        payment = {
            "order_id": 101,
            "card_number": "4242424242424242",
            "expiration_date": "12/30",
            "cvv": "123",
        }
        with self._post_payment(payment) as response:
            self.assertEqual(response.status, 200)
        with self._post_payment(payment) as response:
            self.assertEqual(response.status, 200)

        with closing(sqlite3.connect(self.database_path)) as connection:
            count = connection.execute("SELECT COUNT(*) FROM payment").fetchone()[0]
        self.assertEqual(count, 0)

    def test_unrecognized_card_value_returns_failed(self) -> None:
        with self._post_payment(
            {
                "order_id": 101,
                "card_number": 4242424242424242,
                "expiration_date": "12/30",
                "cvv": "123",
            }
        ) as response:
            self.assertEqual(response.status, 200)
            payload = json.load(response)

        self.assertFalse(payload["payment"]["paid_status"])

    def test_wrong_order_id_type_returns_false(self) -> None:
        with self._post_payment(
            {
                "order_id": [],
                "card_number": "4242424242424242",
                "expiration_date": "12/30",
                "cvv": "123",
            }
        ) as response:
            self.assertEqual(response.status, 400)
            payload = json.load(response)

        self.assertFalse(payload["paid"])

    def test_status_reports_missing_database_as_an_error(self) -> None:
        self.database_path.unlink()

        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        with self.assertRaises(HTTPError) as error:
            urlopen(self.api_url)

        self.assertEqual(error.exception.code, 500)
        payload = json.load(error.exception)
        self.assertEqual(payload["status"], "error")
        self.assertTrue(payload["message"])


if __name__ == "__main__":
    unittest.main()
