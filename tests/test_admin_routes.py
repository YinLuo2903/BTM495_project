import sqlite3
import sys
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.apis.local_website_extra_api import handle_route
from database.sqlite_database import initialize_database

IMAGE = "/uploads/" + "a" * 32 + ".png"


class AdminRouteTests(unittest.TestCase):
    """Routes behind the admin dashboard, called the way the HTTP server calls them."""

    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.db = Path(self.temp_dir.name) / "admin.db"
        initialize_database(self.db)
        with closing(sqlite3.connect(self.db)) as connection:
            connection.executescript(
                """
                INSERT INTO customer (customer_id, first_name, last_name, email) VALUES
                    (1, 'Emily', 'Roy', 'emily@example.com'),
                    (2, 'Liam', 'Bouchard', 'liam@example.com');
                INSERT INTO orders (order_id, customer_id, orderDateTime, totalAmount, statusID)
                    VALUES (10, 1, '2026-11-03 15:30:00', 144.93, 2);
                INSERT INTO appointment (appointment_id, customer_id, appointmentTime, description, statusID)
                    VALUES (5, 1, '2026-11-17 10:30:00', 'Winter bike prep', 1);
                INSERT INTO event (event_id, name, participantLimit, statusID) VALUES (3, 'Ride', 10, 1);
                INSERT INTO event_registration (event_id, customer_id) VALUES (3, 1), (3, 2);
                INSERT INTO shopping_cart (customer_id, items_json) VALUES (2, '[]');
                """
            )
            connection.commit()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def call(self, method: str, path: str, payload: dict | None = None):
        return handle_route(self.db, method, path, payload)

    def scalar(self, sql: str, *params: object):
        with closing(sqlite3.connect(self.db)) as connection:
            return connection.execute(sql, params).fetchone()[0]

    # ---------- customers: view and delete only ----------

    def test_lists_customers_with_order_and_appointment_counts(self) -> None:
        status, body = self.call("GET", "/api/admin/customers")
        self.assertEqual(status, 200)
        emily, liam = body["customers"]
        self.assertEqual((emily["customer_code"], emily["order_count"], emily["appointment_count"]), ("LPVR001", 1, 1))
        self.assertEqual((liam["customer_code"], liam["order_count"], liam["appointment_count"]), ("LPVR002", 0, 0))

    def test_customers_carry_their_sign_up_time(self) -> None:
        _, body = self.call("GET", "/api/admin/customers")
        self.assertRegex(body["customers"][0]["created_at"], r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")

    def test_lists_every_stock_change_oldest_first(self) -> None:
        with closing(sqlite3.connect(self.db)) as connection:
            connection.executescript(
                """
                INSERT INTO item (item_id, name, price) VALUES (7, 'Pump', 49);
                INSERT INTO inventory_history (item_id, old_quantity, new_quantity, admin_id, reason, created_at)
                    VALUES (7, 10, 8, 1, 'Sale', '2026-11-02 10:00:00'), (7, NULL, 10, 1, 'Opening', '2026-06-01 09:00:00');
                """
            )
            connection.commit()
        status, body = self.call("GET", "/api/admin/inventory-history")
        self.assertEqual(status, 200)
        self.assertEqual([(h["old_quantity"], h["new_quantity"]) for h in body["history"]], [(None, 10), (10, 8)])

    def test_keeps_a_customer_who_has_orders_or_appointments(self) -> None:
        status, body = self.call("DELETE", "/api/admin/customers/1")
        self.assertEqual(status, 409)
        self.assertEqual(body["message"], "Emily Roy still has 1 order and 1 appointment, so the account is kept for the shop's records.")
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM customer WHERE customer_id = 1"), 1)

    def test_deletes_a_customer_with_their_cart_and_registrations(self) -> None:
        self.assertEqual(self.call("DELETE", "/api/admin/customers/2")[0], 200)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM customer WHERE customer_id = 2"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM shopping_cart WHERE customer_id = 2"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM event_registration WHERE customer_id = 2"), 0)
        self.assertEqual(self.call("DELETE", "/api/admin/customers/2")[0], 404)

    def test_customers_cannot_be_created_or_edited(self) -> None:
        self.assertEqual(self.call("POST", "/api/admin/customers", {"first_name": "X"})[0], 404)
        self.assertEqual(self.call("PATCH", "/api/admin/customers/1", {"first_name": "X"})[0], 404)

    # ---------- appointments: create, update, delete ----------

    def test_creates_updates_and_deletes_an_appointment(self) -> None:
        status, body = self.call("POST", "/api/admin/appointments", {
            "customer_code": "lpvr002", "appointment_time": "2026-11-24 12:00:00", "description": " Tune-up ",
        })
        self.assertEqual(status, 201)
        created = body["appointment"]
        self.assertEqual(
            {key: created[key] for key in ("customer_code", "customer_name", "appointment_time", "description", "status_id")},
            {"customer_code": "LPVR002", "customer_name": "Liam Bouchard", "appointment_time": "2026-11-24 12:00:00",
             "description": "Tune-up", "status_id": 1},
        )
        path = f"/api/admin/appointments/{created['appointment_id']}"
        status, body = self.call("PATCH", path, {"status_id": 2, "appointment_time": "2026-11-25 09:30:00"})
        self.assertEqual(status, 200)
        self.assertEqual((body["appointment"]["status_id"], body["appointment"]["appointment_time"]), (2, "2026-11-25 09:30:00"))

        listed = self.call("GET", "/api/admin/appointments")[1]["appointments"]
        self.assertEqual([row["appointment_id"] for row in listed], [5, created["appointment_id"]])

        self.assertEqual(self.call("DELETE", path)[0], 200)
        self.assertEqual(self.call("DELETE", path)[0], 404)

    def test_rejects_invalid_appointment_details(self) -> None:
        cases = [
            ({"customer_code": "LPVR999", "appointment_time": "2026-11-24 12:00:00", "description": "Fix"}, "No customer has the ID LPVR999."),
            ({"customer_code": "LPVR001", "appointment_time": "2026-11-24T12:00", "description": "Fix"}, "Appointment time must look like 2026-11-24 12:00:00."),
            ({"customer_code": "LPVR001", "appointment_time": "2026-02-30 12:00:00", "description": "Fix"}, "Appointment time must look like 2026-11-24 12:00:00."),
            ({"customer_code": "LPVR001", "appointment_time": "2026-11-24 12:00:00", "description": "  "}, "Describe the service in 1 to 500 characters."),
            ({"customer_code": "LPVR001", "appointment_time": "2026-11-24 12:00:00", "description": "Fix", "status_id": 9}, "Status must be 1 (Pending), 2 (Completed) or 3 (Cancelled)."),
            ({"customer_code": "LPVR001"}, "Missing field: appointment_time, description."),
            ({"customer_code": "LPVR001", "appointment_time": "2026-11-24 12:00:00", "description": "Fix", "price": 1}, "Unknown field: price."),
        ]
        for payload, message in cases:
            with self.subTest(message=message):
                status, body = self.call("POST", "/api/admin/appointments", payload)
                self.assertEqual((status, body["message"]), (400, message))
        self.assertEqual(self.call("PATCH", "/api/admin/appointments/99", {"status_id": 2})[0], 404)
        self.assertEqual(self.call("PATCH", "/api/admin/appointments/5", {})[1]["message"], "No changes to save.")

    # ---------- events: full details, edit, image ----------

    def test_creates_an_event_with_every_detail(self) -> None:
        status, body = self.call("POST", "/api/events", {
            "name": " Family Bike Day ", "participant_limit": 35, "event_date_time": "2026-12-05 10:00:00",
            "location": "Parc La Fontaine", "description": "Games", "status_id": 1, "image_path": IMAGE,
        })
        self.assertEqual(status, 201)
        event = next(e for e in self.call("GET", "/api/events")[1]["events"] if e["event_id"] == body["event_id"])
        self.assertEqual(
            {key: event[key] for key in ("name", "participant_limit", "event_date_time", "location", "description", "status_id", "image_path")},
            {"name": "Family Bike Day", "participant_limit": 35, "event_date_time": "2026-12-05 10:00:00",
             "location": "Parc La Fontaine", "description": "Games", "status_id": 1, "image_path": IMAGE},
        )

    def test_edits_an_event_but_not_below_its_registrations(self) -> None:
        self.assertEqual(self.call("PATCH", "/api/events/3", {"name": "Fall Ride", "location": "", "image_path": IMAGE})[0], 200)
        event = self.call("GET", "/api/events")[1]["events"][0]
        self.assertEqual((event["name"], event["location"], event["image_path"]), ("Fall Ride", None, IMAGE))
        status, body = self.call("PATCH", "/api/events/3", {"participant_limit": 1})
        self.assertEqual((status, body["message"]), (400, "The limit can't be lower than the 2 people already registered."))
        self.assertEqual(self.call("PATCH", "/api/events/3", {"image_path": None})[0], 200)
        self.assertIsNone(self.call("GET", "/api/events")[1]["events"][0]["image_path"])
        self.assertEqual(self.call("PATCH", "/api/events/99", {"name": "X"})[0], 404)

    def test_rejects_invalid_event_details(self) -> None:
        cases = [
            ({"name": "Ride", "participant_limit": 5, "image_path": "https://example.com/x.png"}, "Upload the image before saving the event."),
            ({"name": "Ride", "participant_limit": 5, "event_date_time": "tomorrow"}, "Event date must look like 2026-11-27 09:00:00."),
            ({"name": "Ride", "participant_limit": 5, "status_id": 0}, "Status must be 1 (Pending), 2 (Completed) or 3 (Cancelled)."),
            ({"participant_limit": 5}, "Event name is required."),
            ({"name": "Ride"}, "Participant limit must be a whole number."),
        ]
        for payload, message in cases:
            with self.subTest(message=message):
                status, body = self.call("POST", "/api/events", payload)
                self.assertEqual((status, body["message"]), (400, message))

    # ---------- inventory: image and automatic item ID ----------

    def test_adds_an_item_with_an_image_and_the_next_free_id(self) -> None:
        handle_route(self.db, "POST", "/api/inventory", {"item_id": 7, "name": "Pump", "price": 49})
        status, body = self.call("POST", "/api/inventory", {"name": "Helmet", "price": 79.95, "stock_quantity": 5, "image_path": IMAGE})
        self.assertEqual(status, 201)
        self.assertEqual((body["data"]["item_id"], body["data"]["image_path"]), (8, IMAGE))
        self.assertEqual(self.call("PATCH", "/api/inventory/8", {"image_path": None})[0], 200)
        items = {item["item_id"]: item for item in self.call("GET", "/api/inventory")[1]["items"]}
        self.assertIsNone(items[8]["image_path"])
        self.assertEqual(self.call("PATCH", "/api/inventory/8", {"image_path": "/etc/passwd"})[0], 400)


class ImageColumnMigrationTests(unittest.TestCase):
    def test_adds_image_columns_to_an_older_database(self) -> None:
        with TemporaryDirectory() as folder:
            db = Path(folder) / "old.db"
            with closing(sqlite3.connect(db)) as connection:
                connection.executescript(
                    """
                    CREATE TABLE item (item_id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT,
                        price REAL, category TEXT, brand TEXT);
                    INSERT INTO item (item_id, name, price) VALUES (1, 'Chain', 5);
                    """
                )
            initialize_database(db)
            initialize_database(db)  # running again changes nothing
            with closing(sqlite3.connect(db)) as connection:
                for table in ("item", "event"):
                    columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
                    self.assertEqual(columns[-1], "image_path")
                self.assertEqual(connection.execute("SELECT name, image_path FROM item").fetchall(), [("Chain", None)])


if __name__ == "__main__":
    unittest.main()
