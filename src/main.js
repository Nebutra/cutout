const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: "Asset Cutout Studio",
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("save-assets", async (_event, assets) => {
  const result = await dialog.showOpenDialog({
    title: "选择导出文件夹",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const outputDir = result.filePaths[0];
  await Promise.all(
    assets.map(async (asset) => {
      const base64 = asset.dataUrl.replace(/^data:image\/png;base64,/, "");
      const safeName = asset.name.replace(/[^\w.-]+/g, "_");
      await fs.writeFile(path.join(outputDir, safeName), Buffer.from(base64, "base64"));
    })
  );

  return { canceled: false, outputDir, count: assets.length };
});
