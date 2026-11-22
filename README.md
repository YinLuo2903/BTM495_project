# BTM 495 Project: Online Bike Shop Website

A full-stack bike shop website: online ordering, process payment with credit card, manage inventory/repair appointments/events, and SQLite database. The platform porvides a centralized database and a admin dashboard to streamline business operation.

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
git clone https://github.com/YinLuo2903/BTM495_project.git
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

**As a customer**

| What to do | How |
| --- | --- |
| Sign in | Click **Sign In** and use `login@example.com` / `1234`. |
| Shop | Open **Items**, add items to the **Shopping Cart**, then check out. |
| Join an event | Open **Events** and register for an event. |
| Book a repair | Open **Appointments** and book a repair appointment. |
| Update your details | Once signed in, click your name to open **My Profile** and edit your details. |
| Create an account | New customers click **Create account** at the top of the home page. |

**As an admin**

| What to do | How |
| --- | --- |
| Sign in | Click **Sign In** and use `admin@lpvr.com` / `123456789`. The admin dashboard opens. |
| See accounts and the schedule | **Customers** lists every registered account. **Dashboard** shows this week's events and appointments. |
| Manage the shop | Create, view, update and delete **Events**, **Appointments** and **Inventory**. |

No real payment is made and card details are never stored.

### Where to find each part

| Part | Address |
| --- | --- |
| Customer site | `http://localhost:8765/views/customer/index.html` |
| Admin dashboard | `http://localhost:8765/views/admin/index.html` |
| Local demo (developer test page) | `http://localhost:8765/` |

Customers and the admin share one **Sign In** page: customers land on the home
page, the admin lands on the dashboard. You stay signed in for 24 hours or
until you click **Sign Out**. Admin accounts can't be created from the website.



## Contribution
Except for repo admins, everyone else needs to work on a local branch and open a PR.
