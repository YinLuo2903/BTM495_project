import { useEffect, useState, type FormEvent } from "react";
import { PhotoBand } from "../../components/Photo";
import { api, errorMessage, type ShopEvent } from "../../services/api";

interface Customer { customer_id: number; name: string }

export function DemoEvents({ revision }: { revision: number }) {
  const [events, setEvents] = useState<ShopEvent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [selected, setSelected] = useState("");
  async function load() {
    try {
      const result = await api<{ events: ShopEvent[]; customers: Customer[] }>("/api/events");
      setEvents(result.events); setCustomers(result.customers);
      setSelected(value => result.events.some(event => String(event.event_id) === value) ? value : String(result.events[0]?.event_id ?? ""));
    } catch (error) { setMessage(errorMessage(error)); setIsError(true); }
  }
  useEffect(() => { void load(); }, [revision]);

  async function run(path: string, method: string, body?: unknown) {
    try {
      const result = await api<{ message?: string }>(path, method, body);
      setMessage(result.message ?? "Done."); setIsError(false); await load();
    } catch (error) { setMessage(errorMessage(error)); setIsError(true); }
  }
  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("/api/event-registrations", "POST", { event_id: Number(selected), customer_id: Number(data.get("customer_id")) });
  }
  return <section className="card">
    <PhotoBand name="band-events" layout="corner" />
    <div className="card-heading"><div><h2>Event registration</h2><p className="muted">Create a sample event, then register customers until it is full.</p></div>
      <button type="button" onClick={() => void run("/api/events", "POST", { name: "Community Ride", participant_limit: 2 })}>Add sample event (limit 2)</button></div>
    <form className="inline-form" onSubmit={register}>
      <div><label htmlFor="registration-event">Event</label><select id="registration-event" value={selected} onChange={e => setSelected(e.target.value)} required>{events.map(event => <option value={event.event_id} key={event.event_id}>#{event.event_id} {event.name}</option>)}</select></div>
      <div><label htmlFor="registration-customer">Customer ID</label><input id="registration-customer" name="customer_id" type="number" min="1" required /></div>
      <button disabled={!events.length}>Register</button>
    </form>
    <p className={isError ? "error" : "muted"} role="status">{message}</p>
    <div className="table-wrap"><table><thead><tr><th>Event</th><th>Registered / limit</th><th>Customers</th><th>Actions</th></tr></thead><tbody>
      {events.length ? events.map(event => <tr key={event.event_id}><td>#{event.event_id} {event.name}</td><td>{event.customer_ids.length} / {event.participant_limit}</td>
        <td>{event.customer_ids.map(id => `#${id} ${customers.find(customer => customer.customer_id === id)?.name ?? ""}`.trim()).join(", ") || "—"}</td>
        <td className="row-actions">{event.customer_ids.map(id => <button key={id} type="button" aria-label={`Unregister customer #${id}`} onClick={() => void run(`/api/event-registrations/${event.event_id}/${id}`, "DELETE")}>🗑 #{id}</button>)}
          <button type="button" aria-label={`Delete event #${event.event_id}`} onClick={() => { if (window.confirm(`Delete event #${event.event_id} and its registrations?`)) void run(`/api/events/${event.event_id}`, "DELETE"); }}>🗑 event</button></td></tr>)
        : <tr><td colSpan={4}>{isError ? "Events unavailable." : "No events yet. Add a sample event."}</td></tr>}
    </tbody></table></div>
  </section>;
}
