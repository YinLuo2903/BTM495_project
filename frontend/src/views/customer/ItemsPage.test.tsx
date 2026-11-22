// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ItemsPage, matchesSearch, stockStatus } from "./ItemsPage";
import { CART_CHANGE_EVENT } from "../../services/cart";
import type { Item } from "../../services/api";

const TOKEN = "a".repeat(43);

function item(id: number, overrides: Partial<Item> = {}): Item {
  return { item_id: id, name: `Item ${id}`, description: `Description ${id}`, price: 10 + id, category: id % 2 ? "Tools" : "Parts", brand: "Acme", stock_quantity: 20, ...overrides };
}

const CATALOGUE = [
  item(1, { name: "Road Bike Carbon", category: "Bikes", price: 2199, stock_quantity: 2 }),
  item(2, { name: "Floor Pump", category: "Tools", price: 49, stock_quantity: 0 }),
  item(3, { name: "Disc Brake Pads", category: "Components", price: 24.95, stock_quantity: 50 }),
  ...Array.from({ length: 9 }, (_, index) => item(index + 4)),
]; // 12 items → 2 pages

type Reply = { status?: number; body: object };
function mockFetch(handler: (url: string, method: string, body: unknown) => Reply | undefined = () => undefined, cart = { items: [] as object[], count: 0 }) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    const reply = handler(url, method, body)
      ?? (url === "/api/inventory" ? { body: { status: "ok", items: CATALOGUE } }
        : url === "/api/my-cart" && method === "GET" ? { body: { status: "ok", ...cart } }
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
  vi.useRealTimers();
});

function signIn() {
  localStorage.setItem("lpvr.session", JSON.stringify({ token: TOKEN, expiresAt: 4_102_444_800 }));
}

const row = (name: string) => screen.getByRole("link", { name }).closest("li")!;

describe("item helpers", () => {
  it("matches name or category, case-insensitively, but not brand", () => {
    const pads = CATALOGUE[2];
    expect(matchesSearch(pads, "  BRAKE ")).toBe(true);
    expect(matchesSearch(pads, "component")).toBe(true);
    expect(matchesSearch(pads, "acme")).toBe(false);
    expect(matchesSearch(pads, "")).toBe(true);
  });

  it("describes stock levels", () => {
    expect(stockStatus(null)).toEqual({ label: "In stock", tone: "in" });
    expect(stockStatus(0)).toEqual({ label: "Out of stock", tone: "out" });
    expect(stockStatus(4)).toEqual({ label: "Only 4 left", tone: "low" });
    expect(stockStatus(12)).toEqual({ label: "12 in stock", tone: "in" });
  });
});

