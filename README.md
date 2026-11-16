# BTM 495 Project: Online Bike Shop Website

A full-stack bike shop in one command: online checkout, credit card payments, live inventory, events, and a rock-solid SQLite database.

```mermaid
flowchart LR
    U(["User<br/>(browser)"])
    FE["<b>1. Frontend</b><br/>React, TypeScript, CSS<br/>input and display only"]
    BE["<b>2. Backend</b><br/>routes, rules,<br/>models, responses"]
    DB[("<b>3. SQL layer</b><br/>SQLite<br/>one source of truth")]

    U -- "click" --> FE
    FE -- "HTTP /api" --> BE
    BE -- "SQL transaction" --> DB
    DB -. "result" .-> BE
    BE -. "JSON" .-> FE
    FE -. "message" .-> U
```

## Quick start

**Step 1. Clone the project**

```
git clone https://github.com/Humi852/BTM495_project.git
cd BTM495_project
```

**Step 2. Run the start script (one line)**

It creates the Python environment if needed, installs frontend dependencies on
first run (`npm ci`), builds the React frontend (`npm run build`), then starts
the Python server and opens `http://localhost:8765/`. Requires Python 3.10 or
newer and npm with Node.js 20.19+ on 20.x, 22.12+ on 22.x, or 24+.

Windows:

```
start.bat
```

macOS / Linux:

```
bash start.sh
```

Press `Ctrl+C` to stop. Add `--no-browser` to skip opening the browser. If the
lockfile changes, delete `frontend/node_modules` (or run `npm ci` in
`frontend`) before the next start.

Optional, for hot reload while editing the frontend: keep the start script
running and, in a second terminal, run `npm run dev` in `frontend`, then open
`http://localhost:5173/` instead.

**Step 3. Try the features in the browser**

| Section on the page | What to try |
| --- | --- |
| Profile login | Sign in with `login@example.com` / `1234`. |
| Database structure | See all tables and row counts. `status` has 3 rows: Pending, Completed, Cancelled. Click **Refresh data** to reload. |
| Orders | Click **Make a payment** to create a $50 sample order. Use the edit and delete icons on a row, or **Remove all orders**. |
| Mock credit card | The form is prefilled with a valid test card. Click **Review payment** and confirm. Any other card number is declined. |
| Payment history | See paid payments. Use the edit and delete icons, or **Remove all payments**. |
| Inventory | Click **Save item** to add or update an item. Click the history icon to see stock changes (who, when, why). Use the delete icon to remove it. |
| Event registration | Click **Add sample event (limit 2)**, then register customer IDs until it is full. Duplicate and over-limit registrations are rejected. Unregister with the `🗑 #id` button. |

No real payment is made and card details are never stored.

The customer views are also available at
`http://localhost:8765/views/customer/index.html`, linked from the local demo.
They include a browsable catalog, event list, and login. Other
customer pages are view scaffolds: signup, personal orders, cart, checkout,
event registration, appointments, and profile editing are not yet available.
Both login forms retain the session in the browser. The customer login redirects
customers to the home page and admins to the admin dashboard; use **Sign Out**
in the shared navigation or on the local demo page to revoke the session. Both
forms include a password visibility toggle and display sign-in progress and
errors.
The customer home and admin dashboard share a navigation bar linking to the
customer home, items, events, appointments, login, and profile pages.
Admin signup is not yet available; customer signup, appointments, and
cart pages are scaffolds. The local demo remains available at `/`. Admin
inventory and event pages use the existing inventory and event APIs. Event
editing, event dates and locations, appointment management, and order status
updates are not supported by those APIs and are identified as unavailable.

### Frontend development

The customer and admin screens are React components in
[`frontend/src`](frontend/src). The Python server serves their Vite build at
the existing `/views/customer/*.html` and `/views/admin/*.html` URLs. The
local demo at `/` is also a React page. The only source HTML is the minimal
Vite entry shell; page content is implemented in TSX.

To build or test the frontend explicitly:

```
cd frontend
npm ci
npm run build
npm test
```

For automatic test reruns while editing, run `npm run test:watch` in another
terminal. `npm test` runs the suite once and exits.

Vite serves the frontend and proxies `/api` and `/assets` to the Python
server, keeping the demo and frontend on the same origin. If the Python
server uses a different port, set `VITE_BACKEND_ORIGIN` before starting Vite
(for example, in PowerShell: `$env:VITE_BACKEND_ORIGIN='http://127.0.0.1:8766'`).
For a standalone Python-served frontend, run `npm run build` first; this is
not needed when using Vite's development server.

## Run the tests

```
python -m unittest discover -s tests -p "test_*.py"
```

