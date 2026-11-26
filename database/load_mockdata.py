"""Load the sample CSV data in database/Mockdata into the SQLite database.

The local website calls load_mockdata() on start-up when the shop data is empty
(a fresh clone or a new machine). It can also be run by hand:

    python database/load_mockdata.py
"""
import csv
import shutil
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.sqlite_database import DB_PATH, UPLOAD_DIR, initialize_database  # noqa: E402

CSV_DIR = Path(__file__).parent / "Mockdata"
# Sample item and event photos (credited in frontend/src/views/customer/credits.ts). The CSVs
# refer to them as /uploads/<name>, like pictures an admin uploads, so they are copied there.
IMAGE_DIR = CSV_DIR / "images"

# Parents before children so foreign keys resolve
TABLES = [
    "admin", "customer", "item", "inventory", "inventory_history",
    "event", "event_registration", "appointment",
    "orders", "order_item", "payment",
]

# Tables that only hold shop data from the CSVs (the demo logins add customers and admins).
_SHOP_DATA_TABLES = ("item", "event", "orders", "appointment")


def has_shop_data(db_path: str | Path = DB_PATH) -> bool:
    """True once any item, event, order or appointment exists."""
    with closing(sqlite3.connect(db_path)) as conn:
        return any(
            conn.execute(f"SELECT EXISTS (SELECT 1 FROM {table})").fetchone()[0]
            for table in _SHOP_DATA_TABLES
        )


def copy_sample_images(upload_dir: str | Path = UPLOAD_DIR) -> None:
    """Copy the sample photos into the upload folder (existing files are kept)."""
    upload_dir = Path(upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    for image in IMAGE_DIR.glob("*.webp"):
        if not (upload_dir / image.name).exists():
            shutil.copyfile(image, upload_dir / image.name)


def load_mockdata(db_path: str | Path = DB_PATH, upload_dir: str | Path = UPLOAD_DIR) -> dict[str, int]:
    """Insert every CSV row, skipping rows whose key already exists. Returns rows read per table."""
    # Create the schema and migrate older databases (e.g. the customer name split).
    initialize_database(db_path)
    copy_sample_images(upload_dir)
    counts: dict[str, int] = {}
    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        for table in TABLES:
            with open(CSV_DIR / f"{table}.csv", newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                cols = reader.fieldnames
                # Empty CSV fields become NULL (needed for old_quantity and admin_id)
                rows = [tuple(r[c] if r[c] != "" else None for c in cols) for r in reader]
            sql = f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
            conn.executemany(sql, rows)
            counts[table] = len(rows)
        conn.commit()
    return counts


if __name__ == "__main__":
    for table, count in load_mockdata().items():
        print(f"{table}: {count} rows read")
    print("Done.")
