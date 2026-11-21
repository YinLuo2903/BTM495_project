import sqlite3
import sys
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.apis.profile_api import ManageProfile
from backend.models.customer import Customer, customer_code_for
from database.sqlite_database import initialize_database


class CustomerCodeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "lpvr.db"
        initialize_database(self.database_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _connect(self) -> sqlite3.Connection:
        return closing(sqlite3.connect(self.database_path))

    def test_code_format(self) -> None:
        self.assertEqual(customer_code_for(1), "LPVR001")
        self.assertEqual(customer_code_for(42), "LPVR042")
        self.assertEqual(customer_code_for(999), "LPVR999")
        self.assertEqual(customer_code_for(1000), "LPVR1000")

    def test_new_customers_get_sequential_codes_starting_at_lpvr001(self) -> None:
        profile = ManageProfile(self.database_path)
        first = profile.createAccount(
            Customer(first_name="Ada", last_name="Lovelace", email="ada@example.com"),
            "password1",
        )
        second = profile.createAccount(
            Customer(first_name="Alan", last_name="Turing", email="alan@example.com"),
            "password2",
        )
        self.assertEqual(first.customerCode, "LPVR001")
        self.assertEqual(second.customerCode, "LPVR002")
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT customer_code, first_name, last_name FROM customer "
                "ORDER BY customer_id"
            ).fetchall()
        self.assertEqual(
            rows, [("LPVR001", "Ada", "Lovelace"), ("LPVR002", "Alan", "Turing")]
        )
        loaded = profile.getProfile(second.customerID)
        self.assertEqual(
            (loaded.customerCode, loaded.first_name, loaded.last_name, loaded.name),
            ("LPVR002", "Alan", "Turing", "Alan Turing"),
        )
        self.assertIsNone(profile.getProfile(999))

    def test_code_cannot_be_set_to_a_value_that_does_not_match_the_id(self) -> None:
        with self._connect() as connection:
            connection.execute("INSERT INTO customer (first_name) VALUES ('Ada')")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "UPDATE customer SET customer_code = 'LPVR777' WHERE customer_id = 1"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO customer (customer_id, customer_code, first_name) "
                    "VALUES (5, 'LPVR001', 'Bad')"
                )

    def test_old_single_name_table_is_migrated_and_links_are_kept(self) -> None:
        old_path = Path(self.temp_dir.name) / "old.db"
        with closing(sqlite3.connect(old_path)) as connection:
            connection.executescript(
                """
                CREATE TABLE customer (
                    customer_id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE,
                    phone TEXT,
                    address TEXT,
                    password_hash TEXT
                );
                INSERT INTO customer VALUES
                    (1, 'Emily Roy', 'emily@example.com', '514', '12 Rue', 'h1'),
                    (7, 'Cher', 'cher@example.com', NULL, NULL, NULL),
                    (12, 'Mary Jane Watson', NULL, NULL, NULL, NULL);
                CREATE TABLE orders (
                    order_id INTEGER PRIMARY KEY,
                    customer_id INTEGER,
                    FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
                );
                INSERT INTO orders VALUES (100, 7);
                """
            )
            connection.commit()

        initialize_database(old_path)
        initialize_database(old_path)  # second run must be a no-op

        with closing(sqlite3.connect(old_path)) as connection:
            columns = [row[1] for row in connection.execute("PRAGMA table_info(customer)")]
            rows = connection.execute(
                "SELECT customer_id, customer_code, first_name, last_name, email, "
                "phone, address, password_hash FROM customer ORDER BY customer_id"
            ).fetchall()
            joined = connection.execute(
                "SELECT customer.customer_code FROM orders JOIN customer USING (customer_id)"
            ).fetchone()
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            connection.execute("INSERT INTO customer (first_name) VALUES ('New')")
            new_code = connection.execute(
                "SELECT customer_code FROM customer WHERE first_name = 'New'"
            ).fetchone()[0]

        self.assertNotIn("name", columns)
        self.assertEqual(
            rows,
            [
                (1, "LPVR001", "Emily", "Roy", "emily@example.com", "514", "12 Rue", "h1"),
                (7, "LPVR007", "Cher", "", "cher@example.com", None, None, None),
                (12, "LPVR012", "Mary", "Jane Watson", None, None, None, None),
            ],
        )
        self.assertEqual(joined, ("LPVR007",))
        self.assertEqual(new_code, "LPVR013")


if __name__ == "__main__":
    unittest.main()
