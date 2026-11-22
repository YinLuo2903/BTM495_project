import { api, formatAmount, type Item, type ShopEvent } from "../../services/api";
import {
  fetchAppointments, fetchCustomers, fetchDashboard, formatDate, fromDateInput, plural, statusName, toDateInput,
  type AdminAppointment, type AdminCustomer, type AdminOrder, type AdminPayment,
} from "../../services/admin";

export type ModuleKey = "customers" | "events" | "appointments" | "orders" | "payments" | "inventory";
export type Form = Record<string, string>;
export type Errors = Record<string, string>;

/** One table cell. `thumb` (null = placeholder) adds the record's image before the name. */
export interface Cell {
  text: string;
  kind?: "primary" | "muted" | "badge";
  badge?: string;
  thumb?: string | null;
}

export interface Column<T> {
  label: string;
  sortValue: (row: T) => string | number;
  cell: (row: T) => Cell;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "datetime-local" | "textarea" | "status" | "customer" | "image";
  required?: boolean;
  hint?: string;
  min?: string;
  step?: string;
}

export interface Filter<T> {
  label: string;
  test: (row: T) => boolean;
}

/** Create and edit support; only events, appointments and inventory have it. */
export interface Editor<T> {
  fields: FieldDef[];
  toForm: (row: T) => Form;
  blank: () => Form;
  validate: (form: Form, row: T | null) => Errors;
  /** Resolves to the new record's ID. */
  create: (form: Form) => Promise<number>;
  /** Sends only the changed fields; resolves false when nothing changed. */
  update: (row: T, form: Form) => Promise<boolean>;
}

export interface ModuleConfig<T> {
  key: ModuleKey;
  title: string;
  singular: string;
  table: string;
  subtitle: string;
  searchHint: string;
  filterLabel: string;
  load: () => Promise<T[]>;
  id: (row: T) => number;
  name: (row: T) => string;
  searchText: (row: T) => string;
  filters: Filter<T>[];
  columns: Column<T>[];
  defaultSort: { column: number; dir: "asc" | "desc" };
  details: (row: T) => [string, string][];
  image?: (row: T) => string | null;
  editor?: Editor<T>;
  remove: (row: T) => Promise<void>;
  deleteText: (row: T) => string;
  /** Why the record can't be deleted, or "" when it can. */
  blockDelete?: (row: T) => string;
  /** Options for a "customer" field (customer ID datalist). */
  customerOptions?: () => { value: string; label: string }[];
}

export const PAGE_SIZE = 15;
export const IMAGE_HINT = "JPG, PNG or WebP, up to 2 MB. Shown on the customer page.";

const badgeClass: Record<number, string> = { 1: "adm-b-pending", 2: "adm-b-completed", 3: "adm-b-cancelled" };
const status = (id: number | null | undefined): Cell => ({ text: statusName(id), kind: "badge", badge: badgeClass[id ?? 0] ?? "adm-b-cancelled" });
const statusFilters = <T,>(of: (row: T) => number | null | undefined): Filter<T>[] => [
  { label: "All", test: () => true },
  ...[1, 2, 3].map(id => ({ label: statusName(id), test: (row: T) => of(row) === id })),
];
const statusField: FieldDef = { key: "status", label: "Status", type: "status" };
const imageField: FieldDef = { key: "image", label: "Image", type: "image", hint: IMAGE_HINT };
const filled = (value: string | undefined) => (value ?? "").trim() !== "";
const lower = (value: string | null | undefined) => (value ?? "").toLowerCase();
const MONEY = /^\d+(\.\d{1,2})?$/;

/** Keys whose form value changed; `map` turns them into the API payload. */
function changes(form: Form, before: Form, map: (key: string, value: string) => [string, unknown] | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(form)) {
    if (form[key] === before[key]) continue;
    const entry = map(key, form[key]);
    if (entry) payload[entry[0]] = entry[1];
  }
  return payload;
}

// ---------------- customers: view and delete ----------------
const customerName = (c: AdminCustomer) => `${c.first_name} ${c.last_name}`.trim();

