import csv
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.sqlite_database import initialize_database  # noqa: E402

BASE = Path(__file__).parent
DB_PATH = BASE / "lpvr.db"
CSV_DIR = BASE / "Mockdata"

# Parents before children so foreign keys resolve
TABLES = [
    "admin", "customer", "item", "inventory", "inventory_history",
    "event", "event_registration", "appointment",
    "orders", "order_item", "payment",
]

# Create the schema and migrate older databases (e.g. the customer name split).
initialize_database(DB_PATH)

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA foreign_keys = ON")

for table in TABLES:
    with open(CSV_DIR / f"{table}.csv", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        # Empty CSV fields become NULL (needed for old_quantity and admin_id)
        rows = [tuple(r[c] if r[c] != "" else None for c in cols) for r in reader]
    sql = f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
    conn.executemany(sql, rows)
    print(f"{table}: {len(rows)} rows read")

conn.commit()
conn.close()
print("Done.")