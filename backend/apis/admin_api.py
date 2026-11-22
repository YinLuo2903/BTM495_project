"""Admin dashboard routes under /api/admin/ for customers and appointments.

Events, inventory, orders and payments already have routes of their own
(/api/events, /api/inventory, /api/dashboard, /api/orders, /api/payments);
these cover what the admin dashboard needs on top of them:

- customers: list (with order and appointment counts) and delete;
- appointments: list, create, update and delete.

Customers, orders and payments come from sign-up and checkout, so the admin
only views and deletes them.
"""

import sqlite3
from pathlib import Path

from backend.utils.constants import DatabaseColumns, DatabaseTables, StatusID
from backend.utils.sqlite import SQLCondition, SQLiteQuery, SQLiteSession
from backend.utils.validators import is_valid_datetime_text

RouteResult = tuple[int, dict[str, object]]

MAX_APPOINTMENT_DESCRIPTION = 500
_STATUS_IDS = {int(status) for status in StatusID}
# Appointment JSON key -> appointment table column (customer_code is resolved to customer_id).
_APPOINTMENT_FIELDS = {
    "customer_code": DatabaseColumns.CUSTOMER_ID,
    "appointment_time": DatabaseColumns.APPOINTMENT_TIME,
    "description": DatabaseColumns.DESCRIPTION,
    "status_id": DatabaseColumns.STATUS_ID,
}

_CUSTOMERS_SQL = (
    "SELECT c.customer_id, c.customer_code, c.first_name, c.last_name, c.email, c.phone, c.address,"
    " (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id),"
    " (SELECT COUNT(*) FROM appointment a WHERE a.customer_id = c.customer_id)"
    " FROM customer c"
)
_APPOINTMENTS_SQL = (
    "SELECT a.appointment_id, a.customer_id, c.customer_code, c.first_name, c.last_name,"
    " a.appointmentTime, a.description, a.statusID"
    " FROM appointment a LEFT JOIN customer c ON c.customer_id = a.customer_id"
)


def _error(status: int, message: str) -> RouteResult:
    return status, {"status": "error", "message": message}


def _id(value: str) -> int | None:
    return int(value) if value.isascii() and value.isdecimal() else None


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def handle_admin_route(
    database_path: str | Path, method: str, rest: list[str], payload: dict
) -> RouteResult:
    database = SQLiteQuery(database_path)
    resource = rest[0] if rest else ""
    record_id = _id(rest[1]) if len(rest) == 2 else None
    if len(rest) > 2 or (len(rest) == 2 and record_id is None):
        return _error(404, "Not found.")
    try:
        if resource == "customers":
            if method == "GET" and len(rest) == 1:
                return 200, {"status": "ok", "customers": _list_customers(database)}
            if method == "DELETE" and record_id is not None:
                return _delete_customer(database, record_id)
        if resource == "appointments":
            if method == "GET" and len(rest) == 1:
                return 200, {"status": "ok", "appointments": _list_appointments(database)}
            if method == "POST" and len(rest) == 1:
                return _save_appointment(database, None, payload)
            if method == "PATCH" and record_id is not None:
                return _save_appointment(database, record_id, payload)
            if method == "DELETE" and record_id is not None:
                return _delete_appointment(database, record_id)
    except sqlite3.IntegrityError:
        return _error(409, "This record is still referenced by other records.")
    return _error(404, "Not found.")


# ---------- customers: view and delete only ----------

def _customer_json(row: tuple) -> dict[str, object]:
    customer_id, code, first, last, email, phone, address, orders, appointments = row
    return {
        "customer_id": customer_id,
        "customer_code": code,
        "first_name": first,
        "last_name": last or "",
        "email": email,
        "phone": phone or "",
        "address": address or "",
        "order_count": orders,
        "appointment_count": appointments,
    }


def _list_customers(database: SQLiteQuery) -> list[dict[str, object]]:
    rows = database.fetch_all(_CUSTOMERS_SQL + " ORDER BY c.customer_id", read_only=True)
    return [_customer_json(row) for row in rows]