Build the frontend first with `npm ci` and `npm run build` in `frontend` so
the page-serving tests can exercise its generated assets. The last line should
say `OK`. Warning and error log lines in the middle of
the run are expected. The tests use temporary databases, so they do not change
your data.

The frontend test suite covers the session, login, shared layout, customer and
admin pages, and the local demo's primary interactions.

## Optional config

- Fresh database: stop the server, then delete `database/lpvr.db`.
- Another port: `start.bat --port 8766` or `bash start.sh --port 8766`.
- Command-line mock payment: `python main.py`.

## Project structure

| Folder / file | Purpose |
| --- | --- |
| `frontend/src/main.tsx` | React entry point; picks the page from the URL |
| `frontend/src/views/customer/` | Customer screens; unsupported actions are identified |
| `frontend/src/views/admin/` | Admin screens; unsupported actions are identified |
| `frontend/src/views/demo/` | Local dry-run dashboard, payment, inventory, and event widgets |
| `frontend/src/components/` | Shared layout and navigation |
| `frontend/src/services/` | API client and login session helpers |
| `frontend/css/style.css` | Shared styles for all website pages |
| `frontend/tests/` | Vite dev-server test (each `*.test.tsx` sits next to its source file) |
| `backend/apis/` | Local website server and application operations (profiles, cart, orders, payments, inventory, events) |
| `backend/models/` | Python classes for users, items, carts, orders, payments, events, appointments |
| `backend/utils/` | SQLite query builder and transactions, validation, logging, responses, table/column/status constants |
| `database/` | `schema.sql` (tables), `sqlite_database.py` (creates and upgrades `lpvr.db`) |
| `tests/` | Website tests; `tests/unitTests/` has the unit tests |
| `start.bat` / `start.sh` | One-line setup and start |
| `run_local_website.py`, `main.py` | Start the website, run the command-line payment example |

Accounts: `createAccount` stores a PBKDF2 password hash, and `login` checks
Admin and Customer accounts by email and password. Passwords must be at least
eight characters (the local demo account `login@example.com` is the only
exception).

### Session API

`POST /api/login` accepts a JSON object with `email` and `password`. On
success it returns `status`, `user`, an opaque `token`, and `expires_at`
(Unix seconds, UTC). Sessions expire after 24 hours; only a SHA-256 hash of
the random token is stored in `user_session`. Expired rows are removed when a
new session is created.

Send `Authorization: Bearer <token>` to `GET /api/session` to check a session
and retrieve its user, or to `POST /api/logout` to revoke it. An invalid or
expired session check returns HTTP 401. Multiple sessions can coexist; logout
revokes only the supplied token. Database initialization adds the table to
existing databases.

The browser stores the bearer token in localStorage and sends it for session
checks and logout; the session persists across reloads and expires after 24
hours. A 401 clears the stored token; network or server errors are displayed
without silently discarding it.

This is a local demo, not production authentication: other pages and APIs are
not protected, even when a session exists. Do not expose this server or its
demo account publicly. Any script executing on the site can read localStorage
tokens, so an XSS vulnerability could expose them. Production use requires
HTTPS, authorization on protected endpoints, additional security controls,
and safer browser session storage such as HttpOnly, Secure, SameSite cookies
with CSRF protection.

## Details

**Checkout.** All steps run in one transaction: either all are saved or none.

```mermaid
flowchart LR
    C["Cart"] --> A["Check stock"]
    A --> B["Create order<br/>and order lines"]
    B --> E["Reduce stock"]
    B --> H["Write stock-history row"]
    E --> X["Clear the cart"]
    H --> X
    X --> OK(["Commit: all saved"])
    A -. "any step fails" .-> RB(["Rollback: nothing saved,<br/>user sees why"])
    B -.-> RB
    E -.-> RB
    H -.-> RB
```

**Data model.** Events, appointments, orders, and payments share one `status`
table: `1 Pending`, `2 Completed`, `3 Cancelled` (see `StatusID` in
`backend/utils/constants.py`).

```mermaid
flowchart LR
    customer -- places --> orders
    orders -- has --> order_item
    order_item -- is --> item
    orders -- "paid by" --> payment
    item -- "stock in" --> inventory
    item -- "changes in<br/>who, why, when" --> inventory_history
    customer -- books --> appointment
    customer -- joins --> event_registration
    event_registration -- for --> event
    admin -- manages --> event
    status["status<br/>1 Pending, 2 Completed, 3 Cancelled"]
    event -.-> status
    appointment -.-> status
    orders -.-> status
    payment -.-> status
```

## Contribution
Except for repo admins, everyone else needs to work on a local branch and open a PR.