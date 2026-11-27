// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppointmentsPage } from "./AppointmentsPage";
import { canContinue, validateIssue } from "./appointmentValidation";
import { describeSchedule, formatSlot } from "../../services/appointments";

const TODAY = new Date(2026, 10, 21); // Saturday
const TOKEN = "a".repeat(43);
const SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];

/** Mirrors the backend rules: no same-day, open Mon/Wed/Fri only. */
function month(year: number, monthIndex: number, booked: Record<number, string[]> = {}, full: number[] = []) {
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return {
    status: "ok", today: "2026-11-21", slots: SLOTS, slot_minutes: 60, open_weekdays: ["Monday", "Wednesday", "Friday"],
    days: Array.from({ length: count }, (_, index) => {
      const day = new Date(year, monthIndex, index + 1);
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
      const state = day <= TODAY ? "past" : ![1, 3, 5].includes(day.getDay()) ? "closed" : full.includes(index + 1) ? "full" : "open";
      return { date, state, booked: full.includes(index + 1) ? SLOTS : booked[index + 1] ?? [] };
    }),
  };
}

type Reply = { status?: number; body: object };
function mockFetch(handler: (url: string, method: string, body: unknown) => Reply | undefined) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    const reply = handler(url, method, body)
      ?? (url.startsWith("/api/appointments/availability?month=2026-11") ? { body: month(2026, 10, { 23: ["10:00"] }, [27]) }
        : url.startsWith("/api/appointments/availability?month=2026-12") ? { body: month(2026, 11) }
        : url === "/api/profile" ? { body: { status: "ok", customer: { first_name: "Jamie", last_name: "Rivera" } } }
        : url === "/api/my-appointments" && method === "GET" ? { body: { status: "ok", appointments: [] } }
        : { status: 404, body: { status: "error", message: "Not found." } });
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function signIn() {
  localStorage.setItem("lpvr.session", JSON.stringify({ token: TOKEN, expiresAt: 4_102_444_800 }));
}

