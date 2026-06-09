const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cutoutStudio", {
  saveAssets: (assets) => ipcRenderer.invoke("save-assets", assets)
});
