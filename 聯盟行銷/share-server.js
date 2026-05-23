const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
const host = "0.0.0.0";

const types = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(root, requested));

  if (!file.startsWith(root)) {
    res.writeHead(403, { "content-type": "text/plain;charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain;charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Trip Splitter is available on this computer at http://localhost:${port}/`);
  console.log(`People on the same Wi-Fi can use http://YOUR-COMPUTER-IP:${port}/`);
});
