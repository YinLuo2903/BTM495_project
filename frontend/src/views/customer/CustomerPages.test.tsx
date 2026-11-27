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

  it("renders item detail from the URL with a working Add to Cart", async () => {
    window.history.replaceState({}, "", "/views/customer/item.html?id=1");
    mockResponse({ status: "ok", items: [item] });
    render(<CustomerPage page="item" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Chain" })).toBeTruthy();
    expect(screen.getByText("Bike chain")).toBeTruthy();
    expect(screen.getByText("$5.00 CAD")).toBeTruthy();
    expect(screen.getByText("Only 3 left")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to Cart, Chain" }).matches(":disabled")).toBe(false);
    expect(screen.getByRole("link", { name: "← Back to items" }).getAttribute("href")).toBe("items.html");
    expect(screen.getByRole("link", { name: "View shopping cart" }).getAttribute("href")).toBe("cart.html");
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
    expect((await screen.findByRole("alert")).textContent).toBe("Could not load items: Inventory unavailable.");
    expect(screen.queryByRole("heading", { name: "No items found" })).toBeNull();
  });

  it("renders the appointment booking page with Continue disabled until a slot is chosen", async () => {
    mockResponse({ status: "ok", today: "2026-11-21", slots: [], slot_minutes: 60, open_weekdays: [], days: [] });
    render(<CustomerPage page="appointments" />);
    expect(screen.getByRole("heading", { level: 1, name: "Book a Repair Appointment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" }).matches(":disabled")).toBe(true);
    await screen.findByText("Choose an available date on the calendar to see open times.");
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

  it("fills in the demo admin or customer account and signs in with it", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", user: { name: "Admin", is_admin: true }, token: "a".repeat(43), expires_at: 4_102_444_800 }) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<CustomerPage page="login" />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Password", { selector: "input" }) as HTMLInputElement;
    expect([email.value, password.value]).toEqual(["login@example.com", "1234"]);

    fireEvent.click(screen.getByRole("button", { name: "Fill in admin" }));
    expect([email.value, password.value]).toEqual(["admin@lpvr.com", "123456789"]);
    expect(document.activeElement?.textContent).toBe("Sign in");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/views/admin/index.html"));
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ email: "admin@lpvr.com", password: "123456789" });

    fireEvent.click(screen.getByRole("button", { name: "Fill in customer" }));
    expect([email.value, password.value]).toEqual(["login@example.com", "1234"]);
  });
});