export const customersModule: ModuleConfig<AdminCustomer> = {
  key: "customers", title: "Customers", singular: "customer", table: "customer",
  subtitle: "Customers create and edit their own accounts. Here you can view or remove them.",
  searchHint: "Search by name, customer ID, email or phone", filterLabel: "",
  load: fetchCustomers,
  id: c => c.customer_id, name: customerName,
  searchText: c => [c.customer_code, c.first_name, c.last_name, c.email, c.phone].join(" "),
  filters: [],
  columns: [
    { label: "Name", sortValue: c => lower(customerName(c)), cell: c => ({ text: customerName(c), kind: "primary" }) },
    { label: "Customer ID", sortValue: c => c.customer_id, cell: c => ({ text: c.customer_code }) },
    { label: "Email", sortValue: c => lower(c.email), cell: c => ({ text: c.email || "—", kind: "muted" }) },
    { label: "Phone", sortValue: c => c.phone, cell: c => ({ text: c.phone || "—", kind: "muted" }) },
    { label: "Orders", sortValue: c => c.order_count, cell: c => ({ text: String(c.order_count) }) },
  ],
  defaultSort: { column: 0, dir: "asc" },
  details: c => [
    ["Customer ID", c.customer_code], ["Name", customerName(c)], ["Email", c.email || "Not provided"],
    ["Phone", c.phone || "Not provided"], ["Address", c.address || "Not provided"],
    ["Orders", plural(c.order_count, "order")], ["Appointments", plural(c.appointment_count, "appointment")],
  ],
  remove: c => api(`/api/admin/customers/${c.customer_id}`, "DELETE").then(() => undefined),
  deleteText: c => `This permanently removes ${customerName(c)}’s account, sign-in sessions, shopping cart and event registrations.`,
  blockDelete: c => {
    if (!c.order_count && !c.appointment_count) return "";
    const held = [c.order_count ? plural(c.order_count, "order") : "", c.appointment_count ? plural(c.appointment_count, "appointment") : ""].filter(Boolean).join(" and ");
    return `${customerName(c)} still has ${held}, so the account is kept for the shop’s records.`;
  },
};

// ---------------- events: full create, update, delete ----------------
const eventFormKeys: Record<string, (value: string) => [string, unknown]> = {
  image: v => ["image_path", v || null],
  name: v => ["name", v.trim()],
  date: v => ["event_date_time", fromDateInput(v)],
  location: v => ["location", v.trim()],
  limit: v => ["participant_limit", Number(v)],
  description: v => ["description", v.trim()],
  status: v => ["status_id", Number(v)],
};
const eventForm = (e: ShopEvent): Form => ({
  image: e.image_path ?? "", name: e.name, date: toDateInput(e.event_date_time), location: e.location ?? "",
  limit: String(e.participant_limit), description: e.description ?? "", status: String(e.status_id ?? 1),
});

