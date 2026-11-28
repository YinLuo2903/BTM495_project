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

## Download

No setup needed: get the latest copy from the
[Releases page](https://github.com/YinLuo2903/BTM495_project/releases/latest) and open it. The site
opens in your browser at `http://localhost:8765/`, with sample data loaded. The Windows (`.exe`),
macOS and Linux programs have Python built in, so nothing else needs installing; the database and
uploaded pictures are kept in a `LPVR Bike Shop` folder in your home folder.

Opening it again while it is running replaces the running copy. Close its window to stop the site.

Maintainers: pushing a version tag (for example `git tag ver2.2 && git push origin ver2.2`) builds
all downloads and publishes the release (see `.github/workflows/release.yml`).

## Run from source (developers)

For working on the code. After cloning, `scripts/start.sh` (macOS / Linux) or
`scripts\start.bat` (Windows) creates the Python environment, installs and builds
the frontend, then starts the site the same way the downloads do. Requires
Python 3.10+ and Node.js 20.19+ on 20.x, 22.12+ on 22.x, or 24+. When running
from source, the database and uploads stay in `database/`.

## Try the features

### Where to find each part

| Part | Address |
| --- | --- |
| Customer site | `http://localhost:8765/views/customer/index.html` |
| Admin dashboard | `http://localhost:8765/views/admin/index.html` |
| Local dry run (developer test page) | `http://localhost:8765/views/admin/dry-run.html`, or **Open local dry run** on the admin dashboard |

Customers and the admin share one **Sign In** page: customers land on the home
page, the admin lands on the dashboard. You stay signed in for 24 hours or
until you click **Sign Out**. Admin accounts can't be created from the website.

**As a customer**

| What to do | How |
| --- | --- |
| Create an account | New customers click **Create account** at the top of the home page. |
| Sign in | Click **Sign In** and use `login@example.com` / `1234`. |
| Shop | Open **Items** to browse or search for products, add items to the **Shopping Cart**, and proceed to checkout and payment. |
| Join an event | Open **Events** to view upcoming events and register for an event. |
| Book a repair | Open **Appointments**, select an available time slot, describe the bike issue, and confirm the booking. |
| Update profile| Once signed in, click your name to open **My Profile** and edit your personal information. |


**As an admin**

 What to do | How |
| --- | --- |
| Sign in | Click **Sign In** and use `admin@lpvr.com` / `123456789`. The admin dashboard opens automatically. |
| dashboard | The **Dashboard** shows an overview of shop activities, including upcoming events and appointments. |
| customers | Open **Customers** to view registered customer accounts and their information. |
| events | Open **Events** to create, view, update, or delete events. |
| appointments | Open **Appointments** to view, create, update, or delete repair bookings. |
| orders | Open **Orders** to view customer orders, including purchased items, order details, and status. |
| payments | Open **Payments** to view payment records, including amounts, payment methods, and payment status. |
| inventory | Open **Items** to add, view, update, or delete shop items and their details. |

No real payment is made and card details are never stored.

## Contribution
Except for repo admins, everyone else needs to work on a local branch and open a PR.

## License
The source code is released under the [MIT License](LICENSE).

The photos and logo are not covered by the MIT License. The shop's logo and photos belong to
Le Petit Vélo Rouge, two photos belong to Ivan de Jacquelin / The Link, and the sample
item and event photos come from Wikimedia Commons under Creative Commons licenses or the public domain. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for every file and its terms; the website
shows the same credits on its **Photo credits** page (linked in the footer).
