export interface Item {
  item_id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  stock_quantity: number | null;
}

export interface ShopEvent {
  event_id: number;
  name: string;
  participant_limit: number;
  customer_ids: number[];
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || !("status" in data)) {
    throw new Error("Invalid API response.");
  }
  if (!response.ok || data.status !== "ok") {
    const message = "message" in data && typeof data.message === "string" ? data.message : `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}
