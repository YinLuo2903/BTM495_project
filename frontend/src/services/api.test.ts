import { afterEach, describe, expect, it, vi } from "vitest";
import { api, errorMessage, formatAmount } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API helper", () => {
  it("sends JSON requests and returns the response", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok", value: 4 }) }));
    vi.stubGlobal("fetch", fetch);
    expect(await api<{ value: number }>("/api/items", "POST", { name: "Chain" })).toEqual({ status: "ok", value: 4 });
    expect(fetch).toHaveBeenCalledWith("/api/items", {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chain" }),
    });
  });

  it.each([
    [null, true, "Invalid API response."],
    [{}, true, "Invalid API response."],
    [{ status: "error", message: "Bad request" }, false, "Bad request"],
    [{ status: "error" }, false, "Request failed with HTTP 500"],
  ])("reports invalid or unsuccessful responses", async (body, ok, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: 500, json: async () => body })));
    await expect(api("/api/items")).rejects.toThrow(message);
  });

  it("formats amounts and unknown errors", () => {
    expect(formatAmount(12.5)).toBe("$12.50 CAD");
    expect(formatAmount(2199)).toBe("$2,199.00 CAD");
    expect(formatAmount(0)).toBe("$0.00 CAD");
    expect(errorMessage(new Error("oops"))).toBe("oops");
    expect(errorMessage("oops")).toBe("oops");
  });
});
