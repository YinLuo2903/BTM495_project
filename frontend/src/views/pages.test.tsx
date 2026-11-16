// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signIn } from "../services/session";
import { CustomerPage } from "./customer/CustomerPages";
import { AdminPage } from "./admin/AdminPages";

vi.mock("../services/session", () => ({ signIn: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function response(data: object) {
  return { ok: true, status: 200, json: async () => ({ status: "ok", ...data }) };
}

describe("customer pages", () => {
  it("keeps signup unavailable", () => {
    render(<CustomerPage page="signup" />);
    expect(screen.getByRole("button", { name: "Create account" }).matches(":disabled")).toBe(true);
    expect(screen.getByText(/Account creation is not available/)).toBeTruthy();
  });

  it("filters inventory by name and category", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ items: [
      { item_id: 1, name: "Chain", price: 5, brand: "Acme", category: "Parts" },
      { item_id: 2, name: "Pump", price: 9, brand: "Acme", category: "Tools" },
    ] })));
    render(<CustomerPage page="items" />);
    await screen.findByRole("link", { name: "Chain" });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Tools" } });
    expect(screen.queryByRole("link", { name: "Chain" })).toBeNull();
    expect(screen.getByRole("link", { name: "Pump" }).getAttribute("href")).toBe("item.html?id=2");
    fireEvent.change(screen.getByLabelText("Search by name or brand"), { target: { value: "chain" } });
    expect(screen.getByText("No items found.")).toBeTruthy();
  });

  it("shows login progress and errors while preventing repeat submission", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(signIn).mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    render(<CustomerPage page="login" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password", { selector: "input" }), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password", { selector: "input" }) as HTMLInputElement).type).toBe("text");
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect((screen.getByRole("button", { name: "Signing in..." }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Signing in..." }).closest("form")!);
    expect(signIn).toHaveBeenCalledTimes(1);
    reject(new Error("Invalid credentials."));
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid credentials.");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("admin pages", () => {
  it("creates supported events and labels unavailable event details", async () => {
    const fetch = vi.fn(async (path: string, options: RequestInit) => {
      if (path === "/api/inventory") return response({ items: [] });
      if (path === "/api/dashboard") return response({ orders: [] });
      if (options.method === "POST") return response({ event_id: 1 });
      return response({ events: [] });
    });
    vi.stubGlobal("fetch", fetch);
    render(<AdminPage page="events" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Event editing, dates, locations, and prices are not supported/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Event name"), { target: { value: "Ride" } });
    fireEvent.change(screen.getByLabelText("Participant limit"), { target: { value: "4" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save event" }).closest("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/events", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Ride", participant_limit: 4 }),
    })));
  });

  it("clearly disables appointment management", () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ items: [], events: [], orders: [] })));
    render(<AdminPage page="appointments" />);
    expect((screen.getByRole("button", { name: "Add appointment" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports inventory loading errors without presenting an empty inventory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ status: "error", message: "Database unavailable." }) })));
    render(<AdminPage page="inventory" />);
    expect((await screen.findByRole("alert")).textContent).toBe("Database unavailable.");
    expect(screen.queryByText("No items yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