export const eventsModule: ModuleConfig<ShopEvent> = {
  key: "events", title: "Events", singular: "event", table: "event",
  subtitle: "Shop events. Changes appear on the customer Events page.",
  searchHint: "Search by event name or location", filterLabel: "Filter by status",
  load: () => api<{ events: ShopEvent[] }>("/api/events").then(data => data.events),
  id: e => e.event_id, name: e => e.name,
  searchText: e => [e.name, e.location, e.description].join(" "),
  filters: statusFilters(e => e.status_id),
  columns: [
    { label: "Event", sortValue: e => lower(e.name), cell: e => ({ text: e.name, kind: "primary", thumb: e.image_path ?? null }) },
    { label: "Date", sortValue: e => e.event_date_time ?? "", cell: e => ({ text: formatDate(e.event_date_time, true), kind: "muted" }) },
    { label: "Location", sortValue: e => lower(e.location), cell: e => ({ text: e.location || "—", kind: "muted" }) },
    { label: "Registered", sortValue: e => e.customer_ids.length, cell: e => ({ text: `${e.customer_ids.length} / ${e.participant_limit}` }) },
    { label: "Status", sortValue: e => e.status_id ?? 0, cell: e => status(e.status_id) },
  ],
  defaultSort: { column: 1, dir: "asc" },
  details: e => [
    ["Event ID", `#${e.event_id}`], ["Name", e.name], ["Date", formatDate(e.event_date_time, true)],
    ["Location", e.location || "Not set"], ["Registered", `${e.customer_ids.length} of ${e.participant_limit} places`],
    ["Description", e.description || "No description"], ["Status", statusName(e.status_id)],
  ],
  image: e => e.image_path ?? null,
  editor: {
    fields: [
      imageField,
      { key: "name", label: "Event name", type: "text", required: true },
      { key: "date", label: "Date and time", type: "datetime-local", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "limit", label: "Participant limit", type: "number", required: true, min: "0", step: "1" },
      { key: "description", label: "Description", type: "textarea" },
      statusField,
    ],
    toForm: eventForm,
    blank: () => ({ image: "", name: "", date: "", location: "", limit: "", description: "", status: "1" }),
    validate: (f, row) => {
      const errors: Errors = {};
      if (!filled(f.name)) errors.name = "Enter the event name.";
      if (!filled(f.date)) errors.date = "Choose the event date and time.";
      const registered = row?.customer_ids.length ?? 0;
      if (!/^\d+$/.test(f.limit.trim())) errors.limit = "Enter a whole number, 0 or more.";
      else if (Number(f.limit) < registered) errors.limit = `The limit can’t be lower than the ${registered} people already registered.`;
      return errors;
    },
    create: async f => {
      const payload = Object.fromEntries(Object.entries(f).map(([key, value]) => eventFormKeys[key](value)));
      const data = await api<{ event_id: number }>("/api/events", "POST", payload);
      return data.event_id;
    },
    update: async (e, f) => {
      const payload = changes(f, eventForm(e), (key, value) => eventFormKeys[key](value));
      if (!Object.keys(payload).length) return false;
      await api(`/api/events/${e.event_id}`, "PATCH", payload);
      return true;
    },
  },
  remove: e => api(`/api/events/${e.event_id}`, "DELETE").then(() => undefined),
  deleteText: e => `This permanently removes “${e.name}”${e.customer_ids.length ? ` and its ${plural(e.customer_ids.length, "registration")}. Registered customers will no longer see it.` : "."}`,
};

// ---------------- appointments: full create, update, delete ----------------
let appointmentCustomers: AdminCustomer[] = [];
const apptFormKeys: Record<string, (value: string) => [string, unknown]> = {
  customer: v => ["customer_code", v.trim().toUpperCase()],
  date: v => ["appointment_time", fromDateInput(v)],
  description: v => ["description", v.trim()],
  status: v => ["status_id", Number(v)],
};
const apptForm = (a: AdminAppointment): Form => ({
  customer: a.customer_code ?? "", date: toDateInput(a.appointment_time), description: a.description, status: String(a.status_id ?? 1),
});

