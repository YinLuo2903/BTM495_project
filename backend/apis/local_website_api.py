import logging
import os
import re
import socket
import sqlite3
import threading
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from backend.apis.appointment_booking_api import AppointmentBookingAPI
from backend.apis.event_registration_api import EventRegistrationAPI
from backend.apis.inventory_list_api import InventoryList
from backend.apis.shopping_cart_api import ShoppingCartAPI
from backend.apis.local_website_extra_api import handle_route, is_extra_route
from backend.apis.profile_api import ManageProfile
from backend.models.customer import Customer
from backend.apis.session_api import SessionManager
from backend.models.payment import Payment, PaymentMethod, PaymentStatus
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
from backend.utils.validators import string_value
from database.sqlite_database import DB_PATH

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
FRONTEND_BUILD_DIR = FRONTEND_DIR / "dist"
FRONTEND_PAGES = {
    "/", "/views/index.html", "/view/index.html",
    *(f"/views/customer/{page}.html" for page in (
        "index", "items", "item", "events", "appointments", "cart",
        "checkout", "orders", "profile", "login", "signup",
    )),
    *(f"/views/admin/{page}.html" for page in (
        "index", "items", "inventory", "orders", "events", "appointments",
    )),
}
LOCAL_DEMO_LOGIN_EMAIL = "login@example.com"
LOCAL_DEMO_LOGIN_PASSWORD = "1234"
logger = get_logger(__name__)


def _database() -> SQLiteQuery:
    return SQLiteQuery(DB_PATH)


def ensure_local_demo_login(database_path: str | Path = DB_PATH) -> None:
    profile = ManageProfile(database_path)
    if profile.login(LOCAL_DEMO_LOGIN_EMAIL, LOCAL_DEMO_LOGIN_PASSWORD) is not None:
        return

    with SQLiteQuery(database_path).transaction(immediate=True) as session:
        for table in (DatabaseTables.ADMIN, DatabaseTables.CUSTOMER):
            existing = session.select_one(
                table,
                (DatabaseColumns.EMAIL,),
                where=(SQLCondition(DatabaseColumns.EMAIL, LOCAL_DEMO_LOGIN_EMAIL),),
            )
            if existing is not None:
                raise RuntimeError(
                    f"Cannot create the local demo login because "
                    f"{LOCAL_DEMO_LOGIN_EMAIL} is already in use."
                )

        # Keep the short smoke-test password hashed without weakening account policy.
        session.insert(
            DatabaseTables.CUSTOMER,
            {
                DatabaseColumns.FIRST_NAME: "Local",
                DatabaseColumns.LAST_NAME: "Dry-Run",
                DatabaseColumns.EMAIL: LOCAL_DEMO_LOGIN_EMAIL,
                DatabaseColumns.PASSWORD_HASH: profile._hashPassword(
                    LOCAL_DEMO_LOGIN_PASSWORD
                ),
            },
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
        orders = [
            {
                "order_id": order_id,
                "order_date": order_date,
                "total_amount": total_amount,
                "paid": order_id in paid_order_ids,
            }
            for order_id, order_date, total_amount in session.select(
                DatabaseTables.ORDERS,
                (
                    DatabaseColumns.ORDER_ID,
                    DatabaseColumns.ORDER_DATE_TIME,
                    DatabaseColumns.TOTAL_AMOUNT,
                ),
                order_by=(
                    SQLOrder(
                        DatabaseColumns.ORDER_ID,
                        SQLSortDirection.DESCENDING,
                    ),
                ),
            )
        ]
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
        if self._extra_route("DELETE") or self._my_events("DELETE"):
            return
        resource, record_id = self._record_route()
        if resource is None:
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return
        self._modify_records(resource, record_id, None)

    def do_PATCH(self) -> None:
        if self._extra_route("PATCH"):
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
        if (
            self._extra_route("POST")
            or self._my_events("POST")
            or self._appointments("POST")
            or self._my_cart("POST")
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

    def _my_cart(self, method: str) -> bool:
        """Serve the signed-in customer's cart; return False when the path is not /api/my-cart.

        GET returns the cart summary. POST {item_id, quantity?} adds to it, refusing
        any quantity that would take the cart above the item's stock.
        """
        if urlsplit(self.path).path != "/api/my-cart":
            return False
        if method not in ("GET", "POST"):
            self._send_json({"status": "error", "message": "Not found."}, 404)
            return True
        customer_id = self._session_customer_id(
            "Sign in with a customer account to use your cart."
        )
        if customer_id is None:
            return True
        payload: dict = {}
        if method == "POST":
            try:
                payload = read_json_object(
                    self, self.MAX_REQUEST_BYTES, request_name="Cart"
                )
            except HTTPRequestError as error:
                self._send_json(
                    {"status": "error", "message": str(error)}, error.status_code
                )
                return True
            item_id = payload.get("item_id")
            quantity = payload.get("quantity", 1)
            if type(item_id) is not int or item_id <= 0:
                self._send_json(
                    {"status": "error", "message": "item_id must be a positive whole number."}, 400
                )
                return True
            if type(quantity) is not int or not 1 <= quantity <= self.MAX_CART_ADD_QUANTITY:
                self._send_json(
                    {
                        "status": "error",
                        "message": f"quantity must be a whole number from 1 to {self.MAX_CART_ADD_QUANTITY}.",
                    },
                    400,
                )
                return True
        try:
            with self._CART_LOCK:
                carts = ShoppingCartAPI(DB_PATH)
                cart = carts.loadCart(customer_id)
                if method == "GET":
                    self._send_json({"status": "ok", **self._cart_summary(cart)}, 200)
                    return True
                found = InventoryList(DB_PATH).findItem(item_id)
                if not found.success:
                    self._send_json({"status": "error", "message": "Item not found."}, 404)
                    return True
                item = found.data
                in_cart = cart.items[item_id].quantity if item_id in cart.items else 0
                result = carts.addItem(cart, item, quantity)
        except (sqlite3.Error, ValueError, RuntimeError):
            logger.exception("Could not update cart for customer %s", customer_id)
            self._send_json({"status": "error", "message": "Could not update your cart."}, 500)
            return True
        if not result.success:
            stock = item.stockQuantity
            if stock is not None and stock <= 0:
                message = f"{item.name} is out of stock."
            elif stock is not None:
                message = (
                    f"Your cart already has {in_cart} of {item.name}; only {stock} in stock."
                )
            else:
                message = result.msg
            # 409: the request conflicts with current stock, not a malformed request.
            self._send_json(
                {"status": "error", "message": message, **self._cart_summary(cart)}, 409
            )
            return True
        logger.info("Customer %s added item %s x%s to cart", customer_id, item_id, quantity)
        self._send_json(
            {
                "status": "ok",
                "message": f"{item.name} added to your cart.",
                "item_id": item_id,
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


class ExclusivePortHTTPServer(ThreadingHTTPServer):
    """Refuse to share the port with another running server.

    On Windows, SO_REUSEADDR (enabled by http.server) lets several servers bind
    the same port, and the browser may silently reach a stale one.
    """

    allow_reuse_address = os.name != "nt"

    def server_bind(self) -> None:
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def create_server(host: str, port: int) -> ThreadingHTTPServer:
    configure_backend_logging()
    return ExclusivePortHTTPServer((host, port), LocalTestRequestHandler)
