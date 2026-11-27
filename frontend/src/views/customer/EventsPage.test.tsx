// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SLIDE_MS } from "../../components/Slideshow";
import { EventsPage, parseEventDate } from "./EventsPage";

const TODAY = new Date(2026, 10, 21, 9, 0);
const TOKEN = "a".repeat(43);

const baseEvents = [
  { event_id: 5, name: "Halloween Costume Ride", participant_limit: 50, customer_ids: [1, 2], description: "Ride in costume.", location: "Lachine Canal", event_date_time: "2026-10-31 18:00:00", status_id: 2 },
  { event_id: 6, name: "Winter Bike Prep Workshop", participant_limit: 15, customer_ids: [1, 2, 3], description: "Prepare your bike for cold weather.", location: "Bike Shop Workshop Area", event_date_time: "2026-11-21 13:00:00", status_id: 1 },
  { event_id: 7, name: "Black Friday Sale Event", participant_limit: 100, customer_ids: [], description: "Special discounts.", location: "Bike Shop Showroom", event_date_time: "2026-11-27 09:00:00", status_id: 1 },
  { event_id: 9, name: "Tire Class", participant_limit: 2, customer_ids: [1, 2], description: "Tire changes.", location: "Workshop", event_date_time: "2026-12-12 14:00:00", status_id: 1 },
  { event_id: 11, name: "Mystery Ride", participant_limit: 10, customer_ids: [], description: null, location: null, event_date_time: null, status_id: 1 },
];

type Handler = (url: string, method: string) => { ok?: boolean; status?: number; body: object };

