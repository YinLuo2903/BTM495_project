"""Dry-run website routes for inventory and event registration.

These routes only translate HTTP into calls on InventoryList and
EventRegistrationAPI, so the GUI exercises the same code the app uses.
"""

import sqlite3
from pathlib import Path

from backend.apis.admin_api import handle_admin_route
from backend.apis.event_registration_api import EventRegistrationAPI
from backend.apis.inventory_list_api import InventoryList, Item
from backend.utils.constants import DatabaseColumns, DatabaseTables, StatusID
from backend.utils.response import Response
from backend.utils.sqlite import SQLCondition, SQLiteQuery, SQLOrder
from backend.utils.validators import is_valid_datetime_text, is_valid_image_path

# JSON key -> InventoryList keyword.
_ITEM_KEYS = {
    "name": "name",
    "description": "description",
    "price": "price",
    "category": "category",
    "brand": "brand",
    "stock_quantity": "stockQuantity",
    "admin_id": "adminId",
    "reason": "reason",
    "image_path": "imagePath",
}

# Event JSON key -> event table column. Only name and participant_limit are required.
_EVENT_FIELDS = {
    "name": DatabaseColumns.NAME,
    "description": DatabaseColumns.DESCRIPTION,
    "location": DatabaseColumns.LOCATION,
    "event_date_time": DatabaseColumns.EVENT_DATE_TIME,
    "participant_limit": DatabaseColumns.PARTICIPANT_LIMIT,
    "status_id": DatabaseColumns.STATUS_ID,
    "image_path": DatabaseColumns.IMAGE_PATH,
}
_STATUS_IDS = {int(status) for status in StatusID}

RouteResult = tuple[int, dict[str, object]]


def _parts(path: str) -> list[str]:
    parts = path.strip("/").split("/")
    return parts[1:] if parts[:1] == ["api"] else [""]


def is_extra_route(path: str) -> bool:
    return _parts(path)[:1] in (["inventory"], ["events"], ["event-registrations"], ["admin"])


def handle_route(
    database_path: str | Path, method: str, path: str, payload: dict | None
) -> RouteResult:
    parts = _parts(path)
    payload = payload or {}
    try:
        if parts[0] == "inventory":
            return _inventory(InventoryList(database_path), method, parts[1:], payload)
        if parts[0] == "events":
            return _events(database_path, method, parts[1:], payload)
        if parts[0] == "admin":
            return handle_admin_route(database_path, method, parts[1:], payload)
        return _registrations(
            EventRegistrationAPI(database_path), method, parts[1:], payload
        )
    except sqlite3.Error:
        return _error(500, "Database error.")


def _id(value: str) -> int | None:
    return int(value) if value.isascii() and value.isdecimal() else None


def _error(status: int, message: str) -> RouteResult:
    return status, {"status": "error", "message": message}


def _result(response: Response, created: bool = False) -> RouteResult:
    if response.success:
        data = response.data
        return (201 if created else 200), {
            "status": "ok",
            "message": response.msg,
            "data": _item_json(data) if isinstance(data, Item) else data,
        }
    status = 404 if "not found" in response.msg.lower() else 400
    return _error(status, response.msg)


def _item_json(item: Item) -> dict[str, object]:
    return {
        "item_id": item.itemId,
        "name": item.name,
        "description": item.description,
        "price": item.price,
        "category": item.category,
        "brand": item.brand,
        "stock_quantity": item.stockQuantity,
        "image_path": item.imagePath,
    }


def _inventory(
    inventory: InventoryList, method: str, rest: list[str], payload: dict
) -> RouteResult:
    item_id = _id(rest[0]) if rest else None
    if method == "GET" and not rest:
        items = inventory.listItems().data
        return 200, {"status": "ok", "items": [_item_json(i) for i in items]}
    if method == "GET" and len(rest) == 2 and rest[1] == "history" and item_id:
        if not inventory.findItem(item_id).success:
            return _error(404, "Item not found.")
        return 200, {"status": "ok", "history": inventory.listHistory(item_id).data}
    if method == "POST" and not rest:
        unknown = sorted(set(payload) - set(_ITEM_KEYS) - {"item_id"})
        if unknown:
            return _error(400, f"Unknown field: {', '.join(unknown)}.")
        # Without item_id the next free ID is assigned.
        part = Item(
            payload.get("item_id"),
            payload.get("name"),
            payload.get("description", ""),
            payload.get("price"),
            payload.get("category", ""),
            payload.get("brand", ""),
            payload.get("stock_quantity"),
            payload.get("image_path"),
        )
        return _result(
            inventory.addItem(part, payload.get("admin_id"), payload.get("reason")),
            created=True,
        )
    if method == "PATCH" and len(rest) == 1 and item_id:
        unknown = sorted(set(payload) - set(_ITEM_KEYS))
        if unknown:
            return _error(400, f"Unknown field: {', '.join(unknown)}.")
        changes = {_ITEM_KEYS[key]: value for key, value in payload.items()}
        return _result(inventory.updateItem(item_id, **changes))
    if method == "DELETE" and len(rest) == 1 and item_id:
        return _result(inventory.removeItem(item_id))
    return _error(404, "Not found.")


