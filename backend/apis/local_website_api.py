import logging
import os
import re
import socket
import sqlite3
import threading
import time
import calendar
import hmac
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from backend.apis.appointment_booking_api import AppointmentBookingAPI
from backend.apis.event_registration_api import EventRegistrationAPI
from backend.apis.inventory_list_api import InventoryList
from backend.apis.order_api import OrderService
from backend.apis.shopping_cart_api import ShoppingCartAPI
from backend.apis.local_website_extra_api import handle_route, is_extra_route
from backend.apis.profile_api import ManageProfile
from backend.models.customer import Customer
from backend.apis.session_api import SessionManager
from backend.models.payment import Payment, PaymentGateway, PaymentMethod, PaymentStatus
from backend.utils.constants import DatabaseColumns, DatabaseTables, DatabaseValues
from backend.utils.http import HTTPRequestError, read_json_object, send_json
from backend.utils.logger import (
    configure_backend_logging,
    get_logger,
    http_status_label,
)
from backend.utils.sqlite import (
    SQLComparison,
    SQLiteQuery,
    SQLiteSession,
    SQLCondition,
    SQLOrder,
    SQLSortDirection,
)
from backend.utils.validators import (
    is_valid_card_number,
    is_valid_cvv,
    is_valid_expiration_date,
    string_value,
)
from database.sqlite_database import DB_PATH, UPLOAD_DIR

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_DIR / "dist"
FRONTEND_PAGES = {
    "/", "/views/index.html", "/view/index.html",
    *(f"/views/customer/{page}.html" for page in (
        "index", "items", "item", "events", "appointments", "cart",
        "checkout", "orders", "profile", "login", "signup", "credits",
    )),
    *(f"/views/admin/{page}.html" for page in (
        "index", "customers", "events", "appointments", "orders", "payments",
        "inventory", "items",  # items.html is kept as an alias of inventory.html
    )),
}
# Images uploaded from the admin dashboard; served at /uploads/<name>.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
# Content type -> (file extension, check on the first bytes so the type can't be faked).
_IMAGE_TYPES = {
    "image/jpeg": ("jpg", lambda head: head.startswith(b"\xff\xd8\xff")),
    "image/png": ("png", lambda head: head.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": ("webp", lambda head: head[:4] == b"RIFF" and head[8:12] == b"WEBP"),
}
SHUTDOWN_KEY_HEADER = "X-Shutdown-Key"
LOCAL_DEMO_LOGIN_EMAIL = "login@example.com"
LOCAL_DEMO_LOGIN_PASSWORD = "1234"
# Matches database/Mockdata/admin.csv.
LOCAL_ADMIN_LOGIN_EMAIL = "admin@lpvr.com"
LOCAL_ADMIN_LOGIN_PASSWORD = "123456789"
logger = get_logger(__name__)


def _database() -> SQLiteQuery:
    return SQLiteQuery(DB_PATH)


def _ensure_login(
    database_path: str | Path,
    table: str,
    email: str,
    password: str,
    values: dict[str, object],
    label: str,
) -> None:
    """Create a fixed local account unless it already signs in with its password."""
    profile = ManageProfile(database_path)
    if profile.login(email, password) is not None:
        return

    with SQLiteQuery(database_path).transaction(immediate=True) as session:
        for role_table in (DatabaseTables.ADMIN, DatabaseTables.CUSTOMER):
            existing = session.select_one(
                role_table,
                (DatabaseColumns.EMAIL,),
                where=(SQLCondition(DatabaseColumns.EMAIL, email),),
            )
            if existing is not None:
                raise RuntimeError(
                    f"Cannot create the {label} because {email} is already in use."
                )

        # Store the password hashed, the same way createAccount does.
        session.insert(
            table,
            {
                **values,
                DatabaseColumns.EMAIL: email,
                DatabaseColumns.PASSWORD_HASH: profile._hashPassword(password),
            },
        )


def ensure_local_demo_login(database_path: str | Path = DB_PATH) -> None:
    # Keep the short smoke-test password hashed without weakening account policy.
    _ensure_login(
        database_path,
        DatabaseTables.CUSTOMER,
        LOCAL_DEMO_LOGIN_EMAIL,
        LOCAL_DEMO_LOGIN_PASSWORD,
        {DatabaseColumns.FIRST_NAME: "Local", DatabaseColumns.LAST_NAME: "Dry-Run"},
        "local demo login",
    )


def ensure_local_admin_login(database_path: str | Path = DB_PATH) -> None:
    """Make sure the shop admin (admin@lpvr.com) exists so it can open the dashboard."""
    _ensure_login(
        database_path,
        DatabaseTables.ADMIN,
        LOCAL_ADMIN_LOGIN_EMAIL,
        LOCAL_ADMIN_LOGIN_PASSWORD,
        {
            DatabaseColumns.NAME: "Admin",
            DatabaseColumns.PHONE: "514-123-4567",
            DatabaseColumns.ADDRESS: "7141 Rue Sherbrooke O PS 145, Montréal, QC H4B 2B9",
        },
        "local admin login",
    )


def _get_table_status(database: SQLiteSession) -> list[dict[str, object]]:
    tables = database.list_tables()
    table_status = []
    for table_name in tables:
        table_status.append(
            {"name": table_name, "rows": database.count(table_name)}
        )
    return table_status


def get_database_status() -> dict[str, object]:
    database = _database()
    with database.session(read_only=True) as session:
        tables = _get_table_status(session)

    return {
        "status": "ok",
        "database": DB_PATH.name,
        "tables": tables,
    }


def get_dashboard_data() -> dict[str, object]:
    database = _database()
    with database.session(read_only=True) as session:
        table_status = _get_table_status(session)
        paid_order_ids = {
            order_id
            for (order_id,) in session.select(
                DatabaseTables.PAYMENT,
                (DatabaseColumns.ORDER_ID,),
                where=(
                    SQLCondition(
                        DatabaseColumns.PAYMENT_STATUS_ID,
                        DatabaseValues.PAYMENT_STATUS_ID_PAID,
                    ),
                ),
            )
        }
        customer_names = {
            customer_id: f"{first_name} {last_name or ''}".strip()
            for customer_id, first_name, last_name in session.select(
                DatabaseTables.CUSTOMER,
                (
                    DatabaseColumns.CUSTOMER_ID,
                    DatabaseColumns.FIRST_NAME,
                    DatabaseColumns.LAST_NAME,
                ),
            )
        }
        orders = [
            {
                "order_id": order_id,
                "order_date": order_date,
                "total_amount": total_amount,
                "paid": order_id in paid_order_ids,
                "customer_id": customer_id,
                "customer_name": customer_names.get(customer_id, ""),
                "status_id": status_id,
            }
            for order_id, order_date, total_amount, customer_id, status_id in session.select(
                DatabaseTables.ORDERS,
                (
                    DatabaseColumns.ORDER_ID,
                    DatabaseColumns.ORDER_DATE_TIME,
                    DatabaseColumns.TOTAL_AMOUNT,
                    DatabaseColumns.CUSTOMER_ID,
                    DatabaseColumns.STATUS_ID,
                ),
                order_by=(
                    SQLOrder(
                        DatabaseColumns.ORDER_ID,
                        SQLSortDirection.DESCENDING,
                    ),
                ),
            )
        ]
        order_customers = {order["order_id"]: order["customer_name"] for order in orders}
        payments = [
            {
                "payment_id": payment_id,
                "order_id": order_id,
                "payment_date": payment_date,
                "amount": amount,
                "payment_method": payment_method,
                "paid_status": (
                    payment_status_id == DatabaseValues.PAYMENT_STATUS_ID_PAID
                ),
                "status_id": payment_status_id,
                "customer_name": order_customers.get(order_id, ""),
            }
            for (
                payment_id,
                order_id,
                payment_date,
                amount,
                payment_method,
                payment_status_id,
            ) in session.select(
                DatabaseTables.PAYMENT,
                (
                    DatabaseColumns.PAYMENT_ID,
                    DatabaseColumns.ORDER_ID,
                    DatabaseColumns.PAYMENT_DATE_TIME,
                    DatabaseColumns.AMOUNT,
                    DatabaseColumns.PAYMENT_METHOD,
                    DatabaseColumns.PAYMENT_STATUS_ID,
                ),
                order_by=(
                    SQLOrder(
                        DatabaseColumns.PAYMENT_ID,
                        SQLSortDirection.DESCENDING,
                    ),
                ),
            )
        ]

    return {
        "status": "ok",
        "database": DB_PATH.name,
        "tables": table_status,
        "orders": orders,
        "payments": payments,
    }


class LocalTestRequestHandler(SimpleHTTPRequestHandler):
    MAX_REQUEST_BYTES = 8192
    # mimetypes may not know .webp on every Python/OS combination.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webp": "image/webp"}
    DEMO_CUSTOMER_EMAIL = "local-payment-demo@example.invalid"
    DEMO_ORDER_AMOUNT = 50.00

    def __init__(self, *args: object, **kwargs: object) -> None:
        self._request_started = time.perf_counter()
        self._request_logged = False
        self._response_status = 500
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def translate_path(self, path: str) -> str:
        request_path = urlsplit(path).path
        if request_path in FRONTEND_PAGES:
            return str(FRONTEND_BUILD_DIR / "index.html")
        if request_path.startswith("/assets/"):
            candidate = (FRONTEND_BUILD_DIR / request_path.lstrip("/")).resolve()
            if candidate.is_relative_to(FRONTEND_BUILD_DIR.resolve()) and candidate.is_file():
                return str(candidate)
        if request_path.startswith("/uploads/"):
            # Only files inside the upload folder; anything else is a 404.
            candidate = (UPLOAD_DIR / request_path[len("/uploads/"):]).resolve()
            if candidate.parent == UPLOAD_DIR.resolve() and candidate.is_file():
                return str(candidate)
            return str(UPLOAD_DIR / "missing")
        if request_path in (
            "/local_website.css",
            "/view/local_website.css",
            "/views/local_website.css",
        ):
            path = "/css/style.css"
        return super().translate_path(path)

    def send_response(self, code: int, message: str | None = None) -> None:
        self._response_status = code
        super().send_response(code, message)

    def finish(self) -> None:
        try:
            super().finish()
        finally:
            if not self._request_logged:
                self._request_logged = True
                request_method = getattr(self, "command", "UNKNOWN")
                request_path = urlsplit(getattr(self, "path", "/")).path
                duration_ms = (time.perf_counter() - self._request_started) * 1000
                if self._response_status >= 500:
                    log_level = logging.ERROR
                elif self._response_status >= 400:
                    log_level = logging.WARNING
                else:
                    log_level = logging.INFO
                logger.log(
                    log_level,
                    "HTTP %s %s -> %s in %.2f ms",
                    request_method,
                    request_path,
                    http_status_label(self._response_status),
                    duration_ms,
                )

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        return

    def _extra_route(self, method: str) -> bool:
        """Serve inventory/event routes; return False when the path is not one."""
        request_path = urlsplit(self.path).path
        if not is_extra_route(request_path):
            return False
        payload = None
        if method in ("POST", "PATCH"):
            try:
                payload = read_json_object(
                    self, self.MAX_REQUEST_BYTES, request_name="Request"
                )
            except HTTPRequestError as error:
                self._send_json(
                    {"status": "error", "message": str(error)}, error.status_code
                )
                return True
        status_code, response = handle_route(DB_PATH, method, request_path, payload)
        self._send_json(response, status_code)
        return True

    def do_GET(self) -> None:
        if urlsplit(self.path).path in FRONTEND_PAGES and not (FRONTEND_BUILD_DIR / "index.html").is_file():
            self.send_error(503, "Frontend build missing; run npm ci and npm run build in frontend.")
            return
        if (
            self._extra_route("GET")
            or self._my_events("GET")
            or self._appointments("GET")
            or self._my_cart("GET")
        ):
            return
        request_path = urlsplit(self.path).path
        if request_path == "/api/session":
            self._get_session()
            return
        if request_path == "/api/profile":
            self._get_profile()
            return
        if request_path == "/api/status":
            self._send_database_status()
            return
        if request_path == "/api/dashboard":
            self._send_dashboard_data()
            return
        super().do_GET()

    def do_DELETE(self) -> None:
        if self._extra_route("DELETE") or self._my_events("DELETE") or self._my_cart("DELETE"):
            return
        resource, record_id = self._record_route()
        if resource is None:
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return
        self._modify_records(resource, record_id, None)

    def do_PATCH(self) -> None:
        if self._extra_route("PATCH") or self._my_cart("PATCH"):
            return
        if urlsplit(self.path).path == "/api/profile":
            self._update_profile()
            return
        resource, record_id = self._record_route()
        if resource is None or record_id is None:
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return
        try:
            payload = read_json_object(
                self,
                self.MAX_REQUEST_BYTES,
                request_name=resource.title(),
            )
        except HTTPRequestError as error:
            self._send_json({"status": "error", "message": str(error)}, error.status_code)
            return
        amount = payload.get("amount")
        if type(amount) not in (int, float) or not 0 < amount < 1_000_000_000:
            self._send_json(
                {"status": "error", "message": "Amount must be a positive number."},
                400,
            )
            return
        self._modify_records(resource, record_id, round(float(amount), 2))

    def _record_route(self) -> tuple[str | None, int | None]:
        parts = urlsplit(self.path).path.strip("/").split("/")
        if len(parts) not in (2, 3) or parts[0] != "api" or parts[1] not in (
            "orders",
            "payments",
        ):
            return None, None
        if len(parts) == 2:
            return parts[1], None
        if not parts[2].isascii() or not parts[2].isdecimal():
            return None, None
        return parts[1], int(parts[2])

    def _modify_records(
        self,
        resource: str,
        record_id: int | None,
        amount: float | None,
    ) -> None:
        """Delete (amount is None) or update one record, or delete all when no ID."""
        is_order = resource == "orders"
        table = DatabaseTables.ORDERS if is_order else DatabaseTables.PAYMENT
        id_column = DatabaseColumns.ORDER_ID if is_order else DatabaseColumns.PAYMENT_ID
        amount_column = (
            DatabaseColumns.TOTAL_AMOUNT if is_order else DatabaseColumns.AMOUNT
        )
        try:
            with _database().transaction() as session:
                if record_id is None:
                    where = (
                        SQLCondition(
                            id_column, 0, SQLComparison.GREATER_THAN_OR_EQUAL
                        ),
                    )
                else:
                    where = (SQLCondition(id_column, record_id),)

                if amount is not None:
                    result = session.update(
                        table, {amount_column: amount}, where=where
                    )
                else:
                    if is_order:
                        session.delete(DatabaseTables.PAYMENT, where=where)
                        session.delete(DatabaseTables.ORDER_ITEM, where=where)
                    result = session.delete(table, where=where)
                changed = record_id is None or result.rowcount == 1
        except sqlite3.Error:
            logger.exception("Could not modify %s", resource)
            self._send_json(
                {"status": "error", "message": f"Could not modify {resource}."},
                500,
            )
            return

        if not changed:
            self._send_json(
                {"status": "error", "message": "Record was not found."}, 404
            )
            return
        self._send_json({"status": "ok"}, 200)

    def do_POST(self) -> None:
        if urlsplit(self.path).path == "/api/shutdown":
            self._shutdown()
            return
        if (
            self._extra_route("POST")
            or self._my_events("POST")
            or self._appointments("POST")
            or self._my_cart("POST")
            or self._my_checkout("POST")
        ):
            return
        request_path = urlsplit(self.path).path
        if request_path == "/api/sample-orders":
            self._create_sample_order()
            return
        if request_path == "/api/login":
            self._login()
            return
        if request_path == "/api/logout":
            self._logout()
            return
        if request_path == "/api/signup":
            self._signup()
            return
        if request_path == "/api/uploads":
            self._upload_image()
            return
        if request_path != "/api/payments":
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return

        try:
            payload = read_json_object(
                self,
                self.MAX_REQUEST_BYTES,
                request_name="Payment",
            )
        except HTTPRequestError as error:
            logger.warning("Payment input rejected: %s", error)
            self._send_json({"status": "error", "message": str(error)}, error.status_code)
            return

        order_id = payload.get("order_id")
        if not (
            type(order_id) is int
            or (isinstance(order_id, str) and order_id.isdecimal())
        ):
            logger.warning("Payment input rejected: invalid order ID type")
            self._send_json(
                {"status": "error", "paid": False, "message": "Invalid order ID."},
                400,
            )
            return

        try:
            order = _database().select_one(
                DatabaseTables.ORDERS,
                (DatabaseColumns.TOTAL_AMOUNT,),
                where=(SQLCondition(DatabaseColumns.ORDER_ID, order_id),),
            )
        except sqlite3.Error:
            logger.exception("Could not look up order for payment")
            self._send_json(
                {"status": "error", "message": "Could not process payment request."},
                500,
            )
            return

        if order is None:
            self._send_json(
                {"status": "error", "message": "Order was not found."},
                404,
            )
            return

        payment = Payment(
            None,
            order_id,
            order[0],
            PaymentMethod.CREDIT_CARD.value,
        )
        payment.processPayment(
            string_value(payload, "card_number"),
            string_value(payload, "expiration_date"),
            string_value(payload, "cvv"),
        )

        self._send_json(
            {
                "status": "ok",
                "payment": {
                    "order_id": order_id,
                    "payment_date": (
                        payment.paymentDate.isoformat(timespec="seconds")
                        if payment.paymentDate
                        else None
                    ),
                    "amount": payment.amount,
                    "payment_method": payment.paymentMethod,
                    "paid_status": payment.paidStatus == PaymentStatus.PAID,
                    "details": payment.details,
                },
            },
            200,
        )

    def _login(self) -> None:
        try:
            payload = read_json_object(
                self,
                self.MAX_REQUEST_BYTES,
                request_name="Login",
            )
        except HTTPRequestError as error:
            logger.warning("Login input rejected: %s", error)
            self._send_json(
                {"status": "error", "message": str(error)},
                error.status_code,
            )
            return

        email = string_value(payload, "email")
        password = string_value(payload, "password")

        try:
            user = ManageProfile(DB_PATH).login(email, password)
        except sqlite3.Error as error:
            logger.exception("Could not process profile login: %s", error)
            self._send_json(
                {"status": "error", "message": "Could not process login."},
                500,
            )
            return

        if user is None:
            logger.warning("Login output: rejected credentials")
            self._send_json(
                {"status": "error", "message": "Email or password is incorrect."},
                401,
            )
            return

        try:
            session = SessionManager(DB_PATH).create(user)
        except sqlite3.Error:
            logger.exception("Could not create login session")
            self._send_json(
                {"status": "error", "message": "Could not process login."},
                500,
            )
            return

        self._send_json(
            {
                "status": "ok",
                "user": {
                    "name": user.name,
                    "is_admin": user.isAdmin,
                },
                "token": session.token,
                "expires_at": session.expires_at,
            },
            200,
        )
        logger.info(
            "Login output: successful authentication (role=%s)",
            "admin" if user.isAdmin else "customer",
        )

    def _bearer_token(self) -> str:
        authorization = self.headers.get("Authorization", "")
        scheme, separator, token = authorization.partition(" ")
        if not separator or scheme.lower() != "bearer":
            return ""
        return token

    def _get_session(self) -> None:
        try:
            user = SessionManager(DB_PATH).get_user(self._bearer_token())
        except sqlite3.Error:
            logger.exception("Could not validate session")
            self._send_json(
                {"status": "error", "message": "Could not validate session."}, 500
            )
            return
        if user is None:
            self._send_json(
                {"status": "error", "message": "Invalid or expired session."}, 401
            )
            return
        self._send_json({"status": "ok", "user": user}, 200)

    def _logout(self) -> None:
        try:
            revoked = SessionManager(DB_PATH).revoke(self._bearer_token())
        except sqlite3.Error:
            logger.exception("Could not revoke session")
            self._send_json({"status": "error", "message": "Could not log out."}, 500)
            return
        if not revoked:
            self._send_json({"status": "error", "message": "Invalid session."}, 401)
            return
        self._send_json({"status": "ok"}, 200)

    @staticmethod
    def _profile_json(customer: Customer) -> dict[str, object]:
        return {
            "customer_code": customer.customerCode,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "email": customer.email,
            "phone": customer.phone,
            "address": customer.address,
        }

    def _signup(self) -> None:
        try:
            payload = read_json_object(
                self, self.MAX_REQUEST_BYTES, request_name="Signup"
            )
        except HTTPRequestError as error:
            self._send_json(
                {"status": "error", "message": str(error)}, error.status_code
            )
            return

        customer = Customer(
            first_name=string_value(payload, "first_name").strip(),
            last_name=string_value(payload, "last_name").strip(),
            email=string_value(payload, "email").strip(),
            phone=string_value(payload, "phone").strip(),
            address=string_value(payload, "address").strip(),
        )
        for label, value in (
            ("Phone number", customer.phone),
            ("Home address", customer.address),
        ):
            if not value:
                self._send_json(
                    {"status": "error", "message": f"{label} is required."}, 400
                )
                return
        try:
            ManageProfile(DB_PATH).createAccount(
                customer, string_value(payload, "password")
            )
        except ValueError as error:
            self._send_json({"status": "error", "message": str(error)}, 400)
            return
        except sqlite3.IntegrityError:
            self._send_json(
                {
                    "status": "error",
                    "message": "An account with this email already exists.",
                },
                409,
            )
            return
        except sqlite3.Error:
            logger.exception("Could not create customer account")
            self._send_json(
                {"status": "error", "message": "Could not create the account."}, 500
            )
            return

        logger.info("Signup output: created customer %s", customer.customerCode)
        self._send_json(
            {"status": "ok", "customer": self._profile_json(customer)}, 201
        )

    def _session_customer(self) -> Customer | None:
        """Return the signed-in customer, or send an error response and return None."""
        try:
            customer_id = SessionManager(DB_PATH).get_customer_id(self._bearer_token())
            customer = (
                None
                if customer_id is None
                else ManageProfile(DB_PATH).getProfile(customer_id)
            )
        except sqlite3.Error:
            logger.exception("Could not load customer profile")
            self._send_json(
                {"status": "error", "message": "Could not load the profile."}, 500
            )
            return None
        if customer is None:
            self._send_json(
                {
                    "status": "error",
                    "message": "Sign in with a customer account to view your profile.",
                },
                401,
            )
        return customer

    def _session_customer_id(self, signed_out_message: str) -> int | None:
        """ID of the signed-in customer, or send an error response and return None."""
        try:
            customer_id = SessionManager(DB_PATH).get_customer_id(self._bearer_token())
        except sqlite3.Error:
            logger.exception("Could not validate session")
            self._send_json(
                {"status": "error", "message": "Could not validate session."}, 500
            )
            return None
        if customer_id is None:
            self._send_json({"status": "error", "message": signed_out_message}, 401)
        return customer_id

    def _appointments(self, method: str) -> bool:
        """Serve appointment booking; return False when the path is not one of its routes.

        GET /api/appointments/availability?month=YYYY-MM is public. POST
        /api/my-appointments books for the signed-in customer, taken from the
        session token, never from the request body.
        """
        request = urlsplit(self.path)
        if request.path == "/api/appointments/availability" and method == "GET":
            month = parse_qs(request.query).get("month", [""])[0]
            match = re.fullmatch(r"(\d{4})-(\d{2})", month)
            if not match:
                self._send_json(
                    {"status": "error", "message": "month must look like YYYY-MM."}, 400
                )
                return True
            try:
                result = AppointmentBookingAPI(DB_PATH).monthAvailability(
                    int(match[1]), int(match[2])
                )
            except sqlite3.Error:
                logger.exception("Could not load appointment availability")
                self._send_json({"status": "error", "message": "Database error."}, 500)
                return True
            if result.success:
                self._send_json({"status": "ok", **result.data}, 200)
            else:
                self._send_json({"status": "error", "message": result.msg}, 400)
            return True

        if request.path != "/api/my-appointments":
            return False
        if method != "POST":
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return True
        customer_id = self._session_customer_id(
            "Sign in with a customer account to book an appointment."
        )
        if customer_id is None:
            return True
        try:
            payload = read_json_object(
                self, self.MAX_REQUEST_BYTES, request_name="Appointment"
            )
        except HTTPRequestError as error:
            self._send_json(
                {"status": "error", "message": str(error)}, error.status_code
            )
            return True
        try:
            result = AppointmentBookingAPI(DB_PATH).book(
                customer_id,
                payload.get("date"),
                payload.get("time"),
                payload.get("repair_type"),
                payload.get("description"),
            )
        except sqlite3.Error:
            logger.exception("Could not book appointment")
            self._send_json({"status": "error", "message": "Database error."}, 500)
            return True
        if result.success:
            logger.info("Appointment booked for customer %s", customer_id)
            self._send_json({"status": "ok", "appointment": result.data}, 201)
        else:
            # 409 tells the page the slot was taken meanwhile, so it can refresh times.
            conflict = isinstance(result.data, dict) and result.data.get("conflict") is True
            status = 409 if conflict else 400
            self._send_json({"status": "error", "message": result.msg}, status)
        return True

    MAX_CART_ADD_QUANTITY = 99
    # ShoppingCartAPI loads and saves a cart in separate transactions, and the server
    # handles requests on parallel threads; serialize cart updates so two concurrent
    # adds (e.g. from two tabs) cannot both read the old cart and lose one update.
    _CART_LOCK = threading.Lock()

    @staticmethod
    def _cart_summary(cart) -> dict[str, object]:
        """Cart lines for the shopping cart page, the total, and the nav badge count."""
        items = [
            {
                "item_id": item_id,
                "name": cart_item.item.name,
                "category": cart_item.item.category,
                # Price saved when the item was added (ShoppingCartAPI stores it).
                "price": cart_item.item.getPrice(),
                "quantity": cart_item.quantity,
                "subtotal": round(cart_item.getSubtotal(), 2),
                "stock_quantity": cart_item.item.stockQuantity,
            }
            for item_id, cart_item in cart.items.items()
        ]
        return {
            "items": items,
            "count": sum(entry["quantity"] for entry in items),
            "total": round(cart.calculateTotal(), 2),
        }

    def _cart_error(self, message: str, status: int, cart=None) -> bool:
        body: dict[str, object] = {"status": "error", "message": message}
        if cart is not None:
            body.update(self._cart_summary(cart))
        self._send_json(body, status)
        return True

    def _my_cart(self, method: str) -> bool:
        """Serve the signed-in customer's cart; return False for any other path.

        GET    /api/my-cart              cart summary
        POST   /api/my-cart              {item_id, quantity?} add to the cart
        PATCH  /api/my-cart/<item_id>    {quantity} set a line's quantity
        DELETE /api/my-cart/<item_id>    remove a line
        Quantities can never exceed the item's stock.
        """
        parts = urlsplit(self.path).path.split("/")
        if parts[:3] != ["", "api", "my-cart"] or len(parts) > 4:
            return False
        line_id: int | None = None
        if len(parts) == 4:
            line_id = int(parts[3]) if parts[3].isdigit() and int(parts[3]) > 0 else None
            if line_id is None or method not in ("PATCH", "DELETE"):
                return self._cart_error("Not found.", 404)
        elif method not in ("GET", "POST"):
            return self._cart_error("Not found.", 404)
        customer_id = self._session_customer_id(
            "Sign in with a customer account to use your cart."
        )
        if customer_id is None:
            return True

        payload: dict = {}
        if method in ("POST", "PATCH"):
            try:
                payload = read_json_object(self, self.MAX_REQUEST_BYTES, request_name="Cart")
            except HTTPRequestError as error:
                return self._cart_error(str(error), error.status_code)
        item_id = line_id if line_id is not None else payload.get("item_id")
        quantity = payload.get("quantity", 1)
        if method == "POST" and (type(item_id) is not int or item_id <= 0):
            return self._cart_error("item_id must be a positive whole number.", 400)
        if method in ("POST", "PATCH") and (
            type(quantity) is not int or not 1 <= quantity <= self.MAX_CART_ADD_QUANTITY
        ):
            return self._cart_error(
                f"quantity must be a whole number from 1 to {self.MAX_CART_ADD_QUANTITY}.", 400
            )

        try:
            with self._CART_LOCK:
                carts = ShoppingCartAPI(DB_PATH)
                cart = carts.loadCart(customer_id)
                if method == "GET":
                    self._send_json({"status": "ok", **self._cart_summary(cart)}, 200)
                    return True
                if method in ("PATCH", "DELETE"):
                    if item_id not in cart.items:
                        return self._cart_error("That item is not in your cart.", 404, cart)
                    item = cart.items[item_id].item  # loaded with current stock
                    in_cart = cart.items[item_id].quantity
                    result = (
                        carts.removeItem(cart, item_id)
                        if method == "DELETE"
                        else carts.updateQuantity(cart, item_id, quantity)
                    )
                else:
                    found = InventoryList(DB_PATH).findItem(item_id)
                    if not found.success:
                        return self._cart_error("Item not found.", 404)
                    item = found.data
                    in_cart = cart.items[item_id].quantity if item_id in cart.items else 0
                    result = carts.addItem(cart, item, quantity)
        except (sqlite3.Error, ValueError, RuntimeError):
            logger.exception("Could not update cart for customer %s", customer_id)
            return self._cart_error("Could not update your cart.", 500)

        if not result.success:
            stock = item.stockQuantity
            if stock is not None and stock <= 0:
                message = f"{item.name} is out of stock."
            elif stock is not None and method == "PATCH":
                # The shopping cart does not reveal remaining stock.
                message = f"You already have the maximum available quantity of {item.name}."
            elif stock is not None:
                message = f"Your cart already has {in_cart} of {item.name}; only {stock} in stock."
            else:
                message = result.msg
            # 409: the request conflicts with current stock, not a malformed request.
            return self._cart_error(message, 409, cart)

        message = {
            "POST": f"{item.name} added to your cart.",
            "PATCH": f"{item.name} quantity updated to {quantity}.",
            "DELETE": f"{item.name} removed from your cart.",
        }[method]
        logger.info("Customer %s cart %s item %s", customer_id, method, item_id)
        self._send_json(
            {"status": "ok", "message": message, "item_id": item_id, **self._cart_summary(cart)},
            200,
        )
        return True

    MAX_CHECKOUT_LINES = 100

    @staticmethod
    def card_errors(
        cardholder_name: object,
        card_number: object,
        expiration: object,
        cvv: object,
        today: date | None = None,
    ) -> dict[str, str]:
        """Format problems with mock credit-card details, keyed by field; empty when all are valid."""
        errors: dict[str, str] = {}
        name = cardholder_name.strip() if isinstance(cardholder_name, str) else ""
        # 2-50 letters (any language), spaces, hyphens, apostrophes and periods,
        # starting with a letter; matches isValidCardholderName() in the frontend.
        if not (
            2 <= len(name) <= 50
            and name[0].isalpha()
            and all(char.isalpha() or char in " '.-" for char in name)
        ):
            errors["cardholder_name"] = "Enter the name as it appears on the card."
        if not is_valid_card_number(card_number):
            errors["card_number"] = "Enter the 16-digit card number."
        if not is_valid_expiration_date(expiration):
            errors["expiration_date"] = "Enter the expiry date as MM/YY."
        else:
            month, year = map(int, str(expiration).split("/"))
            last_day = date(2000 + year, month, calendar.monthrange(2000 + year, month)[1])
            if last_day < (today or date.today()):
                errors["expiration_date"] = "This card has expired."
        if not is_valid_cvv(cvv):
            errors["cvv"] = "Enter the 3-digit CVC."
        return errors

    def _my_checkout(self, method: str) -> bool:
        """POST /api/my-checkout {item_ids, cardholder_name, card_number, expiration_date, cvv}.

        Pays for the selected cart lines with the mock card gateway. The card is
        approved before anything is written, so a declined card creates no order;
        an approved one creates the order, takes the stock, records the payment
        and leaves unselected lines in the cart. Card details are never logged.
        """
        if urlsplit(self.path).path != "/api/my-checkout":
            return False
        if method != "POST":
            return self._cart_error("Not found.", 404)
        customer_id = self._session_customer_id(
            "Sign in with a customer account to check out."
        )
        if customer_id is None:
            return True
        try:
            payload = read_json_object(self, self.MAX_REQUEST_BYTES, request_name="Checkout")
        except HTTPRequestError as error:
            return self._cart_error(str(error), error.status_code)

        item_ids = payload.get("item_ids")
        if (
            not isinstance(item_ids, list)
            or not 1 <= len(item_ids) <= self.MAX_CHECKOUT_LINES
            or any(type(item_id) is not int or item_id <= 0 for item_id in item_ids)
        ):
            return self._cart_error("Select at least one item to check out.", 400)
        card_number = payload.get("card_number")
        expiration = payload.get("expiration_date")
        cvv = payload.get("cvv")
        errors = self.card_errors(payload.get("cardholder_name"), card_number, expiration, cvv)
        if errors:
            self._send_json(
                {"status": "error", "message": "Check your card details.", "errors": errors}, 400
            )
            return True
        if not PaymentGateway().validatePayment(card_number, expiration, cvv):
            logger.info("Mock card declined for customer %s", customer_id)
            return self._cart_error(
                "Payment declined. Check your card details or use a different card.", 402
            )

        try:
            with self._CART_LOCK:
                cart = ShoppingCartAPI(DB_PATH).loadCart(customer_id)
                result = OrderService(DB_PATH).checkoutSelected(
                    cart, customer_id, item_ids, PaymentMethod.CREDIT_CARD.value
                )
        except (sqlite3.Error, ValueError, RuntimeError):
            logger.exception("Checkout failed for customer %s", customer_id)
            return self._cart_error("Could not complete your order. You have not been charged.", 500)
        if not result.success:
            return self._cart_error(result.msg, 409, cart)
        order = result.data
        logger.info("Customer %s paid order %s", customer_id, order["order_id"])
        self._send_json(
            {
                "status": "ok",
                "message": "Payment successful",
                "order": {**order, "card_last4": card_number[-4:]},
                **self._cart_summary(cart),
            },
            200,
        )
        return True

    def _my_events(self, method: str) -> bool:
        """Serve the signed-in customer's event registrations.

        GET /api/my-events lists registered event IDs; POST and DELETE
        /api/my-events/<event_id> register and unregister. The customer comes
        from the session token, never from the request body. Returns False when
        the path is not one of these routes.
        """
        parts = urlsplit(self.path).path.strip("/").split("/")
        if parts[:2] != ["api", "my-events"]:
            return False
        rest = parts[2:]
        event_id = (
            int(rest[0])
            if len(rest) == 1 and rest[0].isascii() and rest[0].isdecimal()
            else None
        )
        if not (
            (method == "GET" and not rest)
            or (method in ("POST", "DELETE") and event_id is not None)
        ):
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return True
        customer_id = self._session_customer_id(
            "Sign in with a customer account to register for events."
        )
        if customer_id is None:
            return True
        try:
            registrations = EventRegistrationAPI(DB_PATH)
            if method == "GET":
                result = registrations.listCustomerEvents(customer_id)
                self._send_json({"status": "ok", "event_ids": result.data}, 200)
                return True
            result = (
                registrations.register(event_id, customer_id)
                if method == "POST"
                else registrations.unregister(event_id, customer_id)
            )
        except sqlite3.Error:
            logger.exception("Could not update event registration")
            self._send_json({"status": "error", "message": "Database error."}, 500)
            return True
        if result.success:
            self._send_json(
                {"status": "ok", "message": result.msg},
                201 if method == "POST" else 200,
            )
        else:
            status = 404 if "not found" in result.msg.lower() else 400
            self._send_json({"status": "error", "message": result.msg}, status)
        return True

    def _get_profile(self) -> None:
        customer = self._session_customer()
        if customer is not None:
            self._send_json(
                {"status": "ok", "customer": self._profile_json(customer)}, 200
            )

    def _update_profile(self) -> None:
        customer = self._session_customer()
        if customer is None:
            return
        try:
            payload = read_json_object(
                self, self.MAX_REQUEST_BYTES, request_name="Profile"
            )
        except HTTPRequestError as error:
            self._send_json(
                {"status": "error", "message": str(error)}, error.status_code
            )
            return
        editable = {"first_name", "last_name", "email", "phone", "address"}
        unknown = sorted(set(payload) - editable)
        if unknown:
            self._send_json(
                {"status": "error", "message": f"Unknown field: {', '.join(unknown)}."},
                400,
            )
            return
        for field in editable & set(payload):
            if not isinstance(payload[field], str):
                self._send_json(
                    {"status": "error", "message": f"{field} must be text."}, 400
                )
                return
            if field in ("phone", "address") and not payload[field].strip():
                label = "Phone number" if field == "phone" else "Home address"
                self._send_json(
                    {"status": "error", "message": f"{label} is required."}, 400
                )
                return
            setattr(customer, field, payload[field].strip())
        try:
            ManageProfile(DB_PATH).updateProfile(customer)
        except ValueError as error:
            self._send_json({"status": "error", "message": str(error)}, 400)
            return
        except sqlite3.IntegrityError:
            self._send_json(
                {
                    "status": "error",
                    "message": "An account with this email already exists.",
                },
                409,
            )
            return
        except sqlite3.Error:
            logger.exception("Could not update customer profile")
            self._send_json(
                {"status": "error", "message": "Could not save the profile."}, 500
            )
            return
        self._send_json(
            {"status": "ok", "customer": self._profile_json(customer)}, 200
        )

    def _create_sample_order(self) -> None:
        try:
            with _database().transaction() as connection:
                customer = connection.select_one(
                    DatabaseTables.CUSTOMER,
                    (DatabaseColumns.CUSTOMER_ID,),
                    where=(
                        SQLCondition(
                            DatabaseColumns.EMAIL,
                            self.DEMO_CUSTOMER_EMAIL,
                        ),
                    ),
                )
                if customer is None:
                    result = connection.insert(
                        DatabaseTables.CUSTOMER,
                        {
                            DatabaseColumns.FIRST_NAME: "Local Payment",
                            DatabaseColumns.LAST_NAME: "Demo",
                            DatabaseColumns.EMAIL: self.DEMO_CUSTOMER_EMAIL,
                        },
                    )
                    customer_id = result.lastrowid
                else:
                    customer_id = customer[0]

                customer_orders = connection.select(
                    DatabaseTables.ORDERS,
                    (
                        DatabaseColumns.ORDER_ID,
                        DatabaseColumns.ORDER_DATE_TIME,
                        DatabaseColumns.TOTAL_AMOUNT,
                    ),
                    where=(
                        SQLCondition(DatabaseColumns.CUSTOMER_ID, customer_id),
                    ),
                    order_by=(
                        SQLOrder(
                            DatabaseColumns.ORDER_ID,
                            SQLSortDirection.DESCENDING,
                        ),
                    ),
                )
                paid_order_ids = {
                    order_id
                    for (order_id,) in connection.select(
                        DatabaseTables.PAYMENT,
                        (DatabaseColumns.ORDER_ID,),
                        where=(
                            SQLCondition(
                                DatabaseColumns.PAYMENT_STATUS_ID,
                                DatabaseValues.PAYMENT_STATUS_ID_PAID,
                            ),
                        ),
                    )
                }
                order = next(
                    (
                        candidate
                        for candidate in customer_orders
                        if candidate[0] not in paid_order_ids
                    ),
                    None,
                )

                if order is None:
                    order_date = datetime.now().isoformat(timespec="seconds")
                    result = connection.insert(
                        DatabaseTables.ORDERS,
                        {
                            DatabaseColumns.CUSTOMER_ID: customer_id,
                            DatabaseColumns.ORDER_DATE_TIME: order_date,
                            DatabaseColumns.TOTAL_AMOUNT: self.DEMO_ORDER_AMOUNT,
                        },
                    )
                    order = (
                        result.lastrowid,
                        order_date,
                        self.DEMO_ORDER_AMOUNT,
                    )
        except sqlite3.Error as error:
            logger.exception("Could not create a sample order: %s", error)
            self._send_json(
                {"status": "error", "message": "Could not create a sample order."},
                500,
            )
            return

        self._send_json(
            {
                "status": "ok",
                "order": {
                    "order_id": order[0],
                    "order_date": order[1],
                    "total_amount": order[2],
                    "paid": False,
                },
            },
            201,
        )

    def _upload_image(self) -> None:
        """Save one JPG, PNG or WebP image (raw request body, up to 2 MB).

        Returns {"image_path": "/uploads/<hex>.<ext>"}, which items and events
        store in their image_path column.
        """
        content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type not in _IMAGE_TYPES:
            self._send_json({"status": "error", "message": "Choose a JPG, PNG or WebP image."}, 415)
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send_json({"status": "error", "message": "Invalid Content-Length header."}, 400)
            return
        if length <= 0:
            self._send_json({"status": "error", "message": "The image is empty."}, 400)
            return
        if length > MAX_UPLOAD_BYTES:
            self.close_connection = True  # the unread body cannot be reused
            self._send_json({"status": "error", "message": "Choose an image up to 2 MB."}, 413)
            return
        data = self.rfile.read(length)
        extension, looks_right = _IMAGE_TYPES[content_type]
        if len(data) != length or not looks_right(data[:16]):
            self._send_json({"status": "error", "message": "The file is not a valid image."}, 400)
            return
        name = f"{os.urandom(16).hex()}.{extension}"
        try:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            (UPLOAD_DIR / name).write_bytes(data)
        except OSError:
            logger.exception("Could not save an uploaded image")
            self._send_json({"status": "error", "message": "Could not save the image."}, 500)
            return
        self._send_json({"status": "ok", "image_path": f"/uploads/{name}"}, 201)

    def _send_database_status(self) -> None:
        try:
            response = get_database_status()
            status_code = 200
        except (OSError, sqlite3.Error) as error:
            logger.error("Could not read database status: %s", error)
            response = {
                "status": "error",
                "message": str(error),
            }
            status_code = 500

        self._send_json(response, status_code)

    def _send_dashboard_data(self) -> None:
        try:
            response = get_dashboard_data()
            status_code = 200
        except (OSError, sqlite3.Error) as error:
            logger.error("Could not read dashboard data from SQLite: %s", error)
            response = {
                "status": "error",
                "message": "Could not read dashboard data from SQLite.",
            }
            status_code = 500

        self._send_json(response, status_code)

    def _send_json(self, response: dict[str, object], status_code: int) -> None:
        send_json(self, response, status_code)

    def _shutdown(self) -> None:
        """Stop this server when a newer launch asks, proving it can read the key file."""
        key = getattr(self.server, "shutdown_key", None)
        given = self.headers.get(SHUTDOWN_KEY_HEADER, "")
        if not key or not hmac.compare_digest(given, key):
            self._send_json({"status": "error", "message": "Forbidden."}, 403)
            return
        self._send_json({"status": "ok"}, 200)
        # shutdown() waits for serve_forever() to return, so it must run on another thread.
        threading.Thread(target=self.server.shutdown, daemon=True).start()


class ExclusivePortHTTPServer(ThreadingHTTPServer):
    """Refuse to share the port with another running server.

    On Windows, SO_REUSEADDR (enabled by http.server) lets several servers bind
    the same port, and the browser may silently reach a stale one.
    """

    allow_reuse_address = os.name != "nt"
    # Set by run_local_website.py; a newer launch sends it to /api/shutdown to take over the port.
    shutdown_key: str | None = None

    def server_bind(self) -> None:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    configure_backend_logging()
    return ExclusivePortHTTPServer((host, port), LocalTestRequestHandler)