export const appointmentsModule: ModuleConfig<AdminAppointment> = {
  key: "appointments", title: "Appointments", singular: "appointment", table: "appointment",
  subtitle: "Repair bookings. Changes appear in the customer’s booking information.",
  searchHint: "Search by service or customer", filterLabel: "Filter by status",
  load: async () => {
    const [appointments, customers] = await Promise.all([fetchAppointments(), fetchCustomers()]);
    appointmentCustomers = customers;
    return appointments;
  },
  id: a => a.appointment_id, name: a => a.description || `Appointment #${a.appointment_id}`,
  searchText: a => [a.description, a.customer_name, a.customer_code].join(" "),
  filters: statusFilters(a => a.status_id),
  columns: [
    { label: "#", sortValue: a => a.appointment_id, cell: a => ({ text: `#${a.appointment_id}`, kind: "muted" }) },
    { label: "Service", sortValue: a => lower(a.description), cell: a => ({ text: a.description || "—", kind: "primary" }) },
    { label: "Customer", sortValue: a => lower(a.customer_name), cell: a => ({ text: a.customer_name }) },
    { label: "Date & time", sortValue: a => a.appointment_time ?? "", cell: a => ({ text: formatDate(a.appointment_time, true), kind: "muted" }) },
    { label: "Status", sortValue: a => a.status_id ?? 0, cell: a => status(a.status_id) },
  ],
  defaultSort: { column: 3, dir: "asc" },
  details: a => [
    ["Appointment", `#${a.appointment_id}`], ["Service", a.description || "—"],
    ["Customer", `${a.customer_name}${a.customer_code ? ` (${a.customer_code})` : ""}`],
    ["Date & time", formatDate(a.appointment_time, true)], ["Status", statusName(a.status_id)],
  ],
  customerOptions: () => appointmentCustomers.map(c => ({ value: c.customer_code, label: customerName(c) })),
  editor: {
    fields: [
      { key: "customer", label: "Customer ID", type: "customer", required: true, hint: "Type a customer ID such as LPVR003, or pick one from the list." },
      { key: "date", label: "Date and time", type: "datetime-local", required: true },
      { key: "description", label: "Service", type: "textarea", required: true },
      statusField,
    ],
    toForm: apptForm,
    blank: () => ({ customer: "", date: "", description: "", status: "1" }),
    validate: f => {
      const errors: Errors = {};
      const code = f.customer.trim().toUpperCase();
      if (!code) errors.customer = "Enter the customer ID, for example LPVR003.";
      else if (appointmentCustomers.length && !appointmentCustomers.some(c => c.customer_code === code)) errors.customer = `No customer has the ID ${code}.`;
      if (!filled(f.date)) errors.date = "Choose the appointment date and time.";
      if (!filled(f.description)) errors.description = "Describe the service.";
      else if (f.description.trim().length > 500) errors.description = "Keep the description under 500 characters.";
      return errors;
    },
    create: async f => {
      const payload = Object.fromEntries(Object.entries(f).map(([key, value]) => apptFormKeys[key](value)));
      const data = await api<{ appointment: AdminAppointment }>("/api/admin/appointments", "POST", payload);
      return data.appointment.appointment_id;
    },
    update: async (a, f) => {
      const payload = changes(f, apptForm(a), (key, value) => apptFormKeys[key](value));
      if (!Object.keys(payload).length) return false;
      await api(`/api/admin/appointments/${a.appointment_id}`, "PATCH", payload);
      return true;
    },
  },
  remove: a => api(`/api/admin/appointments/${a.appointment_id}`, "DELETE").then(() => undefined),
  deleteText: a => `This permanently removes appointment #${a.appointment_id} for ${a.customer_name}. It will disappear from their bookings.`,
};

// ---------------- orders: view and delete ----------------
export type OrderRow = AdminOrder & { payments: AdminPayment[] };

export const ordersModule: ModuleConfig<OrderRow> = {
  key: "orders", title: "Orders", singular: "order", table: "orders",
  subtitle: "Orders are placed by customers at checkout. Here you can view or remove them.",
  searchHint: "Search by order number or customer", filterLabel: "Filter by status",
  load: async () => {
    const { orders, payments } = await fetchDashboard();
    return orders.map(order => ({ ...order, payments: payments.filter(p => p.order_id === order.order_id) }));
  },
  id: o => o.order_id, name: o => `Order #${o.order_id}`,
  searchText: o => [`#${o.order_id}`, o.customer_name].join(" "),
  filters: statusFilters(o => o.status_id),
  columns: [
    { label: "Order", sortValue: o => o.order_id, cell: o => ({ text: `#${o.order_id}`, kind: "primary" }) },
    { label: "Customer", sortValue: o => lower(o.customer_name), cell: o => ({ text: o.customer_name || "—" }) },
    { label: "Date", sortValue: o => o.order_date ?? "", cell: o => ({ text: formatDate(o.order_date), kind: "muted" }) },
    { label: "Total", sortValue: o => o.total_amount, cell: o => ({ text: formatAmount(o.total_amount) }) },
    { label: "Payment", sortValue: o => (o.paid ? 1 : 0), cell: o => ({ text: o.paid ? "Paid" : "Unpaid", kind: "badge", badge: o.paid ? "adm-b-completed" : "adm-b-cancelled" }) },
    { label: "Status", sortValue: o => o.status_id ?? 0, cell: o => status(o.status_id) },
  ],
  defaultSort: { column: 2, dir: "desc" },
  details: o => [
    ["Order", `#${o.order_id}`], ["Customer", o.customer_name || "—"], ["Placed", formatDate(o.order_date, true)],
    ["Total", formatAmount(o.total_amount)],
    ["Payment", o.payments.length ? o.payments.map(p => `#${p.payment_id} · ${p.payment_method} · ${statusName(p.status_id)}`).join(", ") : "No payment recorded"],
    ["Status", statusName(o.status_id)],
  ],
  remove: o => api(`/api/orders/${o.order_id}`, "DELETE").then(() => undefined),
  deleteText: o => `This permanently removes order #${o.order_id}, its line items${o.payments.length ? ` and ${plural(o.payments.length, "payment")}` : ""}. Stock is not put back.`,
};

