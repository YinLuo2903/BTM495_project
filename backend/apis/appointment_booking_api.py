"""Online repair-appointment booking: availability and booking rules.

The booking page and the API both rely on the rules defined here, so the
calendar can only offer what the server will accept.
"""

from collections.abc import Callable
from datetime import date, datetime, timedelta
from pathlib import Path

from backend.utils.constants import DatabaseColumns, DatabaseTables, StatusID
from backend.utils.response import Response
from backend.utils.sqlite import SQLiteQuery, SQLiteSession
from database.sqlite_database import DB_PATH

# ---- Fixed booking schedule (edit here to change when customers can book) ----
# Python weekday(): Monday is 0. Repairs are booked on Monday, Wednesday and Friday.
OPEN_WEEKDAYS = frozenset({0, 2, 4})
OPENING_HOUR = 10  # first slot starts at 10:00
CLOSING_HOUR = 16  # last slot ends at 16:00
SLOT_MINUTES = 60
SLOT_TIMES = tuple(
    f"{minute // 60:02d}:{minute % 60:02d}"
    for minute in range(OPENING_HOUR * 60, CLOSING_HOUR * 60, SLOT_MINUTES)
)  # 10:00, 11:00, 12:00, 13:00, 14:00, 15:00
BOOKING_WINDOW_DAYS = 90
_WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
REPAIR_TYPES = (
    "Brake Repair",
    "Tire Repair",
    "Gear Adjustment",
    "General Maintenance",
    "Other",
)
MIN_DESCRIPTION_LENGTH = 10
MAX_DESCRIPTION_LENGTH = 500

# Day states reported to the calendar.
DAY_PAST = "past"  # today or earlier: no same-day online booking
DAY_CLOSED = "closed"  # shop closed that weekday
DAY_UNAVAILABLE = "unavailable"  # beyond the booking window
DAY_FULL = "full"
DAY_OPEN = "open"


def _slot_for(appointment_time: object) -> tuple[str, str] | None:
    """(YYYY-MM-DD, slot start) an appointment falls in, or None if outside every slot."""
    if not isinstance(appointment_time, str):
        return None
    try:
        moment = datetime.fromisoformat(appointment_time)
    except ValueError:
        return None
    minute = moment.hour * 60 + moment.minute
    start = OPENING_HOUR * 60
    if not start <= minute < CLOSING_HOUR * 60:
        return None
    slot_start = start + (minute - start) // SLOT_MINUTES * SLOT_MINUTES
    return moment.date().isoformat(), f"{slot_start // 60:02d}:{slot_start % 60:02d}"


