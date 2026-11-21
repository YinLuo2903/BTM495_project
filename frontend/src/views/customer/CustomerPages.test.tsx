// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CustomerPage } from "./CustomerPages";

const item = { item_id: 1, name: "Chain", price: 5, brand: "Acme", category: "Parts", description: "Bike chain", stock_quantity: 3 };
const events = Array.from({ length: 4 }, (_, index) => ({
  event_id: index + 1, name: `Event ${index + 1}`, participant_limit: 4, customer_ids: [1, 2],
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

function mockResponse(body: object, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body })));
}

describe("customer widgets", () => {
  it("limits the home event widget and links to the full event list", async () => {
    mockResponse({ status: "ok", events });
    render(<CustomerPage page="index" />);
    expect(await screen.findByText("Event 1")).toBeTruthy();
    expect(screen.getByText("Event 3")).toBeTruthy();
    expect(screen.queryByText("Event 4")).toBeNull();
    expect(screen.getByRole("link", { name: "View all events" }).getAttribute("href")).toBe("events.html");
  });

  it("renders the events page and its empty and error states", async () => {
    mockResponse({ status: "ok", events });
    const view = render(<CustomerPage page="events" />);
    expect(await screen.findByRole("heading", { level: 2, name: "Event 1" })).toBeTruthy();
    expect(screen.getAllByText("Event 4")).toHaveLength(1);
    view.unmount();
    mockResponse({ status: "ok", events: [] });
    const empty = render(<CustomerPage page="events" />);
    expect(await screen.findByText("No events available.")).toBeTruthy();
    empty.unmount();
    mockResponse({ status: "error", message: "Events unavailable." }, false);
    render(<CustomerPage page="events" />);
    expect(await screen.findByText("Events unavailable.")).toBeTruthy();
  });

  it("renders item detail from the URL and disables add to cart", async () => {
    window.history.replaceState({}, "", "/views/customer/item.html?id=1");
    mockResponse({ status: "ok", items: [item] });
    render(<CustomerPage page="item" />);
    expect(await screen.findByRole("heading", { name: "Chain" })).toBeTruthy();
    expect(screen.getByText("Bike chain")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to cart" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Back to items" }).getAttribute("href")).toBe("items.html");
  });

  it.each([
    ["", "Choose an item from the items page."],
    ["?id=abc", "Choose an item from the items page."],
    ["?id=99", "Item not found."],
  ])("reports missing or invalid item %s", async (query, message) => {
    window.history.replaceState({}, "", `/views/customer/item.html${query}`);
    mockResponse({ status: "ok", items: [item] });
    render(<CustomerPage page="item" />);
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("shows inventory failures", async () => {
    mockResponse({ status: "error", message: "Inventory unavailable." }, false);
    render(<CustomerPage page="items" />);
    expect(await screen.findByText("Inventory unavailable.")).toBeTruthy();
    expect(screen.queryByText("No items found.")).toBeNull();
  });

  it.each([
    ["appointments", "Book appointment"],
    ["cart", "Checkout"],
    ["checkout", "Confirm order"],
  ])("keeps unavailable %s actions disabled", (page, button) => {
    render(<CustomerPage page={page} />);
    expect(screen.getByRole("button", { name: button }).matches(":disabled")).toBe(true);
  });

  it("shows unavailable order history", () => {
    render(<CustomerPage page="orders" />);
    expect(screen.getByText(/Personal order history/)).toBeTruthy();
  });

  it("toggles password visibility and accessible state", () => {
    render(<CustomerPage page="login" />);
    const input = screen.getByLabelText("Password", { selector: "input" });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.getAttribute("type")).toBe("password");
  });
});
