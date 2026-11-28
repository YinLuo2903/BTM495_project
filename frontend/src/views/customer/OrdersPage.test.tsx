// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { OrdersPage, orderStatus, type MyOrder } from "./OrdersPage";

const order = (id: number, overrides: Partial<MyOrder> = {}): MyOrder => ({
  order_id: id, date: "2026-11-27 20:41:00", total: 49, status_id: 1,
  items: [{ item_id: 8, name: "Floor Pump", image_path: "/uploads/p.webp", quantity: 1, unit_price: 49 }],
  payment: { date: "2026-11-27 20:41:08", amount: 49, method: "Credit Card", status_id: 2 }, ...overrides,
});

function serve(orders: MyOrder[]) {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ token: "a".repeat(43), expiresAt: 4_102_444_800 }), setItem() {}, removeItem() {} });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "ok", orders }) })));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("order status", () => {
  it("says where each order is in the customer's words", () => {
    expect(orderStatus(order(1)).label).toBe("Preparing");
    expect(orderStatus(order(1, { status_id: 4 })).label).toBe("Ready for pick-up");
    expect(orderStatus(order(1, { status_id: 2 })).label).toBe("Picked up");
    expect(orderStatus(order(1, { status_id: 3 })).label).toBe("Cancelled");
    expect(orderStatus(order(1, { payment: null })).label).toBe("Awaiting payment");
  });
});

describe("OrdersPage", () => {
  it("lists the customer's orders with status, items and payment", async () => {
    serve([order(54), order(12, { status_id: 2, total: 79.95 })]);
    render(<OrdersPage />);
    const latest = await screen.findByRole("listitem", { name: "Order #54" });
    expect(within(latest).getByText("Preparing", { selector: ".my-order-status" })).toBeTruthy();
    const steps = within(latest).getByRole("list", { name: "Order progress" });
    expect(within(steps).getByText("Preparing").getAttribute("aria-current")).toBe("step");
    expect(within(latest).getByRole("link", { name: "Floor Pump" }).getAttribute("href")).toBe("item.html?id=8");
    expect(within(latest).getByText(/Paid by credit card/)).toBeTruthy();
    expect(within(screen.getByRole("listitem", { name: "Order #12" })).getByText("Picked up", { selector: ".my-order-status" })).toBeTruthy();
  });

  it("says when there are no orders yet", async () => {
    serve([]);
    render(<OrdersPage />);
    expect(await screen.findByRole("heading", { name: "No orders yet" })).toBeTruthy();
  });
});
