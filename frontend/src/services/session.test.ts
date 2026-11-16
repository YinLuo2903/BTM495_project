// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getSession, signIn, signOut, watchSession } from "./session";

const token = "a".repeat(43);
const otherToken = "b".repeat(43);
const user = { name: "Test", is_admin: false };
const saved = () => JSON.parse(localStorage.getItem("lpvr.session") || "null");
const response = (status: number, body: object) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const storage = {
  data: new Map<string, string>(),
  getItem(key: string) { return this.data.get(key) ?? null; },
  setItem(key: string, value: string) { this.data.set(key, value); },
  removeItem(key: string) { this.data.delete(key); },
};

beforeEach(() => {
  storage.data.clear();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("stores login and sends the token for session validation and logout", async () => {
  const fetch = vi.fn(async (path: string) => path === "/api/login"
    ? response(200, { status: "ok", token, expires_at: 2000000000, user })
    : response(200, { status: "ok", user }));
  vi.stubGlobal("fetch", fetch);
  expect(await signIn("test@example.com", "password")).toEqual(user);
  expect(saved().token).toBe(token);
  expect(await getSession()).toEqual({ user, expiresAt: 2000000000 });
  expect(fetch.mock.calls[1][0]).toBe("/api/session");
  await signOut();
  expect(saved()).toBeNull();
});

it("sends the token and retains it when logout fails", async () => {
  localStorage.setItem("lpvr.session", JSON.stringify({ token, expiresAt: 2000000000 }));
  const fetch = vi.fn(async (_path: string, _options: RequestInit) => response(500, { status: "error" }));
  vi.stubGlobal("fetch", fetch);
  await expect(signOut()).rejects.toThrow("HTTP 500");
  expect(saved().token).toBe(token);
  expect(fetch).toHaveBeenCalledWith("/api/logout", expect.objectContaining({
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }));
});

it("keeps a current session on a rejected login", async () => {
  localStorage.setItem("lpvr.session", JSON.stringify({ token, expiresAt: 2000000000 }));
  vi.stubGlobal("fetch", vi.fn(async () => response(401, { status: "error", message: "Invalid credentials." })));
  await expect(signIn("test@example.com", "bad")).rejects.toThrow("Invalid credentials.");
  expect(saved().token).toBe(token);
});

it("retains tokens on server errors and clears them on expiry", async () => {
  localStorage.setItem("lpvr.session", JSON.stringify({ token, expiresAt: 2000000000 }));
  const fetch = vi.fn().mockResolvedValueOnce(response(500, { status: "error" })).mockResolvedValueOnce(response(401, { status: "error" }));
  vi.stubGlobal("fetch", fetch);
  await expect(getSession()).rejects.toThrow("HTTP 500");
  expect(saved().token).toBe(token);
  expect(await getSession()).toBeNull();
  expect(saved()).toBeNull();
});

it("does not clear a newer session after an old request", async () => {
  localStorage.setItem("lpvr.session", JSON.stringify({ token, expiresAt: 2000000000 }));
  vi.stubGlobal("fetch", vi.fn(async () => {
    localStorage.setItem("lpvr.session", JSON.stringify({ token: otherToken, expiresAt: 2000000000 }));
    return response(401, { status: "error" });
  }));
  expect(await getSession()).toBeNull();
  expect(saved().token).toBe(otherToken);
});

it("reports invalid stored data and revokes sessions that cannot be stored", async () => {
  localStorage.setItem("lpvr.session", "{bad");
  await expect(getSession()).rejects.toThrow("Stored session was invalid");
  expect(saved()).toBeNull();
  vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const fetch = vi.fn(async (path: string) => path === "/api/login"
    ? response(200, { status: "ok", token, expires_at: 2000000000, user })
    : response(200, { status: "ok" }));
  vi.stubGlobal("fetch", fetch);
  await expect(signIn("test@example.com", "password")).rejects.toThrow("storage unavailable");
  expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/login", "/api/logout"]);
});

it("unsubscribes session watchers", async () => {
  const callback = vi.fn();
  const unsubscribe = watchSession(callback);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
  unsubscribe();
  window.dispatchEvent(new Event("lpvr-session-change"));
  await Promise.resolve();
  expect(callback).toHaveBeenCalledOnce();
});
