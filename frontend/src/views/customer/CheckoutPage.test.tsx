// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CheckoutPage } from "./CheckoutPage";
import { formatCardNumber, formatExpiry, isValidCardholderName, passesLuhn, validateCard } from "./checkoutValidation";
import { CART_CHANGE_EVENT, type CartSummary } from "../../services/cart";

const TOKEN = "a".repeat(43);
const CART: CartSummary = {
  items: [
    { item_id: 2, name: "Road Bike Carbon", category: "Bikes", price: 2199, quantity: 1, subtotal: 2199, stock_quantity: 4 },
    { item_id: 3, name: "Cycling Helmet", category: "Safety Gear", price: 79.95, quantity: 1, subtotal: 79.95, stock_quantity: 35 },
    { item_id: 9, name: "Disc Brake Pads", category: "Components", price: 24.95, quantity: 2, subtotal: 49.9, stock_quantity: 50 },
  ],
  count: 4,
  total: 2328.85,
};
const AFTER = { items: [CART.items[1]], count: 1, total: 79.95 };

type Reply = { status?: number; body: object };
function mockFetch(onPay: (body: Record<string, unknown>) => Reply = () => ({ body: { status: "ok", message: "Payment successful", order: { order_id: 57, total: 2248.9, paid_at: "2026-11-21 22:30:00", card_last4: "4242" }, ...AFTER } })) {
  let paid = false;
  const fetchMock = vi.fn(async (url: string, options: RequestInit = {}) => {
    let reply: Reply;
    if (url === "/api/my-cart") reply = { body: { status: "ok", ...(paid ? AFTER : CART) } };
    else if (url === "/api/my-checkout" && options.method === "POST") {
      reply = onPay(JSON.parse(String(options.body)));
      paid = (reply.status ?? 200) < 400;
    } else reply = { status: 404, body: { status: "error", message: "Not found." } };
    const status = reply.status ?? 200;
    return { ok: status < 400, status, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  const values = new Map<string, string>([["lpvr.cart.unselected", "[3]"]]); // helmet left unselected in the cart
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const signIn = () => localStorage.setItem("lpvr.session", JSON.stringify({ token: TOKEN, expiresAt: 4_102_444_800 }));

function fillCard(number = "4242424242424242", expiry = "1229", cvc = "123", name = "Jamie Rivera") {
  fireEvent.change(screen.getByLabelText("Cardholder name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Card number"), { target: { value: number } });
  fireEvent.change(screen.getByLabelText("Expiry date"), { target: { value: expiry } });
  fireEvent.change(screen.getByLabelText("CVC"), { target: { value: cvc } });
}

describe("card validation", () => {
  it("formats the card number and expiry as the customer types", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("4242-42a42 4242424299")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("424")).toBe("424");
    expect(formatExpiry("1229")).toBe("12/29");
    expect(formatExpiry("12/2")).toBe("12/2");
    expect(formatExpiry("1")).toBe("1");
  });

  it("checks the Luhn checksum", () => {
    expect(passesLuhn("4242424242424242")).toBe(true);
    expect(passesLuhn("4000000000000002")).toBe(true);
    expect(passesLuhn("4242424242424241")).toBe(false);
  });

  it("checks the cardholder name", () => {
    for (const name of ["Jamie Rivera", "Zoë O'Brien-Côté", "J. R. R. Tolkien", "  Ana Li  "]) expect(isValidCardholderName(name)).toBe(true);
    for (const name of ["", "J", "  ", "4242 Jamie", "-Jamie", "Jamie!", "x".repeat(51)]) expect(isValidCardholderName(name)).toBe(false);
  });

  it("validates name, number, expiry and CVC formats", () => {
    const today = new Date(2026, 10, 21);
    expect(validateCard({ cardholderName: "Jamie Rivera", cardNumber: "4242 4242 4242 4242", expiry: "11/26", cvc: "123" }, today)).toEqual({});
    expect(validateCard({ cardholderName: "", cardNumber: "4242 4242 4242", expiry: "13/30", cvc: "12" }, today)).toEqual({
      cardholderName: "Enter the name as it appears on the card.",
      cardNumber: "Enter a valid 16-digit card number.",
      expiry: "Enter the expiry date as MM/YY.",
      cvc: "Enter the 3-digit CVC.",
    });
    expect(validateCard({ cardholderName: "Jamie Rivera", cardNumber: "4242 4242 4242 4241", expiry: "10/26", cvc: "123" }, today)).toEqual({
      cardNumber: "Enter a valid 16-digit card number.",
      expiry: "This card has expired.",
    });
  });
});

describe("CheckoutPage", () => {
  it("lists only the items selected in the cart", async () => {
    signIn();
    mockFetch();
    render(<CheckoutPage bankDelayMs={0} />);
    expect(screen.getByRole("heading", { level: 1, name: "Checkout" })).toBeTruthy();
    const summary = await screen.findByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("Road Bike Carbon")).toBeTruthy();
    expect(within(summary).getByText("Disc Brake Pads")).toBeTruthy();
    expect(within(summary).queryByText("Cycling Helmet")).toBeNull();
    expect(within(summary).getByText("3 items")).toBeTruthy();
    expect(within(summary).getByText("$2,248.90 CAD")).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Back to shopping cart" }).getAttribute("href")).toBe("cart.html");
  });

  it("enables Complete order only when every card field is valid, and explains errors", async () => {
    signIn();
    mockFetch();
    render(<CheckoutPage bankDelayMs={0} />);
    const button = await screen.findByRole("button", { name: "Complete order · $2,248.90 CAD" });
    expect(button.matches(":disabled")).toBe(true);

    const number = screen.getByLabelText("Card number");
    fireEvent.change(number, { target: { value: "4242 4242" } });
    fireEvent.blur(number);
    expect(screen.getByText("Enter a valid 16-digit card number.")).toBeTruthy();
    expect(number.getAttribute("aria-invalid")).toBe("true");

    // The cardholder name comes first and is required too.
    const fields = screen.getAllByRole("textbox").map(input => input.id);
    expect(fields).toEqual(["cardholder-name", "card-number", "card-expiry", "card-cvc"]);
    fillCard(undefined, undefined, undefined, "J");
    fireEvent.blur(screen.getByLabelText("Cardholder name"));
    expect(screen.getByText("Enter the name as it appears on the card.")).toBeTruthy();
    expect(button.matches(":disabled")).toBe(true);

    fillCard();
    expect(screen.queryByText("Enter the name as it appears on the card.")).toBeNull();
    expect((screen.getByLabelText("Card number") as HTMLInputElement).value).toBe("4242 4242 4242 4242");
    expect((screen.getByLabelText("Expiry date") as HTMLInputElement).value).toBe("12/29");
    expect(screen.queryByText("Enter a valid 16-digit card number.")).toBeNull();
    expect(button.matches(":disabled")).toBe(false);
  });

  it("pays, shows Payment successful, and updates the cart", async () => {
    signIn();
    const counts: number[] = [];
    const onChange = (event: Event) => counts.push((event as CustomEvent<CartSummary>).detail.count);
    window.addEventListener(CART_CHANGE_EVENT, onChange);
    const fetchMock = mockFetch();
    render(<CheckoutPage bankDelayMs={0} />);
    await screen.findByRole("complementary", { name: "Order summary" });
    fillCard();
    fireEvent.click(screen.getByRole("button", { name: "Complete order · $2,248.90 CAD" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Payment successful" })).toBeTruthy();
    expect(screen.getByText("#57")).toBeTruthy();
    expect(screen.getByText("$2,248.90 CAD")).toBeTruthy();
    expect(screen.getByText("Ending in 4242")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe("items.html");
    expect(await screen.findByRole("link", { name: "Back to shopping cart (1 item)" })).toBeTruthy();
    expect(counts).toEqual([1]);

    const pay = fetchMock.mock.calls.find(([url]) => url === "/api/my-checkout")!;
    expect(JSON.parse(String(pay[1]!.body))).toEqual({ item_ids: [2, 9], cardholder_name: "Jamie Rivera", card_number: "4242424242424242", expiration_date: "12/29", cvv: "123" });
    window.removeEventListener(CART_CHANGE_EVENT, onChange);
  });

  it("fills in the approved demo card in one click", async () => {
    signIn();
    const fetchMock = mockFetch();
    render(<CheckoutPage bankDelayMs={0} />);
    await screen.findByRole("complementary", { name: "Order summary" });
    fireEvent.click(screen.getByRole("button", { name: "Fill in demo card" }));
    expect(["Cardholder name", "Card number", "Expiry date", "CVC"].map(label => (screen.getByLabelText(label) as HTMLInputElement).value))
      .toEqual(["Demo Customer", "4242 4242 4242 4242", "12/30", "123"]);
    fireEvent.click(screen.getByRole("button", { name: "Complete order · $2,248.90 CAD" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Payment successful" })).toBeTruthy();
    const pay = fetchMock.mock.calls.find(([url]) => url === "/api/my-checkout")!;
    expect(JSON.parse(String(pay[1]!.body))).toMatchObject({ card_number: "4242424242424242", expiration_date: "12/30", cvv: "123" });
  });

  it("shows the bank connection for 8 seconds before the result", async () => {
    signIn();
    mockFetch();
    render(<CheckoutPage />);
    await screen.findByRole("complementary", { name: "Order summary" });
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Fill in demo card" }));
      fireEvent.click(screen.getByRole("button", { name: "Complete order · $2,248.90 CAD" }));
      const bank = screen.getByRole("dialog", { name: "Processing payment" });
      expect(within(bank).getByRole("status").textContent).toContain("Connecting to your bank");
      await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
      expect(within(bank).getByRole("status").textContent).toContain("Authorizing payment");
      expect(screen.queryByRole("heading", { name: "Payment successful" })).toBeNull(); // still waiting
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    } finally {
      vi.useRealTimers();
    }
    expect(await screen.findByRole("heading", { level: 1, name: "Payment successful" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the form and explains a declined card", async () => {
    signIn();
    mockFetch(() => ({ status: 402, body: { status: "error", message: "Payment declined. Check your card details or use a different card." } }));
    render(<CheckoutPage bankDelayMs={0} />);
    await screen.findByRole("complementary", { name: "Order summary" });
    fillCard("4000000000000002");
    fireEvent.click(screen.getByRole("button", { name: "Complete order · $2,248.90 CAD" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Payment declined. Check your card details or use a different card.");
    expect(screen.queryByRole("heading", { name: "Payment successful" })).toBeNull();
    expect((screen.getByLabelText("Card number") as HTMLInputElement).value).toBe("4000 0000 0000 0002");
  });

  it("asks guests to sign in and handles an empty selection", async () => {
    mockFetch();
    const view = render(<CheckoutPage bankDelayMs={0} />);
    expect(await screen.findByRole("heading", { name: "Sign in to check out" })).toBeTruthy();
    view.unmount();

    signIn();
    localStorage.setItem("lpvr.cart.unselected", "[2,3,9]");
    render(<CheckoutPage bankDelayMs={0} />);
    expect(await screen.findByRole("heading", { name: "No items selected" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to shopping cart" }).getAttribute("href")).toBe("cart.html");
  });
});
