// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminPage } from "./AdminPages";
import { AdminDashboard } from "./AdminDashboard";

vi.mock("../../services/session", () => ({
  watchSession: vi.fn((callback: (session: unknown, error: Error | null) => void) => {
    callback({ user: { name: "Admin", is_admin: true }, expiresAt: 4_102_444_800 }, null);
    return () => {};
  }),
  signOut: vi.fn(),
}));

const customers = [
  { customer_id: 1, customer_code: "LPVR001", first_name: "Emily", last_name: "Roy", email: "emily@example.com", phone: "514-555-0201", address: "12 Rue Test", order_count: 1, appointment_count: 1 },
  { customer_id: 2, customer_code: "LPVR002", first_name: "Liam", last_name: "Bouchard", email: "liam@example.com", phone: "", address: "", order_count: 0, appointment_count: 0 },
];
const events = [
  { event_id: 3, name: "Fall Ride", participant_limit: 10, customer_ids: [1, 2], description: "Scenic", location: "Parc", event_date_time: "2026-11-27 09:00:00", status_id: 1, image_path: null },
  { event_id: 4, name: "Old Ride", participant_limit: 5, customer_ids: [], description: "", location: "", event_date_time: "2026-11-19 10:00:00", status_id: 3, image_path: "/uploads/" + "b".repeat(32) + ".png" },
];
const appointments = [
  { appointment_id: 5, customer_id: 1, customer_code: "LPVR001", customer_name: "Emily Roy", appointment_time: "2026-11-17 10:30:00", description: "Winter bike prep", status_id: 1 },
];
const orders = [
  { order_id: 7, order_date: "2026-11-03 15:30:00", total_amount: 144.93, paid: true, customer_id: 1, customer_name: "Emily Roy", status_id: 2 },
  { order_id: 8, order_date: "2026-11-12 17:00:00", total_amount: 159.93, paid: false, customer_id: 2, customer_name: "Liam Bouchard", status_id: 1 },
  { order_id: 6, order_date: "2026-10-02 10:15:00", total_amount: 50, paid: true, customer_id: 2, customer_name: "Liam Bouchard", status_id: 1 },
];
const payments = [
  { payment_id: 1, order_id: 7, payment_date: "2026-11-03 15:33:00", amount: 144.93, payment_method: "Credit Card", paid_status: true, status_id: 2, customer_name: "Emily Roy" },
  { payment_id: 2, order_id: 6, payment_date: "2026-10-02 10:18:00", amount: 50, payment_method: "Debit Card", paid_status: true, status_id: 2, customer_name: "Liam Bouchard" },
];
const items = [
  { item_id: 1, name: "Chain", price: 5, brand: "Acme", category: "Parts", description: "Bike chain", stock_quantity: 3, image_path: null },
  { item_id: 2, name: "Pump", price: 9, brand: "", category: "Tools", description: "", stock_quantity: null, image_path: null },
];

type Reply = { status?: number; body?: object };
let overrides: Record<string, Reply> = {};

function ok(body: object, status = 200) {
  return { ok: status < 400, status, json: async () => ({ status: status < 400 ? "ok" : "error", ...body }) };
}

