import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.apis.appointment_booking_api import (
    OPEN_WEEKDAYS,
    SLOT_MINUTES,
    SLOT_TIMES,
    AppointmentBookingAPI,
)
from backend.utils.constants import StatusID
from database.sqlite_database import initialize_database

# Saturday. Bookable days are Mon/Wed/Fri: Nov 23, 25, 27 and 30.
TODAY = date(2026, 11, 21)


class AppointmentBookingAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "test.db"
        initialize_database(self.database_path)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("INSERT INTO customer (customer_id, first_name) VALUES (10, 'A')")
            connection.executemany(
                "INSERT INTO appointment (customer_id, appointmentTime, description, statusID) "
                "VALUES (10, ?, 'Existing', ?)",
                [
                    ("2026-11-23 10:30:00", StatusID.PENDING),  # inside the 10:00 slot
                    ("2026-11-23 09:00:00", StatusID.PENDING),  # before opening
                    ("2026-11-23 16:00:00", StatusID.PENDING),  # at closing time
                    ("2026-11-25 13:00:00", StatusID.CANCELLED),  # frees its slot
                ]
                + [(f"2026-11-27 {slot}:00", StatusID.PENDING) for slot in SLOT_TIMES],
            )
            connection.commit()
        self.api = AppointmentBookingAPI(self.database_path, today=lambda: TODAY)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _days(self, year: int, month: int) -> dict[str, dict]:
        result = self.api.monthAvailability(year, month)
        self.assertTrue(result.success, result.msg)
        return {day["date"]: day for day in result.data["days"]}

    def _appointments(self) -> list[tuple]:
        with closing(sqlite3.connect(self.database_path)) as connection:
            return connection.execute(
                "SELECT customer_id, appointmentTime, description, statusID FROM appointment "
                "WHERE description != 'Existing'"
            ).fetchall()

    def test_lists_a_customers_appointments_oldest_first_with_the_repair_type(self) -> None:
        self.assertTrue(self.api.book(10, "2026-11-30", "11:00", "Brake Repair", "Rear brake squeals.").success)
        result = self.api.forCustomer(10)
        self.assertTrue(result.success)
        listed = result.data["appointments"]
        self.assertEqual([a["time"] for a in listed], sorted(a["time"] for a in listed))
        booked = listed[-1]
        self.assertEqual((booked["repair_type"], booked["description"], booked["status_id"]),
                         ("Brake Repair", "Rear brake squeals.", StatusID.PENDING))
        self.assertEqual((listed[0]["repair_type"], listed[0]["description"]), (None, "Existing"))
        self.assertEqual(self.api.forCustomer(99).data["appointments"], [])
        self.assertFalse(self.api.forCustomer(0).success)

    def test_fixed_schedule_is_monday_wednesday_friday_hourly_10_to_16(self) -> None:
        self.assertEqual(OPEN_WEEKDAYS, {0, 2, 4})
        self.assertEqual(SLOT_MINUTES, 60)
        self.assertEqual(SLOT_TIMES, ("10:00", "11:00", "12:00", "13:00", "14:00", "15:00"))
        data = self.api.monthAvailability(2026, 11).data
        self.assertEqual(data["today"], "2026-11-21")
        self.assertEqual(data["slots"], list(SLOT_TIMES))
        self.assertEqual(data["slot_minutes"], 60)
        self.assertEqual(data["open_weekdays"], ["Monday", "Wednesday", "Friday"])

    def test_month_availability_reports_day_states_and_booked_slots(self) -> None:
        days = self._days(2026, 11)
        self.assertEqual(len(days), 30)
        self.assertEqual(days["2026-11-20"]["state"], "past")
        self.assertEqual(days["2026-11-21"]["state"], "past")  # no same-day booking
        for closed in ("2026-11-22", "2026-11-24", "2026-11-26", "2026-11-28"):
            self.assertEqual(days[closed]["state"], "closed", closed)
        self.assertEqual(days["2026-11-23"], {"date": "2026-11-23", "state": "open", "booked": ["10:00"]})
        self.assertEqual(days["2026-11-25"]["booked"], [])
        self.assertEqual(days["2026-11-27"]["state"], "full")
        self.assertEqual(days["2026-11-30"]["state"], "open")

    def test_days_beyond_the_booking_window_are_unavailable(self) -> None:
        days = self._days(2027, 2)
        self.assertEqual(days["2027-02-19"]["state"], "open")  # Friday, exactly 90 days ahead
        self.assertEqual(days["2027-02-22"]["state"], "unavailable")  # Monday, too far ahead

    def test_month_availability_rejects_invalid_months(self) -> None:
        self.assertFalse(self.api.monthAvailability(2026, 13).success)
        self.assertFalse(self.api.monthAvailability(1999, 5).success)

    def test_book_saves_pending_appointment_with_repair_type(self) -> None:
        result = self.api.book(10, "2026-11-23", "12:00", "Brake Repair", "  Rear brake squeaks.  ")
        self.assertTrue(result.success, result.msg)
        self.assertEqual(result.data["date"], "2026-11-23")
        self.assertEqual(result.data["description"], "Rear brake squeaks.")
        self.assertEqual(
            self._appointments(),
            [(10, "2026-11-23 12:00:00", "Brake Repair: Rear brake squeaks.", StatusID.PENDING)],
        )
        self.assertEqual(self._days(2026, 11)["2026-11-23"]["booked"], ["10:00", "12:00"])

    def test_book_prevents_double_booking(self) -> None:
        self.assertTrue(self.api.book(10, "2026-11-25", "13:00", "Tire Repair", "Flat rear tire.").success)
        for day, slot in (("2026-11-25", "13:00"), ("2026-11-23", "10:00")):
            result = self.api.book(10, day, slot, "Tire Repair", "Flat rear tire.")
            self.assertEqual(result.msg, "That time was just booked. Please choose another time.")
            self.assertEqual(result.data, {"conflict": True})
        self.assertEqual(len(self._appointments()), 1)

    def test_book_rejects_invalid_requests(self) -> None:
        cases = [
            ((0, "2026-11-23", "13:00", "Other", "Long enough text"), "A valid customer ID is required."),
            ((10, "23/11/2026", "13:00", "Other", "Long enough text"), "Choose a valid date."),
            ((10, None, "13:00", "Other", "Long enough text"), "Choose a valid date."),
            ((10, "2026-11-23", "16:00", "Other", "Long enough text"), "Choose one of the available times."),
            ((10, "2026-11-23", "10:30", "Other", "Long enough text"), "Choose one of the available times."),
            ((10, "2026-11-23", "13:00", "Paint", "Long enough text"), "Select a repair type."),
            ((10, "2026-11-23", "13:00", "Other", "  short  "), "Describe the issue in 10 to 500 characters."),
            ((10, "2026-11-23", "13:00", "Other", "x" * 501), "Describe the issue in 10 to 500 characters."),
            ((10, "2026-11-21", "13:00", "Other", "Long enough text"), "That date is not available for booking."),
            ((10, "2026-11-24", "13:00", "Other", "Long enough text"), "That date is not available for booking."),
            ((10, "2027-03-01", "13:00", "Other", "Long enough text"), "That date is not available for booking."),
        ]
        for args, message in cases:
            with self.subTest(args=args):
                self.assertEqual(self.api.book(*args).msg, message)
        self.assertEqual(self._appointments(), [])


if __name__ == "__main__":
    unittest.main()