def _events(
    database_path: str | Path, method: str, rest: list[str], payload: dict
) -> RouteResult:
    database = SQLiteQuery(database_path)
    registrations = EventRegistrationAPI(database_path)
    if method == "GET" and not rest:
        with database.session(read_only=True) as session:
            events = session.select(
                DatabaseTables.EVENT,
                (
                    DatabaseColumns.EVENT_ID,
                    DatabaseColumns.NAME,
                    DatabaseColumns.PARTICIPANT_LIMIT,
                    DatabaseColumns.DESCRIPTION,
                    DatabaseColumns.LOCATION,
                    DatabaseColumns.EVENT_DATE_TIME,
                    DatabaseColumns.STATUS_ID,
                    DatabaseColumns.IMAGE_PATH,
                ),
                order_by=(SQLOrder(DatabaseColumns.EVENT_ID),),
            )
            customers = session.select(
                DatabaseTables.CUSTOMER,
                (
                    DatabaseColumns.CUSTOMER_ID,
                    DatabaseColumns.FIRST_NAME,
                    DatabaseColumns.LAST_NAME,
                ),
                order_by=(SQLOrder(DatabaseColumns.CUSTOMER_ID),),
            )
        return 200, {
            "status": "ok",
            "events": [
                {
                    "event_id": event_id,
                    "name": name,
                    "participant_limit": limit,
                    "description": description,
                    "location": location,
                    "event_date_time": event_date_time,
                    "status_id": status_id,
                    "image_path": image_path,
                    "customer_ids": registrations.listRegistrations(event_id).data,
                }
                for (
                    event_id,
                    name,
                    limit,
                    description,
                    location,
                    event_date_time,
                    status_id,
                    image_path,
                ) in events
            ],
            "customers": [
                {
                    "customer_id": customer_id,
                    "name": f"{first_name} {last_name or ''}".strip(),
                }
                for customer_id, first_name, last_name in customers
            ],
        }
    if method == "POST" and not rest:
        for required in ("name", "participant_limit"):
            payload.setdefault(required, None)
        values, message = _event_values(payload)
        if values is None:
            return _error(400, message)
        values.setdefault(DatabaseColumns.STATUS_ID, int(StatusID.PENDING))
        with database.transaction() as session:
            result = session.insert(DatabaseTables.EVENT, values)
        return 201, {"status": "ok", "event_id": result.lastrowid}
    if method == "PATCH" and len(rest) == 1 and _id(rest[0]) is not None:
        event_id = _id(rest[0])
        values, message = _event_values(payload)
        if values is None:
            return _error(400, message)
        if not values:
            return _error(400, "No changes to save.")
        where = (SQLCondition(DatabaseColumns.EVENT_ID, event_id),)
        with database.transaction(immediate=True) as session:
            if session.select_one(DatabaseTables.EVENT, (DatabaseColumns.EVENT_ID,), where=where) is None:
                return _error(404, "Event not found.")
            limit = values.get(DatabaseColumns.PARTICIPANT_LIMIT)
            if limit is not None:
                registered = len(
                    session.select(
                        DatabaseTables.EVENT_REGISTRATION, (DatabaseColumns.CUSTOMER_ID,), where=where
                    )
                )
                if limit < registered:
                    return _error(
                        400,
                        f"The limit can't be lower than the {registered} people already registered.",
                    )
            session.update(DatabaseTables.EVENT, values, where=where)
        return 200, {"status": "ok", "event_id": event_id}
    if method == "DELETE" and len(rest) == 1 and _id(rest[0]) is not None:
        with database.transaction() as session:
            result = session.delete(
                DatabaseTables.EVENT,
                where=(SQLCondition(DatabaseColumns.EVENT_ID, _id(rest[0])),),
            )
        if result.rowcount != 1:
            return _error(404, "Event not found.")
        return 200, {"status": "ok"}
    return _error(404, "Not found.")


def _event_values(payload: dict) -> tuple[dict[str, object] | None, str]:
    """Validate event JSON fields into column values; (None, message) when invalid."""
    unknown = sorted(set(payload) - set(_EVENT_FIELDS))
    if unknown:
        return None, f"Unknown field: {', '.join(unknown)}."
    values: dict[str, object] = {}
    for key, value in payload.items():
        if key == "name":
            if not isinstance(value, str) or not value.strip():
                return None, "Event name is required."
            value = value.strip()
        elif key in ("description", "location"):
            if value is not None and not isinstance(value, str):
                return None, f"Event {key} must be text."
            value = (value or "").strip() or None
        elif key == "event_date_time":
            if value is not None and not is_valid_datetime_text(value):
                return None, "Event date must look like 2026-11-27 09:00:00."
        elif key == "participant_limit":
            if type(value) is not int or value < 0:
                return None, "Participant limit must be a whole number."
        elif key == "status_id":
            if type(value) is not int or value not in _STATUS_IDS:
                return None, "Status must be 1 (Pending), 2 (Completed) or 3 (Cancelled)."
        elif key == "image_path" and not is_valid_image_path(value):
            return None, "Upload the image before saving the event."
        values[_EVENT_FIELDS[key]] = value
    return values, ""


def _registrations(
    registrations: EventRegistrationAPI, method: str, rest: list[str], payload: dict
) -> RouteResult:
    if method == "POST" and not rest:
        event_id, customer_id = payload.get("event_id"), payload.get("customer_id")
        if type(event_id) is not int or type(customer_id) is not int:
            return _error(400, "event_id and customer_id must be whole numbers.")
        return _result(registrations.register(event_id, customer_id), created=True)
    if method == "DELETE" and len(rest) == 2:
        event_id, customer_id = _id(rest[0]), _id(rest[1])
        if event_id is None or customer_id is None:
            return _error(404, "Not found.")
        return _result(registrations.unregister(event_id, customer_id))
    return _error(404, "Not found.")