function setupFetch() {
  const fetch = vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const override = overrides[`${method} ${path}`];
    if (override) return ok(override.body ?? {}, override.status ?? 200);
    if (method === "GET") {
      if (path === "/api/admin/customers") return ok({ customers });
      if (path === "/api/admin/appointments") return ok({ appointments });
      if (path === "/api/events") return ok({ events });
      if (path === "/api/dashboard") return ok({ orders, payments });
      if (path === "/api/inventory") return ok({ items });
      if (path === "/api/admin/inventory-history") return ok({ history: [] });
    }
    if (method === "POST" && path === "/api/events") return ok({ event_id: 9 }, 201);
    if (method === "POST" && path === "/api/uploads") return ok({ image_path: "/uploads/" + "c".repeat(32) + ".png" }, 201);
    if (method === "POST" && path === "/api/admin/appointments") return ok({ appointment: { ...appointments[0], appointment_id: 6 } }, 201);
    return ok({});
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function calls(fetch: ReturnType<typeof setupFetch>, method: string, path: string) {
  return fetch.mock.calls.filter(([url, init]) => url === path && (init?.method ?? "GET") === method);
}

beforeEach(() => { overrides = {}; });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("admin shell", () => {
  it("lists the sections in the agreed order and highlights the current one", async () => {
    setupFetch();
    render(<AdminPage page="events" />);
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual([
      "Dashboard", "Customers", "Events", "Appointments", "Orders", "Payments", "Inventory",
    ]);
    expect(within(nav).getByRole("link", { name: "Events" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("Admin", { selector: ".adm-account-name" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
    // The shop's brand lockup, then the account card, then the menu; no "Manage" heading.
    const side = screen.getByRole("complementary", { name: "Admin navigation" });
    expect(Array.from(side.children).map(child => child.className || child.tagName)).toEqual(["adm-brand nav-brand", "adm-account", "NAV"]);
    expect(within(side).getByRole("link", { name: "LE PETIT VÉLO ROUGE admin dashboard" }).getAttribute("href")).toBe("/views/admin/index.html");
    expect(screen.queryByText("Manage")).toBeNull();
    await screen.findByRole("button", { name: "Fall Ride" });
  });

  it("serves the old items address as the inventory page", async () => {
    setupFetch();
    render(<AdminPage page="items" />);
    expect(screen.getByRole("heading", { name: "Inventory" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Chain" })).toBeTruthy();
  });
});

describe("dashboard", () => {
  it("shows this month's figures and a weekly table of events and appointments", async () => {
    setupFetch();
    render(<AdminDashboard today={new Date(2026, 10, 22)} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dashboard November 2026");
    const kpi = (label: string) => screen.getByRole("link", { name: new RegExp(`^${label}: `) });
    const value = (label: string) => within(kpi(label)).getByText(/./, { selector: ".adm-kpi-value" }).textContent;
    expect(await screen.findByRole("link", { name: /^Customers: / })).toBeTruthy();
    expect(kpi("Pending orders").getAttribute("href")).toBe("orders.html");
    expect(value("Customers")).toBe("2");
    expect(value("Paid revenue")).toBe("$144.93 CAD"); // October's payment is left out
    expect(value("Pending orders")).toBe("1");
    expect(value("Upcoming events")).toBe("1");

    expect(screen.getByText("Nov 16 – 22, 2026 · 1 event, 1 appointment")).toBeTruthy();
    const tuesday = screen.getByRole("rowheader", { name: /Tuesday/ }).closest("[role=row]") as HTMLElement;
    const appointment = within(tuesday).getByRole("link", { name: /Appointment: Winter bike prep, Emily Roy/ });
    expect(appointment.getAttribute("href")).toBe("appointments.html?id=5");
    const thursday = screen.getByRole("rowheader", { name: /Thursday/ }).closest("[role=row]") as HTMLElement;
    expect(within(thursday).getByRole("link", { name: /Event: Old Ride/ }).className).toContain("adm-cancelled");
    expect(within(screen.getByRole("rowheader", { name: /Sunday/ })).getByText("Today")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Nov 23 – 29, 2026 · 1 event, 0 appointments")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Event: Fall Ride/ }).getAttribute("href")).toBe("events.html?id=3");
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByText(/Nov 16 – 22, 2026/)).toBeTruthy();
  });

  it("shows what is next, what needs attention and month-by-month trends", async () => {
    setupFetch();
    overrides["GET /api/admin/inventory-history"] = { body: { history: [
      { item_id: 1, old_quantity: null, new_quantity: 10, created_at: "2026-09-01 09:00:00" },
      { item_id: 1, old_quantity: 10, new_quantity: 7, created_at: "2026-11-02 10:00:00" },
    ] } };
    render(<AdminDashboard today={new Date(2026, 10, 22)} />);
    const next = await screen.findByRole("region", { name: "Next up" });
    expect(within(next).getByRole("link", { name: /Fall Ride/ }).getAttribute("href")).toBe("events.html?id=3");
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByRole("link", { name: /2 pending orders/ }).getAttribute("href")).toBe("orders.html");
    const stock = screen.getByRole("figure", { name: "Units in stock" });
    expect(within(stock).getByRole("img", { name: "Units in stock, by month" })).toBeTruthy();
    const rows = within(stock).getAllByRole("row").slice(1).map(row => row.textContent);
    expect(rows.slice(-3)).toEqual(["September 202610", "October 202610", "November 20267"]);
    fireEvent.click(screen.getByRole("button", { name: "Last 12 months" }));
    expect(within(screen.getByRole("figure", { name: "Orders" })).getAllByRole("row")).toHaveLength(13);
    delete overrides["GET /api/admin/inventory-history"];
  });

  it("reports a loading failure and retries", async () => {
    const fetch = setupFetch();
    overrides["GET /api/dashboard"] = { status: 500, body: { message: "Database unavailable." } };
    render(<AdminDashboard today={new Date(2026, 10, 22)} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Database unavailable.");
    delete overrides["GET /api/dashboard"];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /^Customers: / })).toBeTruthy();
    expect(calls(fetch, "GET", "/api/dashboard")).toHaveLength(2);
  });
});

describe("view-and-delete modules", () => {
  it("lets the admin view and delete customers but not add or edit them", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="customers" />);
    await screen.findByRole("button", { name: "Emily Roy" });
    expect(screen.queryByRole("button", { name: "Add New" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Emily Roy" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "This record can’t be deleted" })).toBeTruthy();
    expect(within(dialog).getByText(/still has 1 order and 1 appointment/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Delete record" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Edit details" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete Liam Bouchard" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(calls(fetch, "DELETE", "/api/admin/customers/2")).toHaveLength(1));
    expect((await screen.findByText("Liam Bouchard deleted.")).closest("[role=status]")).toBeTruthy();
  });

  it("shows orders with payment state and confirms before deleting", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="orders" />);
    const row = (await screen.findByRole("button", { name: "#7" })).closest("[role=row]") as HTMLElement;
    expect(within(row).getByText("Emily Roy")).toBeTruthy();
    expect(within(row).getByText("Paid")).toBeTruthy();
    expect(within(row).getByText("$144.93 CAD")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add New" })).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "#7" }));
    expect(within(screen.getByRole("dialog")).getByText("#1 · Credit Card · Completed")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(screen.getByText(/its line items and 1 payment\. Stock is not put back\. This can’t be undone\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(calls(fetch, "DELETE", "/api/orders/7")).toHaveLength(1));
  });

  it("filters payments by status and search", async () => {
    setupFetch();
    render(<AdminPage page="payments" />);
    await screen.findByRole("button", { name: "#1" });
    expect(screen.getByText("Showing 1–2 of 2 payments")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(screen.getByText("No payments found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.change(screen.getByLabelText("Search payments"), { target: { value: "liam" } });
    expect(screen.queryByRole("button", { name: "#1" })).toBeNull();
    expect(screen.getByRole("button", { name: "#2" })).toBeTruthy();
  });
});

describe("editable modules", () => {
  it("validates, uploads an image and creates an event", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="events" />);
    await screen.findByRole("button", { name: "Fall Ride" });
    fireEvent.click(screen.getByRole("button", { name: "Add New" }));
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(screen.getByText("Enter the event name.")).toBeTruthy();
    expect(screen.getByText("Choose the event date and time.")).toBeTruthy();
    expect(calls(fetch, "POST", "/api/events")).toHaveLength(0);

    const tooBig = new File([new Uint8Array(3 * 1024 * 1024)], "huge.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image"), { target: { files: [tooBig] } });
    expect(screen.getByText("This image is 3.0 MB. Choose one up to 2 MB.")).toBeTruthy();
    const photo = new File(["png"], "ride.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image"), { target: { files: [photo] } });
    expect((await screen.findByAltText("Preview of the selected image")).getAttribute("src")).toBe("/uploads/" + "c".repeat(32) + ".png");
    expect(calls(fetch, "POST", "/api/uploads")[0][1]?.body).toBe(photo);

    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: " Family Day " } });
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: "2026-12-05T10:00" } });
    fireEvent.change(screen.getByLabelText(/Participant limit/), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(calls(fetch, "POST", "/api/events")).toHaveLength(1));
    expect(JSON.parse(String(calls(fetch, "POST", "/api/events")[0][1]?.body))).toEqual({
      image_path: "/uploads/" + "c".repeat(32) + ".png", name: "Family Day", event_date_time: "2026-12-05 10:00:00",
      location: "", participant_limit: 35, description: "", status_id: 1,
    });
    expect(await screen.findByText("New event created.")).toBeTruthy();
  });

  it("sends only the changed event fields and keeps the limit above registrations", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="events" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fall Ride" }));
    fireEvent.change(screen.getByLabelText(/Participant limit/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("The limit can’t be lower than the 2 people already registered.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Participant limit/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls(fetch, "PATCH", "/api/events/3")).toHaveLength(1));
    expect(JSON.parse(String(calls(fetch, "PATCH", "/api/events/3")[0][1]?.body))).toEqual({ participant_limit: 12, status_id: 2 });
  });

  it("shows server errors in the panel without losing the form", async () => {
    setupFetch();
    overrides["PATCH /api/events/3"] = { status: 400, body: { message: "Event date must look like 2026-11-27 09:00:00." } };
    render(<AdminPage page="events" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fall Ride" }));
    fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: "Fall Ride 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Event date must look like 2026-11-27 09:00:00.");
    expect((screen.getByLabelText(/Event name/) as HTMLInputElement).value).toBe("Fall Ride 2");
  });

  it("creates an appointment for a known customer ID", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="appointments" />);
    await screen.findByRole("button", { name: "Winter bike prep" });
    fireEvent.click(screen.getByRole("button", { name: "Add New" }));
    fireEvent.change(screen.getByLabelText(/Customer ID/), { target: { value: "lpvr009" } });
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: "2026-11-24T12:00" } });
    fireEvent.change(screen.getByLabelText(/Service/), { target: { value: "Tune-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Create appointment" }));
    expect(screen.getByText("No customer has the ID LPVR009.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Customer ID/), { target: { value: "lpvr002" } });
    fireEvent.click(screen.getByRole("button", { name: "Create appointment" }));
    await waitFor(() => expect(calls(fetch, "POST", "/api/admin/appointments")).toHaveLength(1));
    expect(JSON.parse(String(calls(fetch, "POST", "/api/admin/appointments")[0][1]?.body))).toEqual({
      customer_code: "LPVR002", appointment_time: "2026-11-24 12:00:00", description: "Tune-up", status_id: 1,
    });
  });

  it("filters inventory by stock and records the reason with a stock change", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="inventory" />);
    await screen.findByRole("button", { name: "Chain" });
    expect(screen.getByText("Only 3 left")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Not tracked/ }));
    expect(screen.queryByRole("button", { name: "Chain" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Chain" }));
    fireEvent.change(screen.getByLabelText(/Stock quantity/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Reason for stock change/), { target: { value: "Restock" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls(fetch, "PATCH", "/api/inventory/1")).toHaveLength(1));
    expect(JSON.parse(String(calls(fetch, "PATCH", "/api/inventory/1")[0][1]?.body))).toEqual({ stock_quantity: 20, reason: "Restock" });
  });

  it("pages through 15 records at a time", async () => {
    setupFetch();
    const many = Array.from({ length: 16 }, (_, index) => ({ ...items[0], item_id: index + 1, name: `Part ${String(index + 1).padStart(2, "0")}` }));
    overrides["GET /api/inventory"] = { body: { items: many } };
    render(<AdminPage page="inventory" />);
    await screen.findByRole("button", { name: "Part 01" });
    expect(screen.getByText("Showing 1–15 of 16 inventory")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Part 16" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByRole("button", { name: "Part 16" })).toBeTruthy();
    expect(screen.getByText("Showing 16–16 of 16 inventory")).toBeTruthy();
  });

  it("opens the record named in the address, as the dashboard links do", async () => {
    setupFetch();
    window.history.replaceState({}, "", "/views/admin/events.html?id=4");
    render(<AdminPage page="events" />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Old Ride" })).toBeTruthy();
    expect(within(dialog).getByAltText("Image of Old Ride").getAttribute("src")).toBe(events[1].image_path);
  });
});
