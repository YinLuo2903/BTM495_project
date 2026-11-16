import { createRoot } from "react-dom/client";
import { Layout } from "./components/Layout";
import { AdminPage } from "./views/admin/AdminPages";
import { CustomerPage } from "./views/customer/CustomerPages";
import { DemoPage } from "./views/demo/DemoPage";
import "../css/style.css";
import "../css/layout.css";

const parts = window.location.pathname.split("/");
const demo = ["/", "/views/index.html", "/view/index.html"].includes(window.location.pathname);
const admin = parts[2] === "admin";
const page = (parts[3] || "index.html").replace(/\.html$/, "");
document.title = demo ? "LPVR Local Dry-Run Website" : `${admin ? "Admin" : "Customer"} | LE PETIT VÉLO ROUGE`;

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");
createRoot(root).render(demo ? <DemoPage /> : <Layout admin={admin}>{admin ? <AdminPage page={page} /> : <CustomerPage page={page} />}</Layout>);
