// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CartPage } from "./CartPage";
import { ItemDetailPage } from "./ItemDetailPage";
import { announceCart, type CartSummary } from "../../services/cart";

const TOKEN = "a".repeat(43);
const CART: CartSummary = {
  items: [
    { item_id: 2, name: "Road Bike Carbon", category: "Bikes", price: 2199, quantity: 1, subtotal: 2199, stock_quantity: 4 },
    { item_id: 9, name: "Disc Brake Pads", category: "Components", price: 24.95, quantity: 2, subtotal: 49.9, stock_quantity: 50 },
  ],
  count: 3,
  total: 2248.9,
};
const PADS = { item_id: 9, name: "Disc Brake Pads", description: "Semi-metallic replacement pads", price: 24.95, category: "Components", brand: "SRAM", stock_quantity: 50 };

function mockFetch(handler: (url: string, method: string) => { status?: number; body: object } | undefined) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    const reply = handler(url, options.method ?? "GET") ?? { status: 404, body: { status: "error", message: "Not found." } };
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
  window.history.replaceState({}, "", "/");
});

const signIn = () => localStorage.setItem("lpvr.session", JSON.stringify({ token: TOKEN, expiresAt: 4_102_444_800 }));

describe("CartPage", () => {
  it("lists what the customer added, with quantities, subtotals and the total", async () => {
    signIn();
    mockFetch(url => url === "/api/my-cart" ? { body: { status: "ok", ...CART } } : undefined);
    render(<CartPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Shopping Cart" })).toBeTruthy();

    const bike = (await screen.findByRole("link", { name: "Road Bike Carbon" })).closest("li")!;
    expect(screen.getByRole("link", { name: "Road Bike Carbon" }).getAttribute("href")).toBe("item.html?id=2");
    expect(within(bike).getByText("Qty 1 × $2,199.00 CAD")).toBeTruthy();
    const pads = screen.getByRole("link", { name: "Disc Brake Pads" }).closest("li")!;
    expect(within(pads).getByText("Qty 2 × $24.95 CAD")).toBeTruthy();
    expect(within(pads).getByText("$49.90 CAD")).toBeTruthy();

    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("3 items")).toBeTruthy();
    expect(within(summary).getByText("$2,248.90 CAD")).toBeTruthy();
    expect(within(summary).getByRole("button", { name: "Checkout" }).matches(":disabled")).toBe(true);
  });

  it("shows an empty cart with a link back to the items", async () => {
    signIn();
    mockFetch(url => url === "/api/my-cart" ? { body: { status: "ok", items: [], count: 0, total: 0 } } : undefined);
    render(<CartPage />);
    expect(await screen.findByRole("heading", { name: "Your shopping cart is empty" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse items" }).getAttribute("href")).toBe("items.html");
  });

  it("asks guests to sign in", async () => {
    const fetchMock = mockFetch(() => undefined);
    render(<CartPage />);
    expect(await screen.findByRole("heading", { name: "Sign in to see your shopping cart" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("login.html");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports errors and follows cart changes", async () => {
    signIn();
    mockFetch(url => url === "/api/my-cart" ? { status: 500, body: { status: "error", message: "Could not update your cart." } } : undefined);
    render(<CartPage />);
    expect((await screen.findByRole("alert")).textContent).toBe("Could not load your shopping cart: Could not update your cart.");
    act(() => announceCart(CART));
    expect(screen.getByRole("link", { name: "Road Bike Carbon" })).toBeTruthy();
  });
});

describe("ItemDetailPage", () => {
  it("adds the item to the shopping cart", async () => {
    signIn();
    window.history.replaceState({}, "", "/views/customer/item.html?id=9");
    const fetchMock = mockFetch((url, method) =>
      url === "/api/inventory" ? { body: { status: "ok", items: [PADS] } }
      : url === "/api/my-cart" && method === "GET" ? { body: { status: "ok", items: [], count: 0, total: 0 } }
      : url === "/api/my-cart" && method === "POST" ? { body: { status: "ok", message: "", items: [{ ...CART.items[1], quantity: 1, subtotal: 24.95 }], count: 1, total: 24.95 } }
      : undefined);
    render(<ItemDetailPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Disc Brake Pads" })).toBeTruthy();
    expect(screen.getByText("by SRAM")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add to Cart, Disc Brake Pads" }));
    expect(await screen.findByText("Disc Brake Pads added to your shopping cart.")).toBeTruthy();
    expect(screen.getByText("1 in your cart")).toBeTruthy();
    const post = fetchMock.mock.calls.find(([url, options]) => url === "/api/my-cart" && options?.method === "POST");
    expect(JSON.parse(String(post![1]!.body))).toEqual({ item_id: 9, quantity: 1 });
  });

  it("disables Add to Cart for an out-of-stock item", async () => {
    window.history.replaceState({}, "", "/views/customer/item.html?id=9");
    mockFetch(url => url === "/api/inventory" ? { body: { status: "ok", items: [{ ...PADS, stock_quantity: 0 }] } } : undefined);
    render(<ItemDetailPage />);
    const button = await screen.findByRole("button", { name: "Out of stock, Disc Brake Pads" });
    expect(button.matches(":disabled")).toBe(true);
  });
});
