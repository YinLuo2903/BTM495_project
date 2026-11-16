import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, formatAmount, type Item, type ShopEvent } from "../../services/api";

interface Order {
  order_id: number;
  order_date: string;
  total_amount: number;
  paid: boolean;
}

interface History {
  createdAt: string;
  oldQuantity: number | null;
  newQuantity: number | null;
  adminId: number | null;
  reason: string | null;
}

function useAdminData(page: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<ShopEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(page !== "appointments");
  const [loaded, setLoaded] = useState(false);
  async function reload() {
    if (page === "appointments") return;
    setLoading(true);
    try {
      const [inventory, eventData, dashboard] = await Promise.all([
        page === "index" || page === "items" || page === "inventory"
          ? api<{ items: Item[] }>("/api/inventory") : Promise.resolve(null),
        page === "index" || page === "events"
          ? api<{ events: ShopEvent[] }>("/api/events") : Promise.resolve(null),
        page === "index" || page === "orders"
          ? api<{ orders: Order[] }>("/api/dashboard") : Promise.resolve(null),
      ]);
      if (inventory) setItems(inventory.items);
      if (eventData) setEvents(eventData.events);
      if (dashboard) setOrders(dashboard.orders);
      setLoaded(true);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void reload(); }, [page]);
  return { items, events, orders, error, setError, loading, loaded, reload };
}

function Inventory({ items, reload, report }: { items: Item[]; reload: () => Promise<void>; report: (message: string) => void }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [history, setHistory] = useState<History[] | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const stock = String(data.get("stock_quantity")).trim();
    const itemId = Number(data.get("item_id"));
    const body = {
      name: String(data.get("name")), description: String(data.get("description")),
      category: String(data.get("category")), brand: String(data.get("brand")),
      price: Number(data.get("price")), stock_quantity: stock === "" ? null : Number(stock),
      reason: String(data.get("reason")).trim() || null,
    };
    try {
      await api(editing ? `/api/inventory/${editing.item_id}` : "/api/inventory", editing ? "PATCH" : "POST", editing ? body : { ...body, item_id: itemId });
      form.reset();
      setEditing(null);
      report("");
      await reload();
    } catch (reason) { report(errorMessage(reason)); }
  }
  async function remove(item: Item) {
    if (!window.confirm(`Delete item #${item.item_id}, its stock and its history?`)) return;
    try { await api(`/api/inventory/${item.item_id}`, "DELETE"); setHistory(null); report(""); await reload(); }
    catch (reason) { report(errorMessage(reason)); }
  }
  async function showHistory(id: number) {
    try {
      const data = await api<{ history: History[] }>(`/api/inventory/${id}/history`);
      setHistory(data.history); setHistoryId(id); report("");
    } catch (reason) { report(errorMessage(reason)); }
  }
  return <>
    <section className="card"><h2>{editing ? `Edit item #${editing.item_id}` : "Add item"}</h2>
      <form key={editing?.item_id ?? "new"} onSubmit={submit}>
        {!editing && <><label htmlFor="admin-item-id">Item ID</label><input id="admin-item-id" name="item_id" type="number" min="1" required /></>}
        <label htmlFor="admin-item-name">Name</label><input id="admin-item-name" name="name" defaultValue={editing?.name} required />
        <label htmlFor="admin-item-description">Description</label><input id="admin-item-description" name="description" defaultValue={editing?.description} />
        <label htmlFor="admin-item-category">Category</label><input id="admin-item-category" name="category" defaultValue={editing?.category} />
        <label htmlFor="admin-item-brand">Brand</label><input id="admin-item-brand" name="brand" defaultValue={editing?.brand} />
        <label htmlFor="admin-item-price">Price</label><input id="admin-item-price" name="price" type="number" step="0.01" min="0" defaultValue={editing?.price} required />
        <label htmlFor="admin-item-stock">Stock (leave blank if not tracked)</label><input id="admin-item-stock" name="stock_quantity" type="number" min="0" step="1" defaultValue={editing?.stock_quantity ?? ""} />
        <label htmlFor="admin-item-reason">Stock change reason</label><input id="admin-item-reason" name="reason" />
        <p><button>Save item</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel edit</button>}</p>
      </form></section>
    <section className="card"><h2>Current inventory</h2><label htmlFor="inventory-search">Search items</label>
      <input id="inventory-search" value={search} onChange={event => setSearch(event.target.value)} />
      <table><thead><tr><th>Item</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody>{items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <tr key={item.item_id}>
          <td>#{item.item_id} {item.name}</td><td>{formatAmount(item.price)}</td><td>{item.stock_quantity ?? "Not tracked"}</td>
          <td><button type="button" onClick={() => setEditing(item)}>Edit</button> <button type="button" onClick={() => void showHistory(item.item_id)}>History</button> <button type="button" onClick={() => void remove(item)}>Delete</button></td>
        </tr>)}</tbody></table>
      {!items.length && <p>No items yet.</p>}
      {history && <div><h3>Stock history for item #{historyId}</h3>{history.length ? <ul>{history.map((entry, index) => <li key={index}>{entry.createdAt}: {entry.oldQuantity ?? "—"} → {entry.newQuantity ?? "not tracked"}; {entry.adminId ?? "system"}; {entry.reason ?? ""}</li>)}</ul> : <p>No stock changes recorded.</p>}</div>}
    </section>
  </>;
}

