// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CartPage, selectionTotals } from "./CartPage";
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
  it("lists each line with a quantity stepper and its line total only", async () => {
    signIn();
    mockFetch(url => url === "/api/my-cart" ? { body: { status: "ok", ...CART } } : undefined);
    render(<CartPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Shopping Cart" })).toBeTruthy();

    const bike = (await screen.findByRole("link", { name: "Road Bike Carbon" })).closest("li")!;
    expect(screen.getByRole("link", { name: "Road Bike Carbon" }).getAttribute("href")).toBe("item.html?id=2");
    expect(within(bike).getByText("$2,199.00 CAD")).toBeTruthy();
    expect(within(bike).getByText("Bikes")).toBeTruthy();
    expect(within(bike).queryByText(/left|in stock/)).toBeNull(); // remaining stock is not shown
    expect(screen.queryByText(/×/)).toBeNull(); // no "Qty 1 × price" breakdown
    const pads = screen.getByRole("link", { name: "Disc Brake Pads" }).closest("li")!;
    expect(within(within(pads).getByRole("group", { name: "Quantity, Disc Brake Pads" })).getByText("2")).toBeTruthy();
    expect(within(pads).getByText("$49.90 CAD")).toBeTruthy();
    // − is disabled at 1 (Remove is the way to drop a line).
    expect(screen.getByRole("button", { name: "Decrease quantity, Road Bike Carbon" }).matches(":disabled")).toBe(true);

    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("3 items")).toBeTruthy();
    expect(within(summary).getByText("$2,248.90 CAD")).toBeTruthy();
    expect(within(summary).getByRole("link", { name: "Checkout (3 items)" }).getAttribute("href")).toBe("checkout.html");
  });

  it("totals only the selected items and remembers the selection", async () => {
    signIn();
    mockFetch(url => url === "/api/my-cart" ? { body: { status: "ok", ...CART } } : undefined);
    const view = render(<CartPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    const selectAll = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(selectAll.checked).toBe(true);
    expect(screen.queryByText(/items selected/)).toBeNull(); // the summary shows the count

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Road Bike Carbon" }));
    expect(within(summary).getByText("2 items")).toBeTruthy();
    expect(within(summary).getByText("$49.90 CAD")).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);
    expect(localStorage.getItem("lpvr.cart.unselected")).toBe("[2]");

    fireEvent.click(selectAll); // some selected → select all
    expect(within(summary).getByText("$2,248.90 CAD")).toBeTruthy();
    fireEvent.click(selectAll); // all selected → none
    expect(within(summary).getByText("$0.00 CAD")).toBeTruthy();
    expect(within(summary).getByRole("button", { name: "Select items to check out" }).matches(":disabled")).toBe(true);

    view.unmount(); // the selection survives a reload
    render(<CartPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });
    expect(within(screen.getByRole("complementary", { name: "Order summary" })).getByText("$0.00 CAD")).toBeTruthy();
  });

  it("updates quantities and stops at the available stock", async () => {
    signIn();
    const atStock = { ...CART, items: [{ ...CART.items[0], quantity: 4, subtotal: 8796 }, CART.items[1]], count: 6, total: 8845.9 };
    const fetchMock = mockFetch((url, method) =>
      url === "/api/my-cart" ? { body: { status: "ok", ...CART } }
      : url === "/api/my-cart/9" && method === "PATCH" ? { body: { status: "ok", message: "", ...CART, items: [CART.items[0], { ...CART.items[1], quantity: 3, subtotal: 74.85 }], count: 4, total: 2273.85 } }
      : url === "/api/my-cart/2" && method === "PATCH" ? { body: { status: "ok", message: "", ...atStock } }
      : undefined);
    render(<CartPage />);
    await screen.findByRole("link", { name: "Disc Brake Pads" });

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity, Disc Brake Pads" }));
    const pads = () => screen.getByRole("link", { name: "Disc Brake Pads" }).closest("li")!;
    expect(await within(pads()).findByText("$74.85 CAD")).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([url, options]) => url === "/api/my-cart/9" && options?.method === "PATCH");
    expect(JSON.parse(String(patch![1]!.body))).toEqual({ quantity: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity, Road Bike Carbon" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Increase quantity, Road Bike Carbon" }).matches(":disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Increase quantity, Road Bike Carbon" }).getAttribute("title")).toBe("Maximum available quantity");
  });

  it("shows the server's message when a quantity is refused", async () => {
    signIn();
    mockFetch((url, method) =>
      url === "/api/my-cart" ? { body: { status: "ok", ...CART } }
      : url === "/api/my-cart/9" && method === "PATCH" ? { status: 409, body: { status: "error", message: "You already have the maximum available quantity of Disc Brake Pads.", ...CART } }
      : undefined);
    render(<CartPage />);
    await screen.findByRole("link", { name: "Disc Brake Pads" });
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity, Disc Brake Pads" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You already have the maximum available quantity of Disc Brake Pads.");
  });

  it("removes a line and shows the empty cart after the last one", async () => {
    signIn();
    const onlyPads = { items: [CART.items[1]], count: 2, total: 49.9 };
    const fetchMock = mockFetch((url, method) =>
      url === "/api/my-cart" ? { body: { status: "ok", ...CART } }
      : url === "/api/my-cart/2" && method === "DELETE" ? { body: { status: "ok", message: "", ...onlyPads } }
      : url === "/api/my-cart/9" && method === "DELETE" ? { body: { status: "ok", message: "", items: [], count: 0, total: 0 } }
      : undefined);
    render(<CartPage />);
    await screen.findByRole("link", { name: "Road Bike Carbon" });

    fireEvent.click(screen.getByRole("button", { name: "Remove, Road Bike Carbon" }));
    expect(await screen.findByText("Road Bike Carbon removed from your shopping cart.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Road Bike Carbon" })).toBeNull();
    expect(within(screen.getByRole("complementary", { name: "Order summary" })).getByText("$49.90 CAD")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove, Disc Brake Pads" }));
    expect(await screen.findByRole("heading", { name: "Your shopping cart is empty" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(2);
  });

  it("computes selected totals in whole cents", () => {
    const lines = [{ ...CART.items[1], subtotal: 0.1 }, { ...CART.items[0], item_id: 3, subtotal: 0.2 }];
    expect(selectionTotals(lines, new Set())).toEqual({ lines: 2, count: 3, total: 0.3 });
    expect(selectionTotals(lines, new Set([9]))).toEqual({ lines: 1, count: 1, total: 0.2 });
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
