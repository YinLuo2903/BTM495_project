// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdminPage } from "./AdminPages";

const items = [
  { item_id: 1, name: "Chain", price: 5, brand: "Acme", category: "Parts", description: "Bike chain", stock_quantity: 3 },
  { item_id: 2, name: "Pump", price: 9, brand: "", category: "Tools", description: "", stock_quantity: null },
];
const events = [{ event_id: 5, name: "Ride", participant_limit: 4, customer_ids: [1] }];
const orders = [{ order_id: 7, order_date: "2026-01-01", total_amount: 15, paid: true }];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setupFetch() {
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    let data: object = {};
    if (options.method === "GET") {
      if (path === "/api/inventory") data = { items };
      else if (path === "/api/events") data = { events };
      else if (path === "/api/dashboard") data = { orders };
      else if (path === "/api/inventory/1/history") data = { history: [{ createdAt: "Today", oldQuantity: 1, newQuantity: 3, adminId: null, reason: "Restock" }] };
    }
    return { ok: true, status: 200, json: async () => ({ status: "ok", ...data }) };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("admin widgets", () => {
  it("summarizes orders, low inventory, and events", async () => {
    setupFetch();
    render(<AdminPage page="index" />);
    expect(await screen.findByText("Total orders: 1")).toBeTruthy();
    expect(screen.getByText("Total items: 2")).toBeTruthy();
    expect(screen.getByText("Chain: 3 units")).toBeTruthy();
    expect(screen.getByText("Ride")).toBeTruthy();
  });

  it("filters inventory, displays history, edits and cancels edits", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="inventory" />);
    await screen.findByText("#1 Chain");
    fireEvent.change(screen.getByLabelText("Search items"), { target: { value: "chain" } });
    expect(screen.queryByText("#2 Pump")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText(/Today: 1 → 3; system; Restock/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Chain");
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "8" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save item" }).closest("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/inventory/1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "Chain", description: "Bike chain", category: "Parts", brand: "Acme", price: 8, stock_quantity: 3, reason: null }),
    })));
    await screen.findByRole("heading", { name: "Add item" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    expect(screen.getByRole("heading", { name: "Add item" })).toBeTruthy();
  });

  it("creates an item with untracked stock", async () => {
    const fetch = setupFetch();
    render(<AdminPage page="items" />);
    await screen.findByRole("heading", { name: "Add item" });
    fireEvent.change(screen.getByLabelText("Item ID"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cable" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "4" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save item" }).closest("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/inventory", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Cable", description: "", category: "", brand: "", price: 4, stock_quantity: null, reason: null, item_id: 9 }),
    })));
  });

  it("requires confirmation before deleting inventory", async () => {
    const fetch = setupFetch();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AdminPage page="inventory" />);
    const row = (await screen.findByText("#1 Chain")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(fetch).not.toHaveBeenCalledWith("/api/inventory/1", expect.objectContaining({ method: "DELETE" }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/inventory/1", expect.objectContaining({ method: "DELETE" })));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("deletes an event after confirmation", async () => {
    const fetch = setupFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPage page="events" />);
    await screen.findByText(/Ride \(1 \/ 4 registered\)/);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/events/5", expect.objectContaining({ method: "DELETE" })));
  });

  it("filters orders and confirms deleting one or all", async () => {
    const fetch = setupFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPage page="orders" />);
    await screen.findByText("#7");
    fireEvent.change(screen.getByLabelText("Search by order ID"), { target: { value: "8" } });
    expect(screen.queryByText("#7")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search by order ID"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/orders/7", expect.objectContaining({ method: "DELETE" })));
    fireEvent.click(screen.getByRole("button", { name: "Clear all orders" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ method: "DELETE" })));
  });

  it("shows a save error without discarding the entered event", async () => {
    const fetch = vi.fn(async (_path: string, options: RequestInit) => options.method === "POST"
      ? { ok: false, status: 400, json: async () => ({ status: "error", message: "Event rejected." }) }
      : { ok: true, status: 200, json: async () => ({ status: "ok", events: [] }) });
    vi.stubGlobal("fetch", fetch);
    render(<AdminPage page="events" />);
    const name = await screen.findByLabelText("Event name");
    fireEvent.change(name, { target: { value: "Ride" } });
    fireEvent.change(screen.getByLabelText("Participant limit"), { target: { value: "4" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save event" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("Event rejected.");
    expect((name as HTMLInputElement).value).toBe("Ride");
  });

  it("retries an initial inventory failure", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ status: "error", message: "Unavailable" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: "ok", items }) });
    vi.stubGlobal("fetch", fetch);
    render(<AdminPage page="inventory" />);
    expect((await screen.findByRole("alert")).textContent).toBe("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("#1 Chain")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
