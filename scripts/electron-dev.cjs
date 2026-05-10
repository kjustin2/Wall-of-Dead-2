const { spawn } = require("child_process");
const http = require("http");
const electron = require("electron");

const url = "http://127.0.0.1:5173";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const vite = spawn(npm, ["run", "dev", "--", "--port", "5173"], {
  stdio: "inherit",
  env: { ...process.env, BROWSER: "none" }
});

function waitForServer(triesLeft) {
  if (triesLeft <= 0) {
    console.error("[electron-dev] Vite server did not start.");
    vite.kill();
    process.exit(1);
  }
  const req = http.get(url, (res) => {
    res.resume();
    launchElectron();
  });
  req.on("error", () => setTimeout(() => waitForServer(triesLeft - 1), 250));
  req.setTimeout(500, () => {
    req.destroy();
    setTimeout(() => waitForServer(triesLeft - 1), 250);
  });
}

let electronProc = null;
function launchElectron() {
  electronProc = spawn(electron, ["."], {
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: url }
  });
  electronProc.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  if (electronProc) electronProc.kill();
  vite.kill();
  process.exit(0);
});

waitForServer(80);