class AppointmentBookingAPI:
    def __init__(
        self,
        database_path: str | Path = DB_PATH,
        today: Callable[[], date] = date.today,
    ) -> None:
        self.database = SQLiteQuery(database_path)
        self._today = today

    def monthAvailability(self, year: int, month: int) -> Response:
        """State and booked slots for every day of the month."""
        if not (2000 <= year <= 2100 and 1 <= month <= 12):
            return Response.warning("Invalid month.")
        first = date(year, month, 1)
        after = date(year + (month == 12), month % 12 + 1, 1)
        with self.database.session(read_only=True) as session:
            booked = self._bookedSlots(session, first, after)
        today = self._today()
        days = []
        day = first
        while day < after:
            taken = sorted(booked.get(day.isoformat(), set()))
            days.append(
                {"date": day.isoformat(), "state": self._dayState(day, len(taken), today), "booked": taken}
            )
            day += timedelta(days=1)
        return Response.ok(
            "Availability retrieved.",
            {
                "today": today.isoformat(),
                "slots": list(SLOT_TIMES),
                "slot_minutes": SLOT_MINUTES,
                "open_weekdays": [_WEEKDAY_NAMES[day] for day in sorted(OPEN_WEEKDAYS)],
                "days": days,
            },
        )

    def book(
        self,
        customerID: int,
        day: object,
        slot: object,
        repairType: object,
        description: object,
    ) -> Response:
        """Book a free slot for the customer; the check and insert share one locked transaction."""
        if type(customerID) is not int or customerID <= 0:
            return Response.warning("A valid customer ID is required.")
        try:
            booking_day = date.fromisoformat(day) if isinstance(day, str) else None
        except ValueError:
            booking_day = None
        if booking_day is None:
            return Response.warning("Choose a valid date.")
        if slot not in SLOT_TIMES:
            return Response.warning("Choose one of the available times.")
        if repairType not in REPAIR_TYPES:
            return Response.warning("Select a repair type.")
        text = description.strip() if isinstance(description, str) else ""
        if not MIN_DESCRIPTION_LENGTH <= len(text) <= MAX_DESCRIPTION_LENGTH:
            return Response.warning(
                f"Describe the issue in {MIN_DESCRIPTION_LENGTH} to {MAX_DESCRIPTION_LENGTH} characters."
            )

        with self.database.transaction(immediate=True) as session:
            booked = self._bookedSlots(
                session, booking_day, booking_day + timedelta(days=1)
            ).get(booking_day.isoformat(), set())
            state = self._dayState(booking_day, len(booked), self._today())
            if state != DAY_OPEN and state != DAY_FULL:
                return Response.warning("That date is not available for booking.")
            if slot in booked:
                # `conflict` lets the HTTP layer answer 409 without matching on the message.
                return Response.warning(
                    "That time was just booked. Please choose another time.",
                    {"conflict": True},
                )
            result = session.insert(
                DatabaseTables.APPOINTMENT,
                {
                    DatabaseColumns.CUSTOMER_ID: customerID,
                    DatabaseColumns.APPOINTMENT_TIME: f"{booking_day.isoformat()} {slot}:00",
                    # The table has one free-text column, so the repair type leads it.
                    DatabaseColumns.DESCRIPTION: f"{repairType}: {text}",
                    DatabaseColumns.STATUS_ID: StatusID.PENDING,
                },
            )
        return Response.ok(
            "Appointment booked successfully.",
            {
                "appointment_id": result.lastrowid,
                "date": booking_day.isoformat(),
                "time": slot,
                "repair_type": repairType,
                "description": text,
            },
        )

    def forCustomer(self, customerID: int) -> Response:
        """The customer's appointments, oldest first, with the repair type split back out."""
        if type(customerID) is not int or customerID <= 0:
            return Response.warning("A valid customer ID is required.")
        with self.database.session(read_only=True) as session:
            rows = session.fetch_all(
                f'SELECT "{DatabaseColumns.APPOINTMENT_ID}", "{DatabaseColumns.APPOINTMENT_TIME}", '
                f'"{DatabaseColumns.DESCRIPTION}", "{DatabaseColumns.STATUS_ID}" FROM "{DatabaseTables.APPOINTMENT}" '
                f'WHERE "{DatabaseColumns.CUSTOMER_ID}" = ? ORDER BY "{DatabaseColumns.APPOINTMENT_TIME}"',
                (customerID,),
            )
        appointments = []
        for appointment_id, appointment_time, description, status_id in rows:
            text = description or ""
            # book() stores "<repair type>: <description>"; older rows have no type.
            repair_type = next((kind for kind in REPAIR_TYPES if text.startswith(f"{kind}: ")), None)
            appointments.append({
                "appointment_id": appointment_id,
                "time": appointment_time,
                "repair_type": repair_type,
                "description": text[len(repair_type) + 2:] if repair_type else text,
                "status_id": status_id,
            })
        return Response.ok("Appointments retrieved.", {"appointments": appointments})

    @staticmethod
    def _dayState(day: date, booked_count: int, today: date) -> str:
        if day <= today:
            return DAY_PAST
        if day > today + timedelta(days=BOOKING_WINDOW_DAYS):
            return DAY_UNAVAILABLE
        if day.weekday() not in OPEN_WEEKDAYS:
            return DAY_CLOSED
        return DAY_FULL if booked_count >= len(SLOT_TIMES) else DAY_OPEN

    @staticmethod
    def _bookedSlots(session: SQLiteSession, start: date, end: date) -> dict[str, set[str]]:
        """Slots held by non-cancelled appointments in [start, end), keyed by date."""
        rows = session.fetch_all(
            f'SELECT "{DatabaseColumns.APPOINTMENT_TIME}" FROM "{DatabaseTables.APPOINTMENT}" '
            f'WHERE "{DatabaseColumns.APPOINTMENT_TIME}" >= ? '
            f'AND "{DatabaseColumns.APPOINTMENT_TIME}" < ? '
            f'AND ("{DatabaseColumns.STATUS_ID}" IS NULL OR "{DatabaseColumns.STATUS_ID}" != ?)',
            (start.isoformat(), end.isoformat(), int(StatusID.CANCELLED)),
        )
        booked: dict[str, set[str]] = {}
        for (appointment_time,) in rows:
            occupied = _slot_for(appointment_time)
            if occupied:
                booked.setdefault(occupied[0], set()).add(occupied[1])
        return booked