// ---------------- payments: view and delete ----------------
export const paymentsModule: ModuleConfig<AdminPayment> = {
  key: "payments", title: "Payments", singular: "payment", table: "payment",
  subtitle: "Payments are made by customers at checkout; card numbers are never stored. Here you can view or remove them.",
  searchHint: "Search by payment, order number or customer", filterLabel: "Filter by status",
  load: () => fetchDashboard().then(data => data.payments),
  id: p => p.payment_id, name: p => `Payment #${p.payment_id}`,
  searchText: p => [`#${p.payment_id}`, `#${p.order_id}`, p.payment_method, p.customer_name].join(" "),
  filters: statusFilters(p => p.status_id),
  columns: [
    { label: "Payment", sortValue: p => p.payment_id, cell: p => ({ text: `#${p.payment_id}`, kind: "primary" }) },
    { label: "Order", sortValue: p => p.order_id, cell: p => ({ text: `#${p.order_id}` }) },
    { label: "Customer", sortValue: p => lower(p.customer_name), cell: p => ({ text: p.customer_name || "—" }) },
    { label: "Date", sortValue: p => p.payment_date ?? "", cell: p => ({ text: formatDate(p.payment_date), kind: "muted" }) },
    { label: "Amount", sortValue: p => p.amount, cell: p => ({ text: formatAmount(p.amount) }) },
    { label: "Method", sortValue: p => lower(p.payment_method), cell: p => ({ text: p.payment_method, kind: "muted" }) },
    { label: "Status", sortValue: p => p.status_id ?? 0, cell: p => status(p.status_id) },
  ],
  defaultSort: { column: 3, dir: "desc" },
  details: p => [
    ["Payment", `#${p.payment_id}`], ["Order", `#${p.order_id}`], ["Customer", p.customer_name || "—"],
    ["Paid on", formatDate(p.payment_date, true)], ["Amount", formatAmount(p.amount)],
    ["Method", p.payment_method], ["Status", statusName(p.status_id)],
  ],
  remove: p => api(`/api/payments/${p.payment_id}`, "DELETE").then(() => undefined),
  deleteText: p => `This permanently removes payment #${p.payment_id}. Order #${p.order_id} will show as unpaid if it has no other completed payment.`,
};

// ---------------- inventory: full create, update, delete ----------------
/** Same thresholds as the customer Items page: 5 or fewer is low stock. */
export function stockCell(stock: number | null): Cell {
  if (stock == null) return { text: "Not tracked", kind: "badge", badge: "adm-b-cancelled" };
  if (stock === 0) return { text: "Out of stock", kind: "badge", badge: "adm-b-out" };
  if (stock <= 5) return { text: `Low · ${stock}`, kind: "badge", badge: "adm-b-pending" };
  return { text: `${stock} in stock`, kind: "badge", badge: "adm-b-completed" };
}

const itemFormKeys: Record<string, (value: string) => [string, unknown] | null> = {
  image: v => ["image_path", v || null],
  name: v => ["name", v.trim()],
  category: v => ["category", v.trim()],
  brand: v => ["brand", v.trim()],
  price: v => ["price", Number(v)],
  stock: v => ["stock_quantity", v.trim() === "" ? null : Number(v)],
  description: v => ["description", v.trim()],
  reason: () => null, // sent with a stock change only
};
const itemForm = (i: Item): Form => ({
  image: i.image_path ?? "", name: i.name, category: i.category ?? "", brand: i.brand ?? "",
  price: Number(i.price).toFixed(2), stock: i.stock_quantity == null ? "" : String(i.stock_quantity), reason: "", description: i.description ?? "",
});

