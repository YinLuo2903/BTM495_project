// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ShopEvent } from "../../services/api";
import { EventShowcase } from "./EventShowcase";

const event = (id: number, when: string, overrides: Partial<ShopEvent> = {}): ShopEvent => ({
  event_id: id, name: `Event ${id}`, participant_limit: 10, customer_ids: [1, 2], location: "Workshop",
  event_date_time: when, status_id: 1, image_path: `/uploads/e${id}.webp`, ...overrides,
});

async function renderWith(events: ShopEvent[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", events }) })));
  render(<EventShowcase />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("event showcase", () => {
  it("shows only open upcoming events, soonest first", async () => {
    await renderWith([
      event(1, "2099-05-01 10:00:00"), event(2, "2000-01-01 10:00:00"), event(3, "2099-02-01 10:00:00"),
      event(4, "2099-03-01 10:00:00", { status_id: 3 }), event(5, ""),
    ]);
    expect(screen.getAllByRole("button", { name: /^Show / }).map(b => b.getAttribute("aria-label"))).toEqual(["Show Event 3", "Show Event 1"]);
  });

  it("links each event to its page and says when it is full", async () => {
    await renderWith([event(7, "2099-01-01 10:00:00", { customer_ids: Array.from({ length: 10 }, (_, i) => i) })]);
    expect(screen.getByRole("link", { name: "View event" }).getAttribute("href")).toBe("events.html?id=7");
    expect(screen.getByText("Full")).toBeTruthy();
  });

  it("renders nothing when there are no upcoming events", async () => {
    await renderWith([event(1, "2000-01-01 10:00:00")]);
    expect(screen.queryByRole("region", { name: "Upcoming events" })).toBeNull();
  });
});
