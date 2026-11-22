// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getSession, sessionApi, signIn } from "../services/session";
import { CustomerPage } from "./customer/CustomerPages";

vi.mock("../services/session", () => ({ signIn: vi.fn(), sessionApi: vi.fn(), getSession: vi.fn(async () => null) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(signIn).mockReset();
  vi.mocked(sessionApi).mockReset();
  vi.unstubAllGlobals();
});

function response(data: object) {
  return { ok: true, status: 200, json: async () => ({ status: "ok", ...data }) };
}

describe("customer pages", () => {
  it("creates an account, signs in and shows the assigned customer ID", async () => {
    const fetch = vi.fn(async (_path: string, _init: RequestInit) => ({ ok: true, status: 201, json: async () => ({
      status: "ok", customer: { customer_code: "LPVR011", first_name: "Jamie", last_name: "Rivera", email: "jamie@example.com", phone: "514-555-0123", address: "12 Rue Test" },
    }) }));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(signIn).mockResolvedValue({ name: "Jamie Rivera", is_admin: false });
    render(<CustomerPage page="signup" />);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: " Jamie " } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Rivera" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jamie@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "514-555-0123 " } });
    fireEvent.change(screen.getByLabelText("Home address"), { target: { value: "12 Rue Test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-pass" } });
    const nameRow = screen.getByLabelText("First name").closest(".form-row");
    expect(nameRow?.contains(screen.getByLabelText("Last name"))).toBe(true);
    expect(nameRow?.contains(screen.getByLabelText("Email"))).toBe(false);
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect(await screen.findByText("LPVR011")).toBeTruthy();
    expect(fetch.mock.calls[0][0]).toBe("/api/signup");
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({
      first_name: "Jamie", last_name: "Rivera", email: "jamie@example.com",
      phone: "514-555-0123", address: "12 Rue Test", password: "secret-pass",
    });
    expect(signIn).toHaveBeenCalledWith("jamie@example.com", "secret-pass");
    expect(screen.getByRole("link", { name: "View your profile" }).getAttribute("href")).toBe("profile.html");
  });

  it.each([
    [false, "Go to My Profile", "profile.html"],
    [true, "Go to the admin dashboard", "/views/admin/index.html"],
  ])("does not offer a second account when already signed in (admin: %s)", async (isAdmin, link, href) => {
    vi.mocked(getSession).mockResolvedValueOnce({ user: { name: "Jamie Rivera", is_admin: isAdmin }, expiresAt: 4_102_444_800 });
    render(<CustomerPage page="signup" />);
    expect(await screen.findByRole("heading", { name: "You're already signed in" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("You are signed in as Jamie Rivera.");
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(href);
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("shows signup errors from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({
      status: "error", message: "An account with this email already exists.",
    }) })));
    render(<CustomerPage page="signup" />);
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("An account with this email already exists.");
    expect(signIn).not.toHaveBeenCalled();
  });

  const profileCustomer = { customer_code: "LPVR002", first_name: "Jamie", last_name: "Rivera", email: "jamie@example.com", phone: "", address: "12 Rue Test" };

  it("shows profile details read-only, then edits and saves them", async () => {
    vi.mocked(sessionApi).mockImplementation(async (_path: string, method = "GET", body?: unknown) =>
      ({ customer: method === "PATCH" ? { ...profileCustomer, ...(body as object) } : profileCustomer }) as never);
    render(<CustomerPage page="profile" />);
    expect(await screen.findByText("LPVR002")).toBeTruthy();
    expect(screen.getByText("Jamie")).toBeTruthy();
    expect(screen.getByText("Not provided")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jamie");
    expect(document.activeElement).toBe(screen.getByLabelText("First name"));
    expect(screen.getByLabelText("First name").closest(".form-row")?.contains(screen.getByLabelText("Last name"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "514-555-0000" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);

    expect(await screen.findByText("Profile updated.")).toBeTruthy();
    expect(sessionApi).toHaveBeenLastCalledWith("/api/profile", "PATCH", {
      first_name: "Jamie", last_name: "Rivera", email: "jamie@example.com", phone: "514-555-0000", address: "12 Rue Test",
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("514-555-0000")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit profile" }));
  });

  it("cancels edits without saving and keeps the form open on save errors", async () => {
    vi.mocked(sessionApi).mockImplementation(async (_path: string, method = "GET") => {
      if (method === "PATCH") throw new Error("Phone number must contain 7 to 15 digits.");
      return { customer: profileCustomer } as never;
    });
    render(<CustomerPage page="profile" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Jamie")).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
    expect(sessionApi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jamie");
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBe("Phone number must contain 7 to 15 digits.");
    expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("123");
  });

  it("asks visitors without a customer session to sign in", async () => {
    vi.mocked(sessionApi).mockRejectedValue(new Error("Please sign in to continue."));
    render(<CustomerPage page="profile" />);
    expect((await screen.findByRole("alert")).textContent).toBe("Please sign in to continue.");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("login.html");
  });

  it("filters inventory by name and category", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ items: [
      { item_id: 1, name: "Chain", price: 5, brand: "Acme", category: "Parts", stock_quantity: 3 },
      { item_id: 2, name: "Pump", price: 9, brand: "Acme", category: "Tools", stock_quantity: 3 },
    ] })));
    render(<CustomerPage page="items" />);
    await screen.findByRole("link", { name: "Chain" });
    const search = screen.getByLabelText("Search items by name or category");
    fireEvent.change(search, { target: { value: "tools" } });
    expect(screen.queryByRole("link", { name: "Chain" })).toBeNull();
    expect(screen.getByRole("link", { name: "Pump" }).getAttribute("href")).toBe("item.html?id=2");
    fireEvent.change(search, { target: { value: "acme" } }); // brand is not searched
    expect(screen.getByRole("heading", { name: "No items found" })).toBeTruthy();
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
