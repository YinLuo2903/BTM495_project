// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Item } from "../../services/api";
import { ProductShowcase, RESUME_MS, SLIDE_MS } from "./ProductShowcase";

function item(id: number, overrides: Partial<Item> = {}): Item {
  return { item_id: id, name: `Item ${id}`, description: `Description ${id}`, price: 10 + id, category: "Tools", brand: "Acme", stock_quantity: 20, image_path: `/uploads/${id}.webp`, ...overrides };
}

function mockInventory(items: Item[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url === "/api/inventory" ? { status: "ok", items } : { status: "error", message: "Not signed in." };
    return { ok: url === "/api/inventory", status: url === "/api/inventory" ? 200 : 401, json: async () => body };
  }));
}

/** The slide that is showing (the others are hidden from assistive technology). */
const currentSlide = () => screen.getByRole("group", { hidden: false });

async function renderShowcase(items: Item[]) {
  mockInventory(items);
  render(<ProductShowcase />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("product showcase", () => {
  it("features in-stock products that have a photo", async () => {
    await renderShowcase([item(1, { name: "Pump" }), item(2, { name: "Sold Out", stock_quantity: 0 }), item(3, { name: "Lube", stock_quantity: null }),
      item(4, { name: "No Photo", image_path: null })]);
    expect(screen.getByRole("region", { name: "Featured products" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Show / }).map(button => button.getAttribute("aria-label"))).toEqual(["Show Pump", "Show Lube"]);
    expect(currentSlide().getAttribute("aria-label")).toBe("1 of 2: Pump");
  });

  it("renders nothing when there is nothing to feature", async () => {
    await renderShowcase([item(1, { stock_quantity: 0 })]);
    expect(screen.queryByRole("region", { name: "Featured products" })).toBeNull();
  });

  it("loops through the slides on a timer", async () => {
    await renderShowcase([item(1), item(2), item(3)]);
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(currentSlide().getAttribute("aria-label")).toBe("2 of 3: Item 2");
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(currentSlide().getAttribute("aria-label")).toBe("1 of 3: Item 1"); // wrapped around
    expect(screen.queryByRole("button", { name: /pause|play/i })).toBeNull(); // fully automatic
  });

  it("slides the new product in and the old one out, in the direction of travel", async () => {
    await renderShowcase([item(1), item(2), item(3)]);
    const slides = () => document.querySelectorAll(".sc-slide");
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(slides()[1].className).toContain("is-active sc-from-next");
    expect(slides()[0].className).toContain("is-leaving sc-to-next");
    fireEvent.click(screen.getByRole("button", { name: "Previous product" }));
    expect(slides()[0].className).toContain("is-active sc-from-prev");
    expect(slides()[1].className).toContain("is-leaving sc-to-prev");
    expect(slides()[2].className).toBe("sc-slide");
  });

  it("holds on a slide the visitor picks, then carries on by itself after a pause", async () => {
    await renderShowcase([item(1), item(2), item(3)]);
    fireEvent.click(screen.getByRole("button", { name: "Show Item 3" }));
    act(() => { vi.advanceTimersByTime(RESUME_MS - 100); });
    expect(currentSlide().getAttribute("aria-label")).toBe("3 of 3: Item 3"); // still held
    act(() => { vi.advanceTimersByTime(100); }); // hold ends
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(currentSlide().getAttribute("aria-label")).toBe("1 of 3: Item 1");
  });

  it("restarts the hold on every pick", async () => {
    await renderShowcase([item(1), item(2), item(3)]);
    fireEvent.click(screen.getByRole("button", { name: "Next product" }));
    act(() => { vi.advanceTimersByTime(RESUME_MS - 1000); });
    fireEvent.click(screen.getByRole("button", { name: "Next product" }));
    act(() => { vi.advanceTimersByTime(RESUME_MS - 1000); });
    expect(currentSlide().getAttribute("aria-label")).toBe("3 of 3: Item 3");
  });

  it("stops advancing while the pointer is over it", async () => {
    await renderShowcase([item(1), item(2)]);
    fireEvent.mouseEnter(screen.getByRole("region", { name: "Featured products" }));
    act(() => { vi.advanceTimersByTime(SLIDE_MS * 2); });
    expect(currentSlide().getAttribute("aria-label")).toBe("1 of 2: Item 1");
  });

  it("moves with the arrow buttons, the dots and the keyboard", async () => {
    await renderShowcase([item(1), item(2), item(3)]);
    fireEvent.click(screen.getByRole("button", { name: "Previous product" }));
    expect(currentSlide().getAttribute("aria-label")).toBe("3 of 3: Item 3");
    fireEvent.click(screen.getByRole("button", { name: "Next product" }));
    expect(currentSlide().getAttribute("aria-label")).toBe("1 of 3: Item 1");
    fireEvent.click(screen.getByRole("button", { name: "Show Item 2" }));
    expect(currentSlide().getAttribute("aria-label")).toBe("2 of 3: Item 2");
    fireEvent.keyDown(screen.getByRole("region", { name: "Featured products" }), { key: "ArrowRight" });
    expect(currentSlide().getAttribute("aria-label")).toBe("3 of 3: Item 3");
  });

  it("links each slide to its item page and shows its photo", async () => {
    await renderShowcase([item(7, { name: "Helmet", image_path: "/uploads/abc.jpg" })]);
    expect(screen.getByRole("link", { name: "View details" }).getAttribute("href")).toBe("item.html?id=7");
    expect(document.querySelector(".sc-visual img")?.getAttribute("src")).toBe("/uploads/abc.jpg");
  });

  it("still advances when the visitor prefers reduced motion (only the CSS motion is removed)", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    await renderShowcase([item(1), item(2)]);
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(currentSlide().getAttribute("aria-label")).toBe("2 of 2: Item 2");
  });
});
