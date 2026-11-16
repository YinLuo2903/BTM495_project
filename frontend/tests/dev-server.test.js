import { createServer as createBackend } from "node:http";
import { afterEach, expect, it } from "vitest";
import { createServer as createVite } from "vite";

let backend;
let vite;

afterEach(async () => {
  if (vite) await vite.close();
  if (backend) await new Promise((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
  delete process.env.VITE_BACKEND_ORIGIN;
});

it("proxies API and assets while serving React routes", async () => {
  backend = createBackend((request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end(`backend:${request.url}`);
  });
  await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
  process.env.VITE_BACKEND_ORIGIN = `http://127.0.0.1:${backend.address().port}`;
  vite = await createVite({ server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;

  for (const path of ["/api/events", "/assets/images/logo.png"]) {
    const response = await fetch(origin + path);
    expect(await response.text()).toBe(`backend:${path}`);
  }
  for (const path of ["/", "/?test=1", "/view/index.html", "/views/index.html", "/views/customer/item.html?id=1"]) {
    const response = await fetch(origin + path);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('/src/main.tsx');
  }
});
