// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { signIn, signOut, watchSession } from "../../services/session";
import { DemoPage } from "./DemoPage";

vi.mock("../../services/session", () => ({ signIn: vi.fn(), signOut: vi.fn(), watchSession: vi.fn() }));
const item = { item_id: 1, name: "Chain", price: 5, brand: "", category: "", description: "", stock_quantity: 3 };
const order = { order_id: 7, order_date: "2026-01-01", total_amount: 15, paid: false };
const event = { event_id: 5, name: "Ride", participant_limit: 2, customer_ids: [1] };

beforeEach(() => {
  vi.mocked(watchSession).mockImplementation(callback => { callback(null, null); return () => {}; });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

function setupFetch() {
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    let data: object = { message: "Saved." };
    if (path === "/api/dashboard") data = { database: "test.db", tables: [{ name: "item", rows: 1 }], orders: [order], payments: [] };
    if (path === "/api/inventory" && options.method === "GET") data = { items: [item] };
    if (path === "/api/inventory/1/history") data = { history: [] };
    if (path === "/api/events" && options.method === "GET") data = { events: [event], customers: [{ customer_id: 1, name: "Pat" }] };
    if (path === "/api/payments") data = { payment: { paid_status: true } };
    return { ok: true, status: 200, json: async () => ({ status: "ok", ...data }) };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("loads dashboard, inventory, and event registration widgets", async () => {
  setupFetch();
  render(<DemoPage />);
  expect(await screen.findByText("Connected to test.db")).toBeTruthy();
  expect(screen.getByText("Database connected")).toBeTruthy();
  expect(await screen.findByText("Chain")).toBeTruthy();
  expect(await screen.findByRole("cell", { name: "#5 Ride" })).toBeTruthy();
  expect(screen.getByText("#1 Pat")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open customer views" }).getAttribute("href")).toBe("/views/customer/index.html");
});

it("logs in without navigating and handles logout", async () => {
  setupFetch();
  vi.mocked(signIn).mockResolvedValue({ name: "Pat", is_admin: false });
  vi.mocked(watchSession).mockImplementation(callback => {
    callback({ user: { name: "Pat", is_admin: false }, expiresAt: 123 }, null); return () => {};
  });

  render(<DemoPage />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
  fireEvent.change(screen.getByLabelText("Password", { selector: "input" }), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  expect(await screen.findByText("Signed in as Pat (Customer).")).toBeTruthy();
  expect((screen.getByLabelText("Password", { selector: "input" }) as HTMLInputElement).type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
});

it("fills in the demo admin and customer accounts", async () => {
  setupFetch();
  vi.mocked(signIn).mockResolvedValue({ name: "Admin", is_admin: true });
  render(<DemoPage />);
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  const password = screen.getByLabelText("Password", { selector: "input" }) as HTMLInputElement;
  fireEvent.click(screen.getByRole("button", { name: "Fill in admin" }));
  expect([email.value, password.value]).toEqual(["admin@lpvr.com", "123456789"]);
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  expect(await screen.findByText("Signed in as Admin (Admin).")).toBeTruthy();
  expect(signIn).toHaveBeenCalledWith("admin@lpvr.com", "123456789");
  fireEvent.click(screen.getByRole("button", { name: "Fill in customer" }));
  expect([email.value, password.value]).toEqual(["login@example.com", "1234"]);
});

it("shows login progress, rejects repeat submission and reports errors", async () => {
  setupFetch();
  let reject!: (error: Error) => void;
  vi.mocked(signIn).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<DemoPage />);
  const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(signIn).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Signing in..." }).matches(":disabled")).toBe(true);
  reject(new Error("Invalid credentials."));
  expect((await screen.findByRole("alert")).textContent).toBe("Invalid credentials.");
  expect(screen.getByRole("button", { name: "Sign in" }).matches(":disabled")).toBe(false);
});

it("edits inventory, loads history, and registers a customer", async () => {
  const fetch = setupFetch();
  render(<DemoPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit item #1" }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Chain");
  fireEvent.change(screen.getByLabelText("Stock"), { target: { value: "4" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save item" }).closest("form")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/inventory/1", expect.objectContaining({ method: "PATCH" })));
  expect(await screen.findByText("No stock changes recorded.")).toBeTruthy();
  await screen.findByRole("cell", { name: "#5 Ride" });
  fireEvent.change(screen.getByLabelText("Customer ID"), { target: { value: "2" } });
  fireEvent.submit(screen.getByRole("button", { name: "Register" }).closest("form")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/event-registrations", expect.objectContaining({
    method: "POST", body: JSON.stringify({ event_id: 5, customer_id: 2 }),
  })));
});

it("confirms and submits a mock payment", async () => {
  const fetch = setupFetch();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DemoPage />);
  await screen.findByText("Connected to test.db");
  fireEvent.click(screen.getByRole("button", { name: "Make a payment" }));
  const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Card number") as HTMLInputElement).value).toBe("4242424242424242");
  expect((within(dialog).getByLabelText("Expiration (MM/YY)") as HTMLInputElement).value).toBe("12/30");
  expect((within(dialog).getByLabelText("Security code") as HTMLInputElement).value).toBe("123");
  fireEvent.submit(within(dialog).getByRole("button", { name: "Review payment" }).closest("form")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/payments", expect.objectContaining({
    method: "POST", body: JSON.stringify({ order_id: 7, card_number: "4242424242424242", expiration_date: "12/30", cvv: "123" }),
  })));
  expect(await screen.findByText("Payment Successful")).toBeTruthy();
});

it("shows a declined payment without closing the dialog", async () => {
  const fetch = setupFetch();
  fetch.mockImplementation(async (path, options) => {
    if (path === "/api/payments") return { ok: true, status: 200, json: async () => ({ status: "ok", payment: { paid_status: false } }) };
    if (path === "/api/dashboard") return { ok: true, status: 200, json: async () => ({ status: "ok", database: "test.db", tables: [], orders: [order], payments: [] }) };
    return { ok: true, status: 200, json: async () => ({ status: "ok", items: [], events: [], customers: [] }) };
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DemoPage />);
  await screen.findByText("Connected to test.db");
  fireEvent.click(screen.getByRole("button", { name: "Make a payment" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.submit(within(dialog).getByRole("button", { name: "Review payment" }).closest("form")!);
  expect(await within(dialog).findByRole("alert")).toBeTruthy();
  expect(screen.getByText("Payment declined")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("creates a sample order when none are unpaid", async () => {
  let created = false;
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    let data: object = {};
    if (path === "/api/sample-orders") { created = true; data = { order }; }
    if (path === "/api/dashboard") data = { database: "test.db", tables: [], orders: created ? [order] : [], payments: [] };
    if (path === "/api/inventory") data = { items: [] };
    if (path === "/api/events" && options.method === "GET") data = { events: [], customers: [] };
    return { ok: true, status: 200, json: async () => ({ status: "ok", ...data }) };
  });
  vi.stubGlobal("fetch", fetch);
  render(<DemoPage />);
  await screen.findByText("Connected to test.db");
  fireEvent.click(screen.getByRole("button", { name: "Make a payment" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/api/sample-orders", expect.objectContaining({ method: "POST" }));
  expect(screen.getByRole("option", { name: /#7/ })).toBeTruthy();
});

it("requires confirmation for destructive actions and reports invalid order edits", async () => {
  const fetch = setupFetch();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(window, "prompt").mockReturnValue("not a number");
  render(<DemoPage />);
  await screen.findByText("Connected to test.db");
  fireEvent.click(screen.getByRole("button", { name: "Delete order #7" }));
  expect(fetch).not.toHaveBeenCalledWith("/api/orders/7", expect.objectContaining({ method: "DELETE" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit order #7" }));
  expect(screen.getByRole("alert").textContent).toBe("Enter a positive number.");
});

it("reports dashboard errors and offers refresh", async () => {
  const fetch = vi.fn(async (path: string) => {
    if (path === "/api/dashboard") return { ok: false, status: 500, json: async () => ({ status: "error", message: "Database unavailable." }) };
    return { ok: true, status: 200, json: async () => ({ status: "ok", items: [], events: [], customers: [] }) };
  });
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<DemoPage />);
  expect((await screen.findByRole("alert")).textContent).toBe("Database unavailable.");
  expect(screen.getByRole("button", { name: "Make a payment" }).matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  await waitFor(() => expect(fetch.mock.calls.filter(call => call[0] === "/api/dashboard")).toHaveLength(2));
});

it("allows deleting a registration and adding an event", async () => {
  const fetch = setupFetch();
  render(<DemoPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Unregister customer #1" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/event-registrations/5/1", expect.objectContaining({ method: "DELETE" })));
  fireEvent.click(screen.getByRole("button", { name: "Add sample event (limit 2)" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/events", expect.objectContaining({
    method: "POST", body: JSON.stringify({ name: "Community Ride", participant_limit: 2 }),
  })));
});
