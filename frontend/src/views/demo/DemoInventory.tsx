import { useEffect, useState, type FormEvent } from "react";
import { PhotoBand } from "../../components/Photo";
import { api, errorMessage, formatAmount, type Item } from "../../services/api";

interface HistoryEntry {
  createdAt: string;
  oldQuantity: number | null;
  newQuantity: number | null;
  adminId: number | null;
  reason: string | null;
}

export function DemoInventory({ revision }: { revision: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [item, setItem] = useState({ id: "1", name: "Road Tube", price: "8.50", stock: "10", admin: "", reason: "" });

  async function load() {
    try { setItems((await api<{ items: Item[] }>("/api/inventory")).items); }
    catch (error) { setIsError(true); setMessage(errorMessage(error)); }
  }
  useEffect(() => { void load(); }, [revision]);

  async function showHistory(id: number) {
    try {
      setHistory((await api<{ history: HistoryEntry[] }>(`/api/inventory/${id}/history`)).history);
      setHistoryId(id);
    } catch (error) { setIsError(true); setMessage(errorMessage(error)); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(item.id);
    const fields = {
      name: item.name.trim(), price: Number(item.price), stock_quantity: item.stock.trim() ? Number(item.stock) : null,
      admin_id: item.admin.trim() ? Number(item.admin) : null, reason: item.reason.trim() || null,
    };
    try {
      const exists = items.some(value => value.item_id === id);
      const result = await api<{ message: string }>(exists ? `/api/inventory/${id}` : "/api/inventory", exists ? "PATCH" : "POST", exists ? fields : { item_id: id, ...fields });
      setIsError(false); setMessage(result.message);
      await load(); await showHistory(id);
    } catch (error) { setIsError(true); setMessage(errorMessage(error)); }
  }

  async function remove(id: number) {
    if (!window.confirm(`Delete item #${id}, its stock and its history?`)) return;
    try {
      const result = await api<{ message: string }>(`/api/inventory/${id}`, "DELETE");
      setIsError(false); setMessage(result.message); setHistory(null); setHistoryId(null); await load();
    } catch (error) { setIsError(true); setMessage(errorMessage(error)); }
  }

  return <section className="card">
    <PhotoBand name="band-inventory" />
    <h2>Inventory</h2><p className="muted">Stock lives in the inventory table; every quantity change is written to its history. Saving an existing item ID updates only what changed. Leave stock empty for an untracked item.</p>
    <form className="inline-form" onSubmit={save}>
      <div><label htmlFor="item-id">Item ID</label><input id="item-id" type="number" min="1" value={item.id} onChange={e => setItem({ ...item, id: e.target.value })} required /></div>
      <div><label htmlFor="item-name">Name</label><input id="item-name" value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} required /></div>
      <div><label htmlFor="item-price">Price</label><input id="item-price" type="number" min="0" step="0.01" value={item.price} onChange={e => setItem({ ...item, price: e.target.value })} required /></div>
      <div><label htmlFor="item-stock">Stock</label><input id="item-stock" type="number" min="0" step="1" value={item.stock} onChange={e => setItem({ ...item, stock: e.target.value })} /></div>
      <div><label htmlFor="item-admin">Admin ID (optional)</label><input id="item-admin" type="number" min="1" value={item.admin} onChange={e => setItem({ ...item, admin: e.target.value })} /></div>
      <div><label htmlFor="item-reason">Reason (optional)</label><input id="item-reason" placeholder="Cycle count" value={item.reason} onChange={e => setItem({ ...item, reason: e.target.value })} /></div>
      <button>Save item</button>
    </form>
    <p className={isError ? "error" : "muted"} role="status">{message}</p>
    <div className="table-wrap"><table><thead><tr><th>Item</th><th>Name</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>
      {items.length ? items.map(value => <tr key={value.item_id}><td>#{value.item_id}</td><td>{value.name}</td><td>{formatAmount(value.price)}</td><td>{value.stock_quantity ?? "Not tracked"}</td><td className="row-actions">
        <button type="button" aria-label={`Edit item #${value.item_id}`} onClick={() => setItem({ ...item, id: String(value.item_id), name: value.name, price: String(value.price), stock: value.stock_quantity === null ? "" : String(value.stock_quantity) })}>✎</button>
        <button type="button" aria-label={`History of item #${value.item_id}`} onClick={() => void showHistory(value.item_id)}>🕘</button>
        <button type="button" aria-label={`Delete item #${value.item_id}`} onClick={() => void remove(value.item_id)}>🗑</button>
      </td></tr>) : <tr><td colSpan={5}>{isError ? "Inventory unavailable." : "No items yet. Save one above."}</td></tr>}
    </tbody></table></div>
    <h3>{historyId === null ? "Stock history" : `Stock history for item #${historyId}`}</h3>
    <div className="table-wrap"><table><thead><tr><th>When</th><th>Old</th><th>New</th><th>Admin</th><th>Reason</th></tr></thead><tbody>
      {history?.length ? history.map((entry, index) => <tr key={index}><td>{entry.createdAt}</td><td>{entry.oldQuantity ?? "—"}</td><td>{entry.newQuantity ?? "not tracked"}</td><td>{entry.adminId ?? "system"}</td><td>{entry.reason ?? ""}</td></tr>)
        : <tr><td colSpan={5}>{history ? "No stock changes recorded." : "Choose the history icon on an item."}</td></tr>}
    </tbody></table></div>
  </section>;
}
