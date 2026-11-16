import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../services/api";
import { signIn, signOut, watchSession, type Session } from "../../services/session";
import { DemoInventory } from "./DemoInventory";
import { DemoEvents } from "./DemoEvents";
import { DemoOrders, type Order, type Payment } from "./DemoOrders";

interface Dashboard { database: string; tables: { name: string; rows: number }[]; orders: Order[]; payments: Payment[] }

function DemoLogin() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("Checking session...");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => watchSession((value, reason) => {
    setSession(value);
    setStatus(reason ? `Could not check session: ${reason.message}` : value ? `Signed in as ${value.user.name}.` : "Not signed in.");
    if (!value) setMessage("");
  }), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("Signing in...");
    try {
      const user = await signIn(String(data.get("email")), String(data.get("password")));
      setMessage(`Signed in as ${user.name} (${user.is_admin ? "Admin" : "Customer"}).`);
      form.reset(); setVisible(false);
    } catch (reason) { setMessage(""); setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await signOut(); setMessage(""); setError(""); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="card" aria-labelledby="login-title"><h2 id="login-title">Profile login</h2>
    <p className="muted">Sign in with an existing Admin or Customer account.</p><p className="muted">Local demo credentials: <code>login@example.com</code> / <code>1234</code></p>
    <p role="status" aria-live="polite">{status}</p>{session && <button type="button" disabled={busy} onClick={() => void logout()}>Sign out</button>}
    <form onSubmit={submit} aria-busy={busy || undefined}><label htmlFor="demo-email">Email</label><input id="demo-email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="demo-password">Password</label><div className="password-field"><input id="demo-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required />
        <button type="button" className="password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-controls="demo-password" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
      <p className="muted" role="status">{message}</p>{error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form></section>;
}

export function DemoPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState({ label: "Loading…", state: "pending" });
  async function reload(): Promise<Order[]> {
    setLoading(true); setError("");
    try {
      const result = await api<Dashboard>("/api/dashboard");
      setDashboard(result); setStatus({ label: "Database connected", state: "ok" });
      setRevision(value => value + 1);
      return result.orders;
    } catch (reason) {
      setError(errorMessage(reason)); setStatus({ label: "Connection failed", state: "error" }); setDashboard(null);
      throw reason;
    } finally { setLoading(false); }
  }
  function refresh() {
    void reload().catch(reason => console.error("Could not refresh dashboard:", reason));
  }
  useEffect(() => { refresh(); }, []);
  return <main className="page">
    <header className="header"><div><p className="eyebrow">LOCAL DEVELOPMENT · MOCK PAYMENTS</p><h1>Local dry-run website</h1>
      <p className="subtitle">Review application data and simulate credit-card payments.</p><p className="subtitle"><a href="/views/customer/index.html">Open customer views</a></p></div>
      <span className={`status status-${status.state}`}>{status.label}</span></header>
    <DemoLogin />
    <section className="card"><div className="card-heading"><div><h2>Database structure</h2><p className="muted">{dashboard ? `Connected to ${dashboard.database}` : loading ? "Loading SQLite data…" : "Could not load database data"}</p></div>
      <button disabled={loading} onClick={refresh}>Refresh data</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>SQLite table</th><th>Rows</th></tr></thead><tbody>
        {dashboard?.tables.length ? dashboard.tables.map(table => <tr key={table.name}><td>{table.name}</td><td>{table.rows}</td></tr>) : <tr><td colSpan={2}>{loading ? "Loading database structure…" : dashboard ? "No application tables were found." : "Database structure unavailable."}</td></tr>}
      </tbody></table></div></section>
    <DemoOrders orders={dashboard?.orders ?? []} payments={dashboard?.payments ?? []} reload={reload} report={setError}
      available={dashboard !== null} setStatus={(label, state) => setStatus({ label, state })} />
    <DemoInventory revision={revision} /><DemoEvents revision={revision} />
    <p className="footnote">Only the approved test card succeeds. Sample orders are saved, but payment attempts and card details are not. No external bank is contacted.</p>
  </main>;
}
