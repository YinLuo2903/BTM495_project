// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { announceCart, fetchCart } from "../services/cart";
import { signOut, watchSession, type Session } from "../services/session";
import { Layout } from "./Layout";

vi.mock("../services/session", () => ({ signOut: vi.fn(), watchSession: vi.fn() }));
vi.mock("../services/cart", async importOriginal => ({ ...await importOriginal<typeof import("../services/cart")>(), fetchCart: vi.fn() }));

const line = (item_id: number, quantity: number) => ({ item_id, name: `Item ${item_id}`, category: "", price: 10, quantity, subtotal: 10 * quantity, stock_quantity: null });

beforeEach(() => {
  vi.mocked(fetchCart).mockResolvedValue({ items: [], count: 0, total: 0 });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("shared layout", () => {
  it.each([
    [false, "Home", "/views/customer/index.html"],
    [true, "Dashboard", "/views/admin/index.html"],
  ])("renders role-specific navigation and footer (admin: %s)", (admin, label, href) => {
    const unsubscribe = vi.fn();
    vi.mocked(watchSession).mockReturnValue(unsubscribe);
    const view = render(<Layout admin={admin}><main>Page content</main></Layout>);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    expect(screen.getByRole("link", { name: "Sign In" }).getAttribute("href")).toBe("/views/customer/login.html");
    expect(screen.getByText("Page content")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    if (admin) expect(screen.getByRole("link", { name: "← Customer View" })).toBeTruthy();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("updates session status, signs out and displays errors", async () => {
    let update!: (session: Session | null, error: Error | null) => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    vi.mocked(signOut).mockRejectedValueOnce(new Error("network unavailable"));
    render(<Layout admin={false}><main /></Layout>);
    act(() => update({ user: { name: "Pat", is_admin: false }, expiresAt: 123 }, null));
    expect(screen.getByRole("status").textContent).toBe(""); // the name is the account link now
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Sign out failed: network unavailable"));
    expect(screen.getByRole("button", { name: "Sign Out" }).matches(":disabled")).toBe(false);
    act(() => update(null, new Error("session unavailable")));
    expect(screen.getByRole("status").textContent).toBe("Session unavailable: session unavailable");
    expect(screen.getByRole("link", { name: "Sign In" })).toBeTruthy();
  });

  it("shows guests Sign In and Create account, with no Profile or Signup menu links", () => {
    vi.mocked(watchSession).mockReturnValue(() => {});
    render(<Layout admin={false}><main /></Layout>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual([
      "Home", "Items", "Events", "Appointments", "Shopping Cart", "Sign In", "Create account",
    ]);
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/views/customer/signup.html");
    expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();
  });

  it("turns the signed-in customer's name into the My Profile link", () => {
    let update!: (session: Session | null, error: Error | null) => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    render(<Layout admin={false}><main /></Layout>);
    act(() => update({ user: { name: "Jamie Rivera", is_admin: false }, expiresAt: 123 }, null));

    const account = screen.getByRole("link", { name: "My profile, signed in as Jamie Rivera" });
    expect(account.getAttribute("href")).toBe("/views/customer/profile.html");
    expect(account.textContent).toBe("Jamie Rivera");
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
    for (const gone of ["Sign In", "Create account", "Profile", "Signup"]) {
      expect(screen.queryByRole("link", { name: gone })).toBeNull();
    }
  });

  it("sends a signed-in admin's name to the admin dashboard, and offers admins no Create account", () => {
    let update!: (session: Session | null, error: Error | null) => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    render(<Layout admin><main /></Layout>);
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull(); // guest on an admin page
    act(() => update({ user: { name: "Ada", is_admin: true }, expiresAt: 123 }, null));
    expect(screen.getByRole("link", { name: "Admin dashboard, signed in as Ada" }).getAttribute("href")).toBe("/views/admin/index.html");
  });

  it("shows the signed-in customer's cart count and keeps it current", async () => {
    let update!: (session: Session | null, error: Error | null) => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    vi.mocked(fetchCart).mockResolvedValue({ items: [line(1, 2)], count: 2, total: 20 });
    render(<Layout admin={false}><main /></Layout>);
    expect(screen.getByRole("link", { name: "Shopping Cart" })).toBeTruthy(); // guest: no badge
    expect(fetchCart).not.toHaveBeenCalled();

    act(() => update({ user: { name: "Pat", is_admin: false }, expiresAt: 123 }, null));
    expect((await screen.findByRole("link", { name: "Shopping Cart, 2 items" })).getAttribute("href")).toBe("/views/customer/cart.html");
    act(() => announceCart({ items: [line(1, 3)], count: 3, total: 30 }));
    expect(screen.getByRole("link", { name: "Shopping Cart, 3 items" }).textContent).toBe("Shopping Cart3");

    act(() => update(null, null)); // signed out: badge goes away
    expect(screen.getByRole("link", { name: "Shopping Cart" })).toBeTruthy();
  });

  it("does not load a cart for admins", () => {
    let update!: (session: Session | null, error: Error | null) => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    render(<Layout admin={false}><main /></Layout>);
    act(() => update({ user: { name: "Ada", is_admin: true }, expiresAt: 123 }, null));
    expect(fetchCart).not.toHaveBeenCalled();
  });

  it("disables sign out while the request is pending", async () => {
    let update!: (session: Session | null, error: Error | null) => void;
    let finish!: () => void;
    vi.mocked(watchSession).mockImplementation(callback => { update = callback; return () => {}; });
    vi.mocked(signOut).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<Layout admin={false}><main /></Layout>);
    act(() => update({ user: { name: "Pat", is_admin: false }, expiresAt: 123 }, null));
    const button = screen.getByRole("button", { name: "Sign Out" });
    fireEvent.click(button);
    expect(button.matches(":disabled")).toBe(true);
    await act(async () => { finish(); });
    expect(button.matches(":disabled")).toBe(false);
    act(() => update(null, null));
    expect(screen.getByRole("link", { name: "Sign In" })).toBeTruthy();
  });
});
