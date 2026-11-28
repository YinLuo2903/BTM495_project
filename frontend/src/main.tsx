import { createRoot } from "react-dom/client";
import { Layout } from "./components/Layout";
import { AdminPage } from "./views/admin/AdminPages";
import { CustomerPage } from "./views/customer/CustomerPages";
import { DRY_RUN_URL } from "./urls";
import { DemoPage } from "./views/demo/DemoPage";
import "../css/style.css";
import "../css/layout.css";

// "/" (and the old /views/index.html) is the customer home page; the dry-run page is admin-side.
const parts = window.location.pathname.split("/");
const demo = window.location.pathname === DRY_RUN_URL;
const admin = parts[2] === "admin";
const page = (parts[3] || "index.html").replace(/\.html$/, "");
document.title = demo ? "LPVR Local Dry-Run Website" : `${admin ? "Admin" : "Customer"} | LE PETIT VÉLO ROUGE`;

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");
// Admin pages bring their own sidebar; customer pages share the top navigation and footer.
createRoot(root).render(demo ? <DemoPage /> : admin ? <AdminPage page={page} /> : <Layout><CustomerPage page={page} /></Layout>);