function mockFetch(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    const { ok = true, status = ok ? 200 : 400, body } = handler(url, options.method ?? "GET");
    return { ok, status, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function signIn() {
  localStorage.setItem("lpvr.session", JSON.stringify({ token: TOKEN, expiresAt: 4_102_444_800 }));
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

describe("parseEventDate", () => {
  it("reads SQLite date text as local time and rejects missing values", () => {
    expect(parseEventDate("2026-11-21 13:00:00")?.getTime()).toBe(new Date(2026, 10, 21, 13, 0).getTime());
    expect(parseEventDate(null)).toBeNull();
    expect(parseEventDate("soon")).toBeNull();
  });
});

describe("EventsPage", () => {
  it("selects the next open event and shows its details beside the month calendar", async () => {
    mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
    render(<EventsPage today={TODAY} />);

    expect(await screen.findByRole("heading", { level: 2, name: "Winter Bike Prep Workshop" })).toBeTruthy();
    expect(screen.getByText("Happening today")).toBeTruthy();
    expect(screen.getByText("Saturday, November 21, 2026")).toBeTruthy();
    expect(screen.getByText("1:00 PM")).toBeTruthy();
    expect(screen.getByText("Bike Shop Workshop Area")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Event photo placeholder" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();

    const today = screen.getByRole("button", { name: "November 21: Winter Bike Prep Workshop (today)" });
    expect(today.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Events in November" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Date to be announced" })).toBeTruthy();
  });

  it("opens the event named in ?id= (links from the home page slideshow)", async () => {
    window.history.replaceState({}, "", "/views/customer/events.html?id=9");
    mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
    render(<EventsPage today={TODAY} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Tire Class" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
    window.history.replaceState({}, "", "/views/customer/events.html");
  });

  it("slides between events with the arrows and follows on the calendar", async () => {
    mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
    render(<EventsPage today={TODAY} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Winter Bike Prep Workshop" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(screen.getByRole("heading", { level: 2, name: "Black Friday Sale Event" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(screen.getByRole("heading", { level: 2, name: "Tire Class" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy(); // the calendar followed
    fireEvent.click(screen.getByRole("button", { name: "Previous event" }));
    expect(screen.getByRole("heading", { level: 2, name: "Black Friday Sale Event" })).toBeTruthy();
  });

  it("auto-advances through upcoming events only, wrapping to the soonest", async () => {
    vi.useFakeTimers();
    try {
      mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
      render(<EventsPage today={TODAY} />);
      await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); // let the fetches settle
      expect(screen.getByRole("heading", { level: 2, name: "Winter Bike Prep Workshop" })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(SLIDE_MS); });
      expect(screen.getByRole("heading", { level: 2, name: "Black Friday Sale Event" })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(SLIDE_MS); });
      expect(screen.getByRole("heading", { level: 2, name: "Tire Class" })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(SLIDE_MS); });
      // skips the past Halloween ride and goes back to the soonest open event
      expect(screen.getByRole("heading", { level: 2, name: "Winter Bike Prep Workshop" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches events from the calendar and moves between months", async () => {
    mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
    render(<EventsPage today={TODAY} />);
    await screen.findByRole("heading", { level: 2, name: "Winter Bike Prep Workshop" });

    fireEvent.click(screen.getByRole("button", { name: "November 27: Black Friday Sale Event" }));
    expect(screen.getByRole("heading", { level: 2, name: "Black Friday Sale Event" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "December 12: Tire Class" }));
    expect(screen.getByRole("button", { name: "Event full" }).matches(":disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "October 31: Halloween Costume Ride" }));
    expect(screen.getByText("Past event")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registration closed" }).matches(":disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Mystery Ride/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Mystery Ride" })).toBeTruthy();
    expect(screen.getAllByText("Date to be announced").length).toBeGreaterThan(0);
    expect(screen.getByText("Location to be announced")).toBeTruthy();
  });

  it("asks guests to sign in instead of registering", async () => {
    const fetchMock = mockFetch(() => ({ body: { status: "ok", events: baseEvents } }));
    render(<EventsPage today={TODAY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Register now" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("link", { name: "sign in" }).getAttribute("href")).toBe("login.html");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/my-events/"))).toBe(false);
  });

  it("registers and cancels for the signed-in customer", async () => {
    signIn();
    let registered: number[] = [];
    const fetchMock = mockFetch((url, method) => {
      if (url === "/api/events") {
        const events = baseEvents.map(event => event.event_id === 6 && registered.includes(6)
          ? { ...event, customer_ids: [...event.customer_ids, 42] } : event);
        return { body: { status: "ok", events } };
      }
      if (url === "/api/my-events") return { body: { status: "ok", event_ids: registered } };
      if (url === "/api/my-events/6" && method === "POST") { registered = [6]; return { status: 201, body: { status: "ok" } }; }
      if (url === "/api/my-events/6" && method === "DELETE") { registered = []; return { body: { status: "ok" } }; }
      return { ok: false, status: 404, body: { status: "error", message: "Not found." } };
    });
    render(<EventsPage today={TODAY} />);

    fireEvent.click(await screen.findByRole("button", { name: "Register now" }));
    expect(await screen.findByText("You're registered")).toBeTruthy();
    expect(screen.getByText("Registered", { selector: ".ev-status" })).toBeTruthy();
    const post = fetchMock.mock.calls.find(([url, options]) => url === "/api/my-events/6" && options?.method === "POST");
    expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);

    fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
    expect(await screen.findByRole("button", { name: "Register now" })).toBeTruthy();
    expect(screen.queryByText("You're registered")).toBeNull();
  });

  it("shows registration errors from the server", async () => {
    signIn();
    mockFetch((url, method) => {
      if (url === "/api/events") return { body: { status: "ok", events: baseEvents } };
      if (url === "/api/my-events" && method === "GET") return { body: { status: "ok", event_ids: [] } };
      return { ok: false, body: { status: "error", message: "Event is full." } };
    });
    render(<EventsPage today={TODAY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Register now" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Event is full."));
  });

  it("does not ask a signed-in customer to sign in when the registration lookup fails", async () => {
    signIn();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/events"
      ? { ok: true, status: 200, json: async () => ({ status: "ok", events: baseEvents }) }
      // An outdated server answers with an HTML 404 page, not JSON.
      : { ok: false, status: 404, json: async () => { throw new SyntaxError("Unexpected token <"); } }));
    render(<EventsPage today={TODAY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Register now" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Could not check your registrations (Request failed with HTTP 404.). Please reload the page or try again later.");
    expect(within(alert).queryByRole("link", { name: "sign in" })).toBeNull();
  });

  it("asks for sign-in when the session expires before registering", async () => {
    signIn();
    mockFetch((url, method) => {
      if (url === "/api/events") return { body: { status: "ok", events: baseEvents } };
      if (url === "/api/my-events" && method === "GET") return { body: { status: "ok", event_ids: [] } };
      return { ok: false, status: 401, body: { status: "error", message: "Sign in with a customer account to register for events." } };
    });
    render(<EventsPage today={TODAY} />);
    fireEvent.click(await screen.findByRole("button", { name: "Register now" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: "sign in" })).toBeTruthy();
  });

  it("reports a failed event load", async () => {
    mockFetch(() => ({ ok: false, status: 500, body: { status: "error", message: "Events unavailable." } }));
    render(<EventsPage today={TODAY} />);
    expect(await screen.findByText("Events unavailable.")).toBeTruthy();
  });
});
