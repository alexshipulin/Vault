import http from "node:http";

const port = Number(process.env.VAULT_DEBUG_SINK_PORT ?? 8797);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => resolve(raw));
    request.on("error", reject);
  });
}

function logEvent(payload) {
  const timestamp = payload?.timestamp ?? new Date().toISOString();
  const message = payload?.message ?? "Unknown runtime error";
  const metadata = payload?.metadata ? ` ${JSON.stringify(payload.metadata)}` : "";

  console.error(`\n[device-error] ${timestamp} ${message}${metadata}`);

  if (payload?.stack) {
    console.error(payload.stack);
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, port }));
    return;
  }

  if (request.method === "POST" && request.url === "/events") {
    try {
      const raw = await readBody(request);
      const payload = raw ? JSON.parse(raw) : {};
      logEvent(payload);
      response.writeHead(204);
      response.end();
      return;
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Invalid payload" }));
      return;
    }
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[device-error-sink] listening on http://0.0.0.0:${port}`);
  console.log("[device-error-sink] start Expo in the same Wi-Fi network and device runtime errors will print here.");
});
