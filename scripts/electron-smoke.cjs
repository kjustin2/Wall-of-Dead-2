const fs = require("fs");
const path = require("path");

let failures = 0;
function check(cond, label) {
  if (cond) {
    console.log(`  ok ${label}`);
  } else {
    failures++;
    console.error(`  fail ${label}`);
  }
}

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const mainPath = path.join(root, pkg.main || "");

console.log("[electron-smoke]");
check(pkg.main === "electron/main.cjs", "package main points at Electron entry");
check(fs.existsSync(mainPath), "Electron entry exists");
check(pkg.scripts.start && pkg.scripts.start.includes("electron ."), "npm start launches Electron");
check(pkg.scripts["electron:dev"], "electron:dev script exists");
check(pkg.build && pkg.build.productName === "Wall of Dead 2", "electron-builder config exists");

const mainText = fs.readFileSync(mainPath, "utf8");
check(mainText.includes("VITE_DEV_SERVER_URL"), "Electron supports Vite dev server");
check(mainText.includes("dist"), "Electron loads built dist in production");
check(mainText.includes("sandbox: true"), "Electron renderer sandbox enabled");

const viteConfigPath = path.join(root, "vite.config.ts");
const viteConfigText = fs.readFileSync(viteConfigPath, "utf8");
check(viteConfigText.includes('base: "./"'), "Vite emits relative asset paths for file:// Electron loads");

const distIndexPath = path.join(root, "dist", "index.html");
if (fs.existsSync(distIndexPath)) {
  const distIndexText = fs.readFileSync(distIndexPath, "utf8");
  check(!/src="\/assets\//.test(distIndexText), "built scripts do not use absolute /assets paths");
  check(!/href="\/assets\//.test(distIndexText), "built styles do not use absolute /assets paths");
} else {
  console.log("  skip built asset path check; dist/index.html does not exist yet");
}

if (failures > 0) process.exit(1);
