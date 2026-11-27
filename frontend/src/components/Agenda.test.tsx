// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Agenda, NextUp, WORKSHOP, appointmentEntries, eventEntries, type MyAppointment } from "./Agenda";

const NOW = new Date(2026, 10, 26, 12, 0);
const appointment = (id: number, time: string, overrides: Partial<MyAppointment> = {}): MyAppointment =>
  ({ appointment_id: id, time, repair_type: "Brake Repair", description: "Squeaky brakes", status_id: 1, ...overrides });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("agenda entries", () => {
  it("keeps upcoming, not cancelled appointments, soonest first, at the workshop", () => {
    const entries = appointmentEntries([
      appointment(1, "2026-12-09 14:00:00"), appointment(2, "2026-11-01 10:00:00"),
      appointment(3, "2026-12-02 10:00:00"), appointment(4, "2026-12-04 11:00:00", { status_id: 3 }),
      appointment(5, "2026-12-07 13:00:00", { repair_type: null }),
    ], NOW);
    expect(entries.map(entry => entry.key)).toEqual(["a3", "a5", "a1"]);
    expect(entries[0]).toMatchObject({ title: "Brake Repair", place: WORKSHOP, href: "appointments.html#mine" });
    expect(entries[1].title).toBe("Repair appointment");
  });

  it("lists only the events the customer joined, linking to each one", () => {
    const events = [1, 2, 3].map(id => ({ event_id: id, name: `Event ${id}`, participant_limit: 9, customer_ids: [], location: "Park",
      event_date_time: `2026-12-0${id} 10:00:00`, status_id: 1 }));
    const entries = eventEntries(events, [3, 1], NOW);
    expect(entries.map(entry => [entry.title, entry.href])).toEqual([["Event 1", "events.html?id=1"], ["Event 3", "events.html?id=3"]]);
  });
});

describe("Agenda", () => {
  it("highlights the next booking and lists the rest", () => {
    const entries = appointmentEntries([appointment(1, "2026-12-09 14:00:00"), appointment(2, "2026-12-02 10:00:00")], NOW);
    render(<Agenda id="mine" title="Your appointments" state={{ kind: "ready", value: entries }} empty="None" guest="Sign in" />);
    expect(screen.getByRole("link", { name: /Next up · Wed, Dec 2 · 10:00 AM/ }).getAttribute("href")).toBe("appointments.html#mine");
    expect(screen.getByRole("link", { name: /Wed, Dec 9 · 2:00 PM/ })).toBeTruthy();
  });

  it("asks guests to sign in and says when nothing is booked", () => {
    const view = render(<Agenda id="mine" title="Your appointments" state={{ kind: "guest" }} empty="Nothing yet" guest="Sign in to see them" />);
    expect(screen.getByRole("link", { name: "Sign in to see them" }).getAttribute("href")).toBe("/views/customer/login.html");
    view.unmount();
    render(<Agenda id="mine" title="Your appointments" state={{ kind: "ready", value: [] }} empty="Nothing yet" guest="Sign in" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });
});

describe("NextUp", () => {
  function serve(replies: Record<string, object | number>) {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ token: "a".repeat(43), expiresAt: 4_102_444_800 }), setItem() {}, removeItem() {} });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const reply = replies[url];
      const status = typeof reply === "number" ? reply : 200;
      return { ok: status < 400, status, json: async () => (typeof reply === "number" ? { status: "error", message: "Signed out." } : { status: "ok", ...reply }) };
    }));
  }

  it("shows the soonest of the customer's appointments and joined events", async () => {
    serve({
      "/api/my-appointments": { appointments: [appointment(1, "2099-03-01 10:00:00")] },
      "/api/events": { events: [{ event_id: 7, name: "Canal Ride", participant_limit: 9, customer_ids: [], event_date_time: "2099-02-01 09:00:00", status_id: 1 }] },
      "/api/my-events": { event_ids: [7] },
    });
    render(<NextUp />);
    expect((await screen.findByRole("link", { name: /Next up.*Canal Ride/ })).getAttribute("href")).toBe("events.html?id=7");
  });

  it("stays hidden for guests", async () => {
    serve({ "/api/my-appointments": 401, "/api/events": { events: [] }, "/api/my-events": 401 });
    const { container } = render(<NextUp />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });
});
