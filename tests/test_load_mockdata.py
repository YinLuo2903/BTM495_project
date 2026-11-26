import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.load_mockdata import CSV_DIR, IMAGE_DIR, has_shop_data, load_mockdata  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
