import { api } from "./api";
import { sessionApi } from "./session";

/** Must match REPAIR_TYPES in backend/apis/appointment_booking_api.py. */
export const REPAIR_TYPES = ["Brake Repair", "Tire Repair", "Gear Adjustment", "General Maintenance", "Other"] as const;

/** past: today or earlier · closed: shop closed · unavailable: beyond the booking window. */
export type DayState = "past" | "closed" | "unavailable" | "full" | "open";

export interface AvailabilityDay {
  date: string;
  state: DayState;
  /** "HH:MM" slots already taken. */
  booked: string[];
}

export interface MonthAvailability {
  today: string;
  /** Slot start times, "HH:MM". */
  slots: string[];
  slot_minutes: number;
  /** Weekday names the shop takes bookings, e.g. ["Monday", "Wednesday", "Friday"]. */
  open_weekdays: string[];
  days: AvailabilityDay[];
}

export interface BookingRequest {
  date: string;
  time: string;
  repair_type: string;
  description: string;
}

export interface BookedAppointment extends BookingRequest {
  appointment_id: number;
}

/** "YYYY-MM" for the month containing `date`. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" as a local date. */
export function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "13:00" → "1:00 PM". */
export function formatSlot(slot: string): string {
  const [hour, minute] = slot.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Monday, Wednesday & Friday, 10:00 AM – 4:00 PM" from the booking schedule. */
export function describeSchedule({ open_weekdays: days, slots, slot_minutes: minutes }: MonthAvailability): string {
  if (!days.length || !slots.length) return "";
  const dayText = days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]}`;
  const [hour, minute] = slots[slots.length - 1].split(":").map(Number);
  const end = hour * 60 + minute + minutes;
  const closing = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${dayText}, ${formatSlot(slots[0])} – ${formatSlot(closing)}`;
}

export function formatLongDate(value: string): string {
  return parseDay(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function fetchAvailability(month: string): Promise<MonthAvailability> {
  return api<MonthAvailability & { status: string }>(`/api/appointments/availability?month=${encodeURIComponent(month)}`);
}

/** Book for the signed-in customer; throws SessionApiError (409 when the slot was just taken). */
export async function bookAppointment(request: BookingRequest): Promise<BookedAppointment> {
  const result = await sessionApi<{ appointment: BookedAppointment }>("/api/my-appointments", "POST", request);
  return result.appointment;
}
