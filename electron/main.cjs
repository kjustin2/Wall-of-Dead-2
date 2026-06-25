// Standalone desktop launcher for DEAD AIR.
//
// Serves the built dist/ over a custom "app://" scheme so the game's ES modules,
// fetch() and absolute asset paths behave exactly as in a browser. Critically the
// origin is FIXED (app://dead-air) — the previous build served over an HTTP server
// on an ephemeral port (server.listen(0)), which changed the page origin on every
// launch and therefore handed the game a brand-new, empty localStorage each time:
// saves and settings silently vanished between runs. A stable origin keeps
// localStorage (deadair.save.v1) persistent across restarts. Build first: `npm run build`.
const { app, BrowserWindow, protocol } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const DIST = path.join(__dirname, "..", "dist");
const HOST = "dead-air"; // the fixed authority → origin is app://dead-air

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
  ".cube": "text/plain",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg"
};

// Must run before app "ready". `standard` gives it an origin + relative-URL
// resolution; `secure` keeps it a secure context (needed for the Escape Keyboard
// Lock); `supportFetchAPI` lets the game fetch() its assets.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

async function main() {
  await app.whenReady();

  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("dist/ not found — run `npm run build` first");
    app.quit();
    return;
  }

  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    try {
      const data = await fsp.readFile(file);
      const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
      return new Response(data, { headers: { "Content-Type": mime } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#020304",
    autoHideMenuBar: true,
    title: "DEAD AIR",
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(`app://${HOST}/index.html`);
}

main();
app.on("window-all-closed", () => app.quit());
