const http = require("http");
const https = require("https");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
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
  upstream.on("error", () => {
    res.writeHead(502, cors);
    res.end(JSON.stringify({ error: "proxy_upstream_error" }));
  });
  req.pipe(upstream);
}).listen(8787, "127.0.0.1", () => {
  console.log("LLM proxy listening: http://127.0.0.1:8787/v1");
});