def _delete_customer(database: SQLiteQuery, customer_id: int) -> RouteResult:
    with database.transaction(immediate=True) as session:
        rows = session.fetch_all(_CUSTOMERS_SQL + " WHERE c.customer_id = ?", (customer_id,))
        if not rows:
            return _error(404, "Customer not found.")
        customer = _customer_json(rows[0])
        orders, appointments = customer["order_count"], customer["appointment_count"]
        if orders or appointments:
            # Orders and appointments keep their customer for the shop's records.
            held = " and ".join(
                part for part in (
                    _plural(orders, "order") if orders else "",
                    _plural(appointments, "appointment") if appointments else "",
                ) if part
            )
            name = f"{customer['first_name']} {customer['last_name']}".strip()
            return _error(409, f"{name} still has {held}, so the account is kept for the shop's records.")
        # Sessions, the shopping cart and event registrations are removed by ON DELETE CASCADE.
        session.delete(
            DatabaseTables.CUSTOMER,
            where=(SQLCondition(DatabaseColumns.CUSTOMER_ID, customer_id),),
        )
    return 200, {"status": "ok"}


# ---------- appointments: full create, update and delete ----------

def _appointment_json(row: tuple) -> dict[str, object]:
    appointment_id, customer_id, code, first, last, time, description, status_id = row
    return {
        "appointment_id": appointment_id,
        "customer_id": customer_id,
        "customer_code": code,
        "customer_name": f"{first or ''} {last or ''}".strip() or f"Customer #{customer_id}",
        "appointment_time": time,
        "description": description or "",
        "status_id": status_id,
    }


def _list_appointments(database: SQLiteQuery) -> list[dict[str, object]]:
    rows = database.fetch_all(_APPOINTMENTS_SQL + " ORDER BY a.appointmentTime, a.appointment_id", read_only=True)
    return [_appointment_json(row) for row in rows]


def _appointment_values(
    session: SQLiteSession, payload: dict, creating: bool
) -> tuple[dict[str, object] | None, str]:
    unknown = sorted(set(payload) - set(_APPOINTMENT_FIELDS))
    if unknown:
        return None, f"Unknown field: {', '.join(unknown)}."
    if creating:
        missing = [key for key in ("customer_code", "appointment_time", "description") if key not in payload]
        if missing:
            return None, f"Missing field: {', '.join(missing)}."
    values: dict[str, object] = {}
    for key, value in payload.items():
        if key == "customer_code":
            code = value.strip() if isinstance(value, str) else ""
            row = session.fetch_all(
                "SELECT customer_id FROM customer WHERE UPPER(customer_code) = UPPER(?)", (code,)
            )
            if not row:
                return None, f"No customer has the ID {code or '(blank)'}."
            value = row[0][0]
        elif key == "appointment_time":
            if not is_valid_datetime_text(value):
                return None, "Appointment time must look like 2026-11-24 12:00:00."
        elif key == "description":
            text = value.strip() if isinstance(value, str) else ""
            if not 1 <= len(text) <= MAX_APPOINTMENT_DESCRIPTION:
                return None, f"Describe the service in 1 to {MAX_APPOINTMENT_DESCRIPTION} characters."
            value = text
        elif key == "status_id":
            if type(value) is not int or value not in _STATUS_IDS:
                return None, "Status must be 1 (Pending), 2 (Completed) or 3 (Cancelled)."
        values[_APPOINTMENT_FIELDS[key]] = value
    return values, ""


def _save_appointment(
    database: SQLiteQuery, appointment_id: int | None, payload: dict
) -> RouteResult:
    creating = appointment_id is None
    with database.transaction(immediate=True) as session:
        where = (SQLCondition(DatabaseColumns.APPOINTMENT_ID, appointment_id),)
        if not creating and session.select_one(
            DatabaseTables.APPOINTMENT, (DatabaseColumns.APPOINTMENT_ID,), where=where
        ) is None:
            return _error(404, "Appointment not found.")
        values, message = _appointment_values(session, payload, creating)
        if values is None:
            return _error(400, message)
        if creating:
            values.setdefault(DatabaseColumns.STATUS_ID, int(StatusID.PENDING))
            appointment_id = session.insert(DatabaseTables.APPOINTMENT, values).lastrowid
        elif values:
            session.update(DatabaseTables.APPOINTMENT, values, where=where)
        else:
            return _error(400, "No changes to save.")
        row = session.fetch_all(_APPOINTMENTS_SQL + " WHERE a.appointment_id = ?", (appointment_id,))[0]
    return (201 if creating else 200), {"status": "ok", "appointment": _appointment_json(row)}


def _delete_appointment(database: SQLiteQuery, appointment_id: int) -> RouteResult:
    with database.transaction() as session:
        result = session.delete(
            DatabaseTables.APPOINTMENT,
            where=(SQLCondition(DatabaseColumns.APPOINTMENT_ID, appointment_id),),
        )
    if result.rowcount != 1:
        return _error(404, "Appointment not found.")
    return 200, {"status": "ok"}
