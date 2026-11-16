// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signOut, watchSession, type Session } from "../services/session";
import { Layout } from "./Layout";

vi.mock("../services/session", () => ({ signOut: vi.fn(), watchSession: vi.fn() }));

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
    expect(screen.getByRole("status").textContent).toBe("Signed in: Pat");
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Sign out failed: network unavailable"));
    expect(screen.getByRole("button", { name: "Sign Out" }).matches(":disabled")).toBe(false);
    act(() => update(null, new Error("session unavailable")));
    expect(screen.getByRole("status").textContent).toBe("Session unavailable: session unavailable");
    expect(screen.getByRole("link", { name: "Sign In" })).toBeTruthy();
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
