// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CheckoutSteps } from "./CheckoutSteps";
import { CartPage } from "./CartPage";
import { CheckoutPage } from "./CheckoutPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const steps = () => within(screen.getByRole("navigation", { name: "Checkout progress" })).getAllByRole("listitem");

describe("CheckoutSteps", () => {
  it("marks Shopping Cart as the current step on the cart page", () => {
    render(<CheckoutSteps current={1} />);
    const [cart, payment] = steps();
    expect(cart.getAttribute("aria-current")).toBe("step");
    expect(cart.textContent).toBe("1Shopping Cart");
    expect(payment.getAttribute("aria-current")).toBeNull();
    expect(payment.className).not.toContain("it-step-active");
    // Payment is reached only through the Checkout button, never the indicator.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows Shopping Cart completed (linking back) and Payment current on the payment page", () => {
    render(<CheckoutSteps current={2} />);
    const [cart, payment] = steps();
    expect(cart.className).toContain("it-step-complete");
    expect(cart.querySelector("svg")).toBeTruthy(); // check mark instead of "1"
    const back = within(cart).getByRole("link");
    expect(back.getAttribute("href")).toBe("cart.html");
    expect(back.textContent).toBe("Shopping Cart (completed)"); // the "(completed)" part is screen-reader only
    expect(payment.getAttribute("aria-current")).toBe("step");
    expect(within(payment).queryByRole("link")).toBeNull();
  });

  it("appears under the header of both pages", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ status: "error", message: "Sign in." }) })));
    const view = render(<CartPage />);
    expect(steps()[0].getAttribute("aria-current")).toBe("step");
    view.unmount();
    render(<CheckoutPage />);
    expect(steps()[1].getAttribute("aria-current")).toBe("step");
  });
});
