import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.load_mockdata import CSV_DIR, IMAGE_DIR, SAMPLE_DATA_VERSION, has_shop_data, load_mockdata, sample_data_version  # noqa: E402
from database.sqlite_database import initialize_database  # noqa: E402


class LoadMockdataTests(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._dir.name) / "test.db"
        self.upload_dir = Path(self._dir.name) / "uploads"
        initialize_database(self.db_path)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def _count(self, table: str) -> int:
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    def test_fresh_database_has_no_shop_data(self) -> None:
        self.assertFalse(has_shop_data(self.db_path))

    def test_load_fills_every_table_from_its_csv(self) -> None:
        counts = load_mockdata(self.db_path, self.upload_dir)
        self.assertTrue(has_shop_data(self.db_path))
        for table, rows in counts.items():
            with self.subTest(table=table):
                csv_rows = len((CSV_DIR / f"{table}.csv").read_text(encoding="utf-8-sig").strip().splitlines()) - 1
                self.assertEqual(rows, csv_rows)
                self.assertEqual(self._count(table), csv_rows)

    def test_loading_twice_does_not_duplicate_rows(self) -> None:
        load_mockdata(self.db_path, self.upload_dir)
        before = self._count("item")
        load_mockdata(self.db_path, self.upload_dir)
        self.assertEqual(self._count("item"), before)

    def test_every_item_photo_exists_and_is_copied_to_uploads(self) -> None:
        load_mockdata(self.db_path, self.upload_dir)
        with sqlite3.connect(self.db_path) as conn:
            paths = [row[0] for row in conn.execute("SELECT image_path FROM item WHERE image_path IS NOT NULL")]
        self.assertGreater(len(paths), 0)
        for path in paths:
            with self.subTest(path=path):
                name = path.removeprefix("/uploads/")
                self.assertTrue((IMAGE_DIR / name).is_file())
                self.assertTrue((self.upload_dir / name).is_file())

    def test_sample_image_paths_pass_the_upload_path_check(self) -> None:
        from backend.utils.validators import is_valid_image_path
        load_mockdata(self.db_path, self.upload_dir)
        with sqlite3.connect(self.db_path) as conn:
            for (path,) in conn.execute("SELECT image_path FROM item"):
                self.assertTrue(is_valid_image_path(path), path)

    def test_demo_customer_has_orders_at_every_pick_up_stage_and_can_sign_in(self) -> None:
        from backend.apis.local_website_api import ensure_local_demo_login
        from backend.apis.profile_api import ManageProfile
        load_mockdata(self.db_path, self.upload_dir)
        ensure_local_demo_login(self.db_path)  # finds the sample account instead of creating one
        self.assertIsNotNone(ManageProfile(self.db_path).login("login@example.com", "1234"))
        with sqlite3.connect(self.db_path) as conn:
            stages = {s for (s,) in conn.execute("SELECT statusID FROM orders WHERE customer_id = 11")}
            self.assertEqual(stages, {1, 2, 3, 4})  # preparing, picked up, cancelled, ready for pick-up
            cancelled_payments = conn.execute(
                "SELECT COUNT(*) FROM payment p JOIN orders o USING (order_id) WHERE o.statusID = 3 AND o.customer_id = 11"
            ).fetchone()[0]
            self.assertEqual(cancelled_payments, 0)

    def test_records_the_sample_data_version(self) -> None:
        self.assertEqual(sample_data_version(self.db_path), 0)
        load_mockdata(self.db_path, self.upload_dir)
        self.assertEqual(sample_data_version(self.db_path), SAMPLE_DATA_VERSION)

    def test_upgrade_adds_new_rows_once_and_keeps_existing_data(self) -> None:
        # An older install: only item 1, with its own stock history and a price an admin changed.
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("INSERT INTO admin (admin_id, name) VALUES (1, 'Admin')")
            conn.execute("INSERT INTO item (item_id, name, price) VALUES (1, 'Mountain Bike', 1.0)")
            conn.execute("INSERT INTO inventory_history (item_id, old_quantity, new_quantity, admin_id, reason, created_at)"
                         " VALUES (1, NULL, 5, 1, 'Mine', '2026-01-01 09:00:00')")
        load_mockdata(self.db_path, self.upload_dir, upgrade=True)
        with sqlite3.connect(self.db_path) as conn:
            self.assertEqual(conn.execute("SELECT price FROM item WHERE item_id = 1").fetchone()[0], 1.0)  # kept
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM item").fetchone()[0], 1)  # new items added
            self.assertEqual(conn.execute("SELECT reason FROM inventory_history WHERE item_id = 1").fetchall(), [("Mine",)])
            self.assertGreater(conn.execute("SELECT COUNT(*) FROM inventory_history WHERE item_id = 2").fetchone()[0], 0)
            conn.execute("DELETE FROM inventory WHERE item_id = 80")
            conn.execute("DELETE FROM item WHERE item_id = 80")  # an admin deletes a sample item
        self.assertEqual(sample_data_version(self.db_path), SAMPLE_DATA_VERSION)  # so start-up won't reload it


if __name__ == "__main__":
    unittest.main()
