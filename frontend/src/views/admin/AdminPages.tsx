import { useEffect, useState, type ComponentType } from "react";
import { errorMessage } from "../../services/api";
import { signOut, watchSession, type Session } from "../../services/session";
import { AdminDashboard } from "./AdminDashboard";
import { MODULES, type ModuleConfig } from "./adminModules";
import { ManagePage } from "./ManagePage";
import { AppointmentsIcon, CustomersIcon, DashboardIcon, EventsIcon, InventoryIcon, OrdersIcon, PaymentsIcon } from "./icons";

/** Sidebar order, as agreed for the admin dashboard. */
const NAV: { page: string; label: string; Icon: ComponentType }[] = [
  { page: "index", label: "Dashboard", Icon: DashboardIcon },
  { page: "customers", label: "Customers", Icon: CustomersIcon },
  { page: "events", label: "Events", Icon: EventsIcon },
  { page: "appointments", label: "Appointments", Icon: AppointmentsIcon },
  { page: "orders", label: "Orders", Icon: OrdersIcon },
  { page: "payments", label: "Payments", Icon: PaymentsIcon },
  { page: "inventory", label: "Inventory", Icon: InventoryIcon },
];
const LOGIN_URL = "/views/customer/login.html";

/** Admin pages: a left sidebar plus the dashboard or one management module. */
export function AdminPage({ page }: { page: string }) {
  // items.html is an older address of the inventory page.
  const current = page === "items" ? "inventory" : page;
  const config = current in MODULES ? (MODULES[current as keyof typeof MODULES] as ModuleConfig<unknown>) : null;

  return <div className="adm">
    <Sidebar current={current} />
    <main className="adm-main">
      {current === "index" ? <AdminDashboard />
        : config ? <ManagePage key={config.key} config={config} />
        : <div className="adm-head"><div><h1>Page not found</h1><p>Choose a section from the menu.</p></div></div>}
    </main>
  </div>;
}

function Sidebar({ current }: { current: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watchSession((value, error) => {
    setSession(value);
    setMessage(error ? `Session unavailable: ${error.message}` : "");
  }), []);

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      window.location.assign(LOGIN_URL);
    } catch (reason) {
      setMessage(`Sign out failed: ${errorMessage(reason)}`);
      setBusy(false);
    }
  }

  const name = session?.user.name ?? "";
  return <aside className="adm-side" aria-label="Admin navigation">
    <div className="adm-account">
      {session ? <div className="adm-account-who">
        <span className="adm-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <span className="adm-account-name">{name}</span>
      </div> : <a href={LOGIN_URL}>Sign in</a>}
      <div className="adm-account-links">
        <a href="/views/customer/index.html">Customer site</a>
        {session && <button type="button" className="adm-signout" disabled={busy} onClick={() => void logout()}>Sign Out</button>}
      </div>
      <p className="adm-account-error" role="status" aria-live="polite">{message}</p>
    </div>
    <nav aria-label="Admin sections">
      <ul className="adm-nav-list">
        {NAV.map(({ page, label, Icon }) => <li key={page}>
          <a className="adm-nav-link" href={`/views/admin/${page}.html`} aria-current={page === current ? "page" : undefined}><Icon />{label}</a>
        </li>)}
      </ul>
    </nav>
  </aside>;
}
