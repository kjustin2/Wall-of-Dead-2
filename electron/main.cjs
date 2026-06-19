// Standalone desktop launcher for DEAD AIR.
// Serves the built dist/ over a localhost HTTP server (so the game's absolute
// asset paths, ES modules and fetch() behave exactly as in a browser) and opens
// it in a borderless-ish Electron window. Build first: `npm run build`.
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const DIST = path.join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".cube": "text/plain"
};

function serveDist() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(DIST, "index.html"))) {
      reject(new Error("dist/ not found — run `npm run build` first"));
      return;
    }
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || "/").split("?")[0]);
      if (rel === "/") rel = "/index.html";
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
        res.end(data);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function main() {
  await app.whenReady();
  let url;
  try {
    const port = await serveDist();
    url = `http://127.0.0.1:${port}/`;
  } catch (e) {
    console.error(e.message);
    app.quit();
    return;
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#020304",
    autoHideMenuBar: true,
    title: "DEAD AIR",
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(url);
}

main();
app.on("window-all-closed", () => app.quit());
