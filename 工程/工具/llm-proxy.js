const http = require("http");
const https = require("https");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(res, status, payload) {
  res.writeHead(status, { ...cors, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, upstream: "yuyumaster.com" });
    return;
  }
  const headers = { ...req.headers, host: "yuyumaster.com" };
  delete headers.origin;
  const upstream = https.request({
    hostname: "yuyumaster.com",
    path: req.url,
    method: req.method,
    headers,
  }, r => {
    res.writeHead(r.statusCode || 502, { ...cors, ...r.headers });
    r.pipe(res);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error("upstream_timeout")));
  upstream.on("error", error => {
    if (!res.headersSent) json(res, error && error.message === "upstream_timeout" ? 504 : 502, { error: error && error.message || "proxy_upstream_error" });
    else res.end();
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}).listen(8787, "127.0.0.1", () => {
  console.log("LLM proxy listening: http://127.0.0.1:8787/v1");
});
