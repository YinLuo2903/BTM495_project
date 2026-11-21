import sqlite3
import sys
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.apis.profile_api import ManageProfile
from backend.apis.session_api import SESSION_LIFETIME_SECONDS, SessionManager
from backend.models.customer import Customer
from database.sqlite_database import initialize_database


class SessionManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.database_path = Path(self.temp_dir.name) / "test.db"
        initialize_database(self.database_path)
        self.customer = ManageProfile(self.database_path).createAccount(
            Customer(first_name="Test", last_name="Tester", email="test@example.com"), "password1"
        )
        self.sessions = SessionManager(self.database_path)

    def test_expiry_boundary_and_revocation(self) -> None:
        with patch("backend.apis.session_api.time.time", return_value=1000):
            first = self.sessions.create(self.customer)
            second = self.sessions.create(self.customer)
            self.assertNotEqual(first.token, second.token)
            self.assertEqual(first.expires_at, 1000 + SESSION_LIFETIME_SECONDS)
            self.assertEqual(self.sessions.get_user(first.token), {"name": "Test Tester", "is_admin": False})
            self.assertTrue(self.sessions.revoke(first.token))
            self.assertFalse(self.sessions.revoke(first.token))
            self.assertIsNone(self.sessions.get_user(first.token))
        with patch("backend.apis.session_api.time.time", return_value=second.expires_at - 1):
            self.assertIsNotNone(self.sessions.get_user(second.token))
        with patch("backend.apis.session_api.time.time", return_value=second.expires_at):
            self.assertIsNone(self.sessions.get_user(second.token))

    def test_invalid_tokens_and_unsaved_user(self) -> None:
        for token in ("", "é" * 43, "a" * 42, "a" * 44):
            self.assertIsNone(self.sessions.get_user(token))
            self.assertFalse(self.sessions.revoke(token))
        with self.assertRaises(ValueError):
            self.sessions.create(Customer(first_name="Unsaved", last_name="Tester", email="unsaved@example.com"))

    def test_deleted_customer_cascades_and_schema_upgrade_is_idempotent(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("DROP TABLE user_session")
        initialize_database(self.database_path)
        created = self.sessions.create(self.customer)
        initialize_database(self.database_path)
        initialize_database(self.database_path)
        self.assertIsNotNone(self.sessions.get_user(created.token))
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("DELETE FROM customer WHERE customer_id = ?", (self.customer.customerID,))
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM user_session").fetchone()[0], 0)
            connection.commit()
        self.assertIsNone(self.sessions.get_user(created.token))

    def test_session_requires_exactly_one_valid_owner(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            for admin_id, customer_id in ((None, None), (999, None), (999, self.customer.customerID)):
                with self.subTest(admin_id=admin_id, customer_id=customer_id):
                    with self.assertRaises(sqlite3.IntegrityError):
                        connection.execute(
                            "INSERT INTO user_session VALUES (?, ?, ?, ?, ?)",
                            ("hash", admin_id, customer_id, 0, 1),
                        )