describe("ItemsPage", () => {
  it("lists the first 10 items with price, stock and category", async () => {
    mockFetch();
    render(<ItemsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Browse Items" })).toBeTruthy();
    await screen.findByRole("link", { name: "Road Bike Carbon" });

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("12 items")).toBeTruthy();
    const bike = row("Road Bike Carbon");
    expect(within(bike).getByText("$2,199.00 CAD")).toBeTruthy();
    expect(within(bike).getByText("Only 2 left")).toBeTruthy();
    expect(within(bike).getByText("Bikes")).toBeTruthy();
    const pump = within(row("Floor Pump")).getByRole("button");
    expect(pump.textContent).toBe("Out of stock, Floor Pump");
    expect(pump.matches(":disabled")).toBe(true);
  });

  it("paginates 10 per page and resets to page 1 on a new search", async () => {
    mockFetch();
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    expect(screen.getByText("Showing 1–10 of 12 items")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous" }).matches(":disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 11–12 of 12 items")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Next" }).matches(":disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Search items by name or category"), { target: { value: "item" } });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getByText("Showing 1–9 of 9 items")).toBeTruthy();
  });

  it("shows No items found with a way to clear the search", async () => {
    mockFetch();
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    const search = screen.getByLabelText("Search items by name or category") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "carbon wheel" } });

    expect(screen.getByRole("heading", { name: "No items found" })).toBeTruthy();
    expect(screen.getByText("0 items")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Item pages" })).toBeNull();
    // Two ways to clear: the × inside the field and the button in the empty state.
    expect(screen.getAllByRole("button", { name: "Clear search" })).toHaveLength(2);
    const emptyState = screen.getByRole("heading", { name: "No items found" }).parentElement!;
    fireEvent.click(within(emptyState).getByRole("button", { name: "Clear search" }));
    expect(search.value).toBe("");
    expect(screen.queryAllByRole("button", { name: "Clear search" })).toHaveLength(0);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("adds to the cart, confirms it, and updates the cart count", async () => {
    signIn();
    const counts: number[] = [];
    const onChange = (event: Event) => counts.push((event as CustomEvent<{ count: number }>).detail.count);
    window.addEventListener(CART_CHANGE_EVENT, onChange);
    const fetchMock = mockFetch((url, method, body) => url === "/api/my-cart" && method === "POST"
      ? { body: { status: "ok", message: "Disc Brake Pads added to your shopping cart.", items: [{ item_id: 3, quantity: 1 }], count: 3, total: 24.95 } }
      : undefined);
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Disc Brake Pads" });

    fireEvent.click(screen.getByRole("button", { name: "Add to Cart, Disc Brake Pads" }));

    expect(await screen.findByText("Disc Brake Pads added to your shopping cart.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View shopping cart" }).getAttribute("href")).toBe("cart.html");
    expect(within(row("Disc Brake Pads")).getByRole("button").textContent).toBe("Added, Disc Brake Pads");
    expect(within(row("Disc Brake Pads")).getByText("1 in your cart")).toBeTruthy();
    expect(counts).toEqual([3]);
    const post = fetchMock.mock.calls.find(([url, options]) => url === "/api/my-cart" && options?.method === "POST");
    expect(JSON.parse(String(post![1]!.body))).toEqual({ item_id: 3, quantity: 1 });
    window.removeEventListener(CART_CHANGE_EVENT, onChange);
  });

  it("stops adding once the cart holds all available stock", async () => {
    signIn();
    mockFetch(undefined, { items: [{ item_id: 1, quantity: 2 }], count: 2 });
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    await waitFor(() => expect(within(row("Road Bike Carbon")).getByRole("button").textContent).toBe("Max in cart, Road Bike Carbon"));
    expect(within(row("Road Bike Carbon")).getByRole("button").matches(":disabled")).toBe(true);
  });

  it("sends one request for a double-click and blocks other adds meanwhile", async () => {
    signIn();
    let finish!: () => void;
    const fetchMock = mockFetch();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options: RequestInit = {}) => {
      if (url === "/api/my-cart" && options.method === "POST") {
        await new Promise<void>(resolve => { finish = resolve; });
        return { ok: true, status: 200, json: async () => ({ status: "ok", message: "", items: [{ item_id: 3, quantity: 1 }], count: 1 }) };
      }
      return base(url, options);
    });
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Disc Brake Pads" });
    const button = screen.getByRole("button", { name: "Add to Cart, Disc Brake Pads" });
    fireEvent.click(button);
    fireEvent.click(button); // same tick: React has not re-rendered yet
    expect(within(row("Road Bike Carbon")).getByRole("button").matches(":disabled")).toBe(true);
    await act(async () => { finish(); });
    expect(fetchMock.mock.calls.filter(([url, options]) => url === "/api/my-cart" && options?.method === "POST")).toHaveLength(1);
    expect(within(row("Road Bike Carbon")).getByRole("button").matches(":disabled")).toBe(false);
  });

  it("shows the server's message when the stock limit is hit", async () => {
    signIn();
    mockFetch((url, method) => url === "/api/my-cart" && method === "POST"
      ? { status: 409, body: { status: "error", message: "Your cart already has 2 of Road Bike Carbon; only 2 in stock.", items: [], count: 2 } }
      : undefined);
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Cart, Road Bike Carbon" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your cart already has 2 of Road Bike Carbon; only 2 in stock.");
  });

  it("asks guests to sign in instead of adding", async () => {
    const fetchMock = mockFetch();
    render(<ItemsPage />);
    await screen.findByRole("link", { name: "Disc Brake Pads" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Cart, Disc Brake Pads" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign in with a customer account to add items to your shopping cart.");
    expect(within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("login.html");
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/my-cart")).toBe(false);
  });

  it("reports when items cannot be loaded", async () => {
    mockFetch(url => url === "/api/inventory" ? { status: 500, body: { status: "error", message: "Database error." } } : undefined);
    render(<ItemsPage />);
    expect((await screen.findByRole("alert")).textContent).toBe("Could not load items: Database error.");
  });
});