async function chooseSlot(day = "November 23, available", time = "1:00 PM") {
  fireEvent.click(await screen.findByRole("button", { name: day }));
  fireEvent.click(await screen.findByRole("button", { name: time }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function fillIssue(type = "Brake Repair", description = "Rear brake squeaks when stopping.") {
  fireEvent.change(screen.getByLabelText(/Repair type/), { target: { value: type } });
  fireEvent.change(screen.getByLabelText(/Description of the issue/), { target: { value: description } });
}

describe("appointment validation", () => {
  it("requires a date and slot before continuing", () => {
    expect(canContinue(null, "10:00")).toBe(false);
    expect(canContinue("2026-11-24", null)).toBe(false);
    expect(canContinue("2026-11-24", "10:00")).toBe(true);
  });

  it("requires a known repair type and a 10–500 character description", () => {
    expect(validateIssue({ repairType: "", description: "short" })).toEqual({
      repairType: "Select a repair type.",
      description: "Describe the issue in at least 10 characters.",
    });
    expect(validateIssue({ repairType: "Paint", description: "Long enough text" }).repairType).toBe("Select a repair type.");
    expect(validateIssue({ repairType: "Other", description: "x".repeat(501) }).description).toBe("Keep the description under 500 characters.");
    expect(validateIssue({ repairType: "Tire Repair", description: "  Flat rear tire.  " })).toEqual({});
  });

  it("formats slots as 12-hour times", () => {
    expect(formatSlot("10:00")).toBe("10:00 AM");
    expect(formatSlot("13:00")).toBe("1:00 PM");
  });

  it("describes the schedule with the closing time after the last slot", () => {
    const schedule = { today: "2026-11-21", slots: SLOTS, slot_minutes: 60, open_weekdays: ["Monday", "Wednesday", "Friday"], days: [] };
    expect(describeSchedule(schedule)).toBe("Monday, Wednesday & Friday, 10:00 AM – 4:00 PM");
    expect(describeSchedule({ ...schedule, open_weekdays: [] })).toBe("");
  });
});

describe("AppointmentsPage", () => {
  it("shows availability on the calendar and only lets open days be picked", async () => {
    const fetchMock = mockFetch(() => undefined);
    render(<AppointmentsPage today={TODAY} />);
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "November 23, available" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /November 21/ })).toBeNull();
    expect(screen.getByText("November 21, not available (today)")).toBeTruthy();
    expect(screen.getByText("November 24, shop closed")).toBeTruthy();
    expect(screen.getByText("November 27, fully booked")).toBeTruthy();
    expect(screen.getByText(/Monday, Wednesday & Friday, 10:00 AM – 4:00 PM\. 60-minute appointments\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous month" }).matches(":disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "December 2, available" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/appointments/availability?month=2026-12")).toBe(true);
  });

  it("books through all three steps and shows a confirmation", async () => {
    signIn();
    const fetchMock = mockFetch((url, method) => url === "/api/my-appointments" && method === "POST"
      ? { status: 201, body: { status: "ok", appointment: { appointment_id: 11, date: "2026-11-23", time: "13:00", repair_type: "Brake Repair", description: "Rear brake squeaks when stopping." } } }
      : undefined);
    render(<AppointmentsPage today={TODAY} />);

    expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Select Date & Time");
    fireEvent.click(await screen.findByRole("button", { name: "November 23, available" }));
    expect(screen.getByText("Available times · Monday, November 23, 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: /10:00 AM/ }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Continue" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1:00 PM" }));
    expect(screen.getByRole("button", { name: "1:00 PM" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Describe the issue" })).toBeTruthy();
    expect(screen.getByText("Monday, November 23, 2026 · 1:00 PM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));
    expect(screen.getByText("Select a repair type.")).toBeTruthy();
    expect(screen.getByText("Describe the issue in at least 10 characters.")).toBeTruthy();
    fillIssue();
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));

    expect(screen.getByRole("heading", { name: "Confirm your booking" })).toBeTruthy();
    const summary = screen.getByText("Customer name").closest("dl")!;
    expect(within(summary).getByText("Jamie Rivera")).toBeTruthy();
    expect(within(summary).getByText("Brake Repair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));

    expect(await screen.findByRole("heading", { name: "Your appointment is booked" })).toBeTruthy();
    expect(screen.getByText("See you on Monday, November 23, 2026 at 1:00 PM.")).toBeTruthy();
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    const post = fetchMock.mock.calls.find(([url, options]) => url === "/api/my-appointments" && options?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ date: "2026-11-23", time: "13:00", repair_type: "Brake Repair", description: "Rear brake squeaks when stopping." });
    expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);

    fireEvent.click(screen.getByRole("button", { name: "Book another appointment" }));
    expect(screen.getByText("Choose an available date on the calendar to see open times.")).toBeTruthy();
  });

  it("keeps entered details when going back", async () => {
    mockFetch(() => undefined);
    render(<AppointmentsPage today={TODAY} />);
    await chooseSlot();
    fillIssue("Tire Repair", "Front tire keeps going flat.");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "1:00 PM" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText(/Repair type/) as HTMLSelectElement).value).toBe("Tire Repair");
    expect((screen.getByLabelText(/Description of the issue/) as HTMLTextAreaElement).value).toBe("Front tire keeps going flat.");
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Describe the issue" })).toBeTruthy();
  });

  it("returns to time selection when the slot was just taken", async () => {
    signIn();
    let taken = false;
    const fetchMock = mockFetch((url, method) => {
      if (url === "/api/my-appointments" && method === "POST") {
        taken = true;
        return { status: 409, body: { status: "error", message: "That time was just booked. Please choose another time." } };
      }
      if (taken && url.endsWith("month=2026-11")) return { body: month(2026, 10, { 23: ["10:00", "13:00"] }, [27]) };
      return undefined;
    });
    render(<AppointmentsPage today={TODAY} />);
    await chooseSlot();
    fillIssue();
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("That time was just booked. Please choose another time.");
    expect(screen.getByRole("heading", { name: "Select a date & time" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /1:00 PM/ }).matches(":disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Continue" }).matches(":disabled")).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("month=2026-11")).length).toBeGreaterThan(1);
  });

  it("asks guests to sign in instead of booking", async () => {
    const fetchMock = mockFetch(() => undefined);
    render(<AppointmentsPage today={TODAY} />);
    await chooseSlot();
    fillIssue();
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));
    expect(screen.getByText("Sign in to confirm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));
    expect(within(await screen.findByRole("alert")).getByRole("link", { name: "sign in" }).getAttribute("href")).toBe("login.html");
    expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/my-appointments" && options?.method === "POST")).toBe(false);
  });

  it("books once a guest signs in from another tab, without reloading", async () => {
    const fetchMock = mockFetch((url, method, body) => url === "/api/my-appointments" && method === "POST"
      ? { status: 201, body: { status: "ok", appointment: { appointment_id: 11, ...(body as object) } } }
      : undefined);
    render(<AppointmentsPage today={TODAY} />);
    await chooseSlot();
    fillIssue();
    fireEvent.click(screen.getByRole("button", { name: "Review Booking" }));
    expect(screen.getByText("Sign in to confirm")).toBeTruthy();

    signIn(); // the shared localStorage session now exists, as after signing in elsewhere
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));

    expect(await screen.findByRole("heading", { name: "Your appointment is booked" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/my-appointments" && options?.method === "POST")).toBe(true);
    expect(await screen.findByText("Jamie Rivera")).toBeTruthy();
  });
});