export const inventoryModule: ModuleConfig<Item> = {
  key: "inventory", title: "Inventory", singular: "item", table: "item + inventory",
  subtitle: "Items for sale and their stock. Changes appear on the customer Items list and item pages.",
  searchHint: "Search by item name, category or brand", filterLabel: "Filter by stock",
  load: () => api<{ items: Item[] }>("/api/inventory").then(data => data.items),
  id: i => i.item_id, name: i => i.name,
  searchText: i => [i.name, i.category, i.brand, `#${i.item_id}`].join(" "),
  filters: [
    { label: "All", test: () => true },
    { label: "In stock", test: i => i.stock_quantity != null && i.stock_quantity > 5 },
    { label: "Low stock", test: i => i.stock_quantity != null && i.stock_quantity > 0 && i.stock_quantity <= 5 },
    { label: "Out of stock", test: i => i.stock_quantity === 0 },
    { label: "Not tracked", test: i => i.stock_quantity == null },
  ],
  columns: [
    { label: "Item", sortValue: i => lower(i.name), cell: i => ({ text: i.name, kind: "primary", thumb: i.image_path ?? null }) },
    { label: "Category", sortValue: i => lower(i.category), cell: i => ({ text: i.category || "—", kind: "muted" }) },
    { label: "Brand", sortValue: i => lower(i.brand), cell: i => ({ text: i.brand || "—", kind: "muted" }) },
    { label: "Price", sortValue: i => i.price, cell: i => ({ text: formatAmount(i.price) }) },
    { label: "Stock", sortValue: i => i.stock_quantity ?? -1, cell: i => stockCell(i.stock_quantity) },
  ],
  defaultSort: { column: 0, dir: "asc" },
  details: i => [
    ["Item ID", `#${i.item_id}`], ["Name", i.name], ["Category", i.category || "Not set"], ["Brand", i.brand || "Not set"],
    ["Price", formatAmount(i.price)], ["Stock", i.stock_quantity == null ? "Not tracked" : plural(i.stock_quantity, "unit")],
    ["Description", i.description || "No description"],
  ],
  image: i => i.image_path ?? null,
  editor: {
    fields: [
      imageField,
      { key: "name", label: "Item name", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "brand", label: "Brand", type: "text" },
      { key: "price", label: "Price (CAD)", type: "number", required: true, min: "0", step: "0.01" },
      { key: "stock", label: "Stock quantity", type: "number", min: "0", step: "1", hint: "Leave blank if the item is not stock-tracked (for example, a service)." },
      { key: "reason", label: "Reason for stock change", type: "text", hint: "Saved in the stock history, for example “Restock”." },
      { key: "description", label: "Description", type: "textarea" },
    ],
    toForm: itemForm,
    blank: () => ({ image: "", name: "", category: "", brand: "", price: "", stock: "", reason: "Initial stock", description: "" }),
    validate: f => {
      const errors: Errors = {};
      if (!filled(f.name)) errors.name = "Enter the item name.";
      if (!MONEY.test(f.price.trim())) errors.price = "Enter a price of 0 or more, with up to 2 decimals.";
      if (filled(f.stock) && !/^\d+$/.test(f.stock.trim())) errors.stock = "Enter a whole number, 0 or more, or leave it blank.";
      return errors;
    },
    create: async f => {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(f)) {
        const entry = itemFormKeys[key](value);
        if (entry) payload[entry[0]] = entry[1];
      }
      payload.reason = f.reason.trim() || "Item added";
      const data = await api<{ data: Item }>("/api/inventory", "POST", payload);
      return data.data.item_id;
    },
    update: async (i, f) => {
      const payload = changes(f, itemForm(i), (key, value) => itemFormKeys[key](value));
      if (!Object.keys(payload).length) return false;
      if ("stock_quantity" in payload) payload.reason = f.reason.trim() || null;
      await api(`/api/inventory/${i.item_id}`, "PATCH", payload);
      return true;
    },
  },
  remove: i => api(`/api/inventory/${i.item_id}`, "DELETE").then(() => undefined),
  deleteText: i => `This permanently removes “${i.name}”, its stock and its stock history. It will disappear from the customer Items list.`,
};

export const MODULES = {
  customers: customersModule,
  events: eventsModule,
  appointments: appointmentsModule,
  orders: ordersModule,
  payments: paymentsModule,
  inventory: inventoryModule,
};

/** Modules the admin can add to and edit; the rest are view and delete only. */
export const EDITABLE: ModuleKey[] = ["events", "appointments", "inventory"];