function EventAdmin({ events, reload, report }: { events: ShopEvent[]; reload: () => Promise<void>; report: (message: string) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/api/events", "POST", { name: String(data.get("name")), participant_limit: Number(data.get("participant_limit")) });
      form.reset(); report(""); await reload();
    } catch (reason) { report(errorMessage(reason)); }
  }
  async function remove(event: ShopEvent) {
    if (!window.confirm(`Delete event #${event.event_id} and its registrations?`)) return;
    try { await api(`/api/events/${event.event_id}`, "DELETE"); report(""); await reload(); }
    catch (reason) { report(errorMessage(reason)); }
  }
  return <>
    <section className="card"><h2>Add event</h2><p>Event editing, dates, locations, and prices are not supported yet.</p>
      <form onSubmit={submit}><label htmlFor="admin-event-name">Event name</label><input id="admin-event-name" name="name" required />
        <label htmlFor="admin-event-capacity">Participant limit</label><input id="admin-event-capacity" name="participant_limit" type="number" min="0" step="1" required />
        <p><button>Save event</button></p></form></section>
    <section className="card"><h2>Events list</h2>{events.length ? <ul>{events.map(event => <li key={event.event_id}>{event.name} ({event.customer_ids.length} / {event.participant_limit} registered) <button type="button" onClick={() => void remove(event)}>Delete</button></li>)}</ul> : <p>No events yet.</p>}</section>
  </>;
}

function OrderAdmin({ orders, reload, report }: { orders: Order[]; reload: () => Promise<void>; report: (message: string) => void }) {
  const [search, setSearch] = useState("");
  async function remove(id?: number) {
    if (!window.confirm(id === undefined ? "Delete all orders and their payments?" : `Delete order #${id} and its payments?`)) return;
    try { await api(id === undefined ? "/api/orders" : `/api/orders/${id}`, "DELETE"); report(""); await reload(); }
    catch (reason) { report(errorMessage(reason)); }
  }
  return <section className="card"><h2>All orders</h2><p>Order status updates and detailed customer information are not available yet.</p>
    <label htmlFor="order-search">Search by order ID</label><input id="order-search" value={search} onChange={event => setSearch(event.target.value)} />
    <p><button type="button" onClick={() => void remove()}>Clear all orders</button></p>
    <table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Payment</th><th>Actions</th></tr></thead><tbody>
      {orders.filter(order => String(order.order_id).includes(search.trim())).map(order => <tr key={order.order_id}>
        <td>#{order.order_id}</td><td>{order.order_date}</td><td>{formatAmount(order.total_amount)}</td><td>{order.paid ? "Paid" : "Unpaid"}</td>
        <td><button type="button" onClick={() => void remove(order.order_id)}>Delete</button></td></tr>)}</tbody></table>
  </section>;
}

export function AdminPage({ page }: { page: string }) {
  const { items, events, orders, error, setError, loading, loaded, reload } = useAdminData(page);
  const titles: Record<string, string> = { index: "Admin Dashboard", items: "Manage Items", inventory: "Manage Inventory", orders: "Manage Orders", events: "Manage Events", appointments: "Manage Appointments" };
  return <main className="page"><p><a href="/views/customer/index.html">← Customer View</a>{page !== "index" && <> · <a href="index.html">Back to Dashboard</a></>}</p>
    <h1>{titles[page] ?? "Page not found"}</h1>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p role="status">Loading…</p>}
    {page === "index" && <><p>Welcome to the admin panel. Select a section below to manage your bike shop.</p>
      {!loading && !error && <><section className="card"><h2>Summary</h2><p>Total orders: {orders.length}</p><p>Pending order count is not available yet.</p><p>Total items: {items.length}</p><p>Events: {events.length}</p></section>
        <section className="card"><h2>Inventory alerts</h2><ul>{items.filter(item => item.stock_quantity !== null && item.stock_quantity < 10).map(item => <li key={item.item_id}>{item.name}: {item.stock_quantity} units</li>)}</ul></section>
        <section className="card"><h2>Events</h2><p>Event dates are not available yet.</p><ul>{events.slice(0, 3).map(event => <li key={event.event_id}>{event.name}</li>)}</ul></section></>}</>}
    {loaded && (page === "items" || page === "inventory") && <Inventory items={items} reload={reload} report={setError} />}
    {loaded && page === "events" && <EventAdmin events={events} reload={reload} report={setError} />}
    {loaded && page === "orders" && <OrderAdmin orders={orders} reload={reload} report={setError} />}
    {!loading && !loaded && error && <button type="button" onClick={() => void reload()}>Retry</button>}
    {page === "appointments" && <section className="card"><h2>Appointments</h2><p>Managing appointments is not available yet.</p><button type="button" disabled>Add appointment</button></section>}
  </main>;
}
