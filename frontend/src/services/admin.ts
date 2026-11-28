import { api } from "./api";

/** Shared status table: 1 Pending, 2 Completed, 3 Cancelled; 4 Ready for pick-up (orders only). */
export const STATUS_NAMES: Record<number, string> = { 1: "Pending", 2: "Completed", 3: "Cancelled", 4: "Ready for pick-up" };

export function statusName(id: number | null | undefined): string {
  return (id != null && STATUS_NAMES[id]) || "Unknown";
}

export interface AdminCustomer {
  customer_id: number;
  customer_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  /** Sign-up time, "YYYY-MM-DD HH:MM:SS"; null for accounts older than tracking. */
  created_at: string | null;
  order_count: number;
  appointment_count: number;
}

export interface AdminAppointment {
  appointment_id: number;
  customer_id: number;
  customer_code: string | null;
  customer_name: string;
  /** "YYYY-MM-DD HH:MM:SS" */
  appointment_time: string | null;
  description: string;
  status_id: number | null;
}

export interface AdminOrder {
  order_id: number;
  order_date: string | null;
  total_amount: number;
  paid: boolean;
  customer_id: number | null;
  customer_name: string;
  status_id: number | null;
}

export interface AdminPayment {
  payment_id: number;
  order_id: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  paid_status: boolean;
  status_id: number | null;
  customer_name: string;
}

export function fetchDashboard() {
  return api<{ orders: AdminOrder[]; payments: AdminPayment[] }>("/api/dashboard");
}

export function fetchCustomers() {
  return api<{ customers: AdminCustomer[] }>("/api/admin/customers").then(data => data.customers);
}

/** One stock change for an item (oldest first from the server). */
export interface StockChange {
  item_id: number;
  old_quantity: number | null;
  new_quantity: number;
  created_at: string;
}

export function fetchStockHistory() {
  return api<{ history: StockChange[] }>("/api/admin/inventory-history").then(data => data.history);
}

export function fetchAppointments() {
  return api<{ appointments: AdminAppointment[] }>("/api/admin/appointments").then(data => data.appointments);
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Problem with a picked image file, or "" when it can be uploaded. */
export function imageFileError(file: File): string {
  if (!IMAGE_TYPES.includes(file.type)) return "Choose a JPG, PNG or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return `This image is ${(file.size / 1048576).toFixed(1)} MB. Choose one up to 2 MB.`;
  return "";
}

/** Upload an image; resolves to the path to store, e.g. "/uploads/<hex>.png". */
export async function uploadImage(file: File): Promise<string> {
  const response = await fetch("/api/uploads", {
    method: "POST", cache: "no-store", headers: { "Content-Type": file.type }, body: file,
  });
  let data: { status?: string; message?: string; image_path?: string } = {};
  try {
    data = await response.json();
  } catch {
    // fall through to the generic message
  }
  if (!response.ok || data.status !== "ok" || typeof data.image_path !== "string") {
    throw new Error(data.message || `Upload failed with HTTP ${response.status}.`);
  }
  return data.image_path;
}

/** "2026-10-06 10:00:00" → "2026-10-06T10:00" for <input type="datetime-local">. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace(" ", "T") : "";
}

/** "2026-10-06T10:00" → "2026-10-06 10:00:00" as the database stores it. */
export function fromDateInput(value: string): string | null {
  return value ? `${value.slice(0, 16).replace("T", " ")}:00` : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-06 10:00:00" → "Oct 6, 2026" (· 10:00 with time); "—" when missing. */
export function formatDate(value: string | null | undefined, withTime = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(value ?? "");
  if (!match) return "—";
  const [, year, month, day, time] = match;
  const date = `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
  return withTime && time ? `${date} · ${time}` : date;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
