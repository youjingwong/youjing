import { app, BrowserWindow, dialog, session, shell } from "electron";
import path from "node:path";
import { registerIpc } from "./ipc";
import { VaultService } from "./vault";

let mainWindow: BrowserWindow | null = null;
if (process.env.PALANG_IC_USER_DATA)
  app.setPath("userData", path.resolve(process.env.PALANG_IC_USER_DATA));
const vault = new VaultService();
let rendererUrl: string | null = null;
let quitPending = false;
let vaultReadyToQuit = false;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: "#f7f8f4",
    title: "Palang IC",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("minimize", async () => {
    try {
      const locked = await vault.runExclusive(async () => {
        const data = await vault.list();
        if (!data.settings.lockEnabled || !data.settings.lockWhenMinimized)
          return false;
        vault.lock();
        return true;
      });
      if (locked) mainWindow?.webContents.send("vault:locked");
    } catch {
      /* already locked */
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://www.youjing.dev/"))
      void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  if (rendererUrl) await mainWindow.loadURL(rendererUrl);
  else
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else
  void app
    .whenReady()
    .then(async () => {
      rendererUrl = resolveDevelopmentRendererUrl();
      const development = Boolean(rendererUrl);
      const contentSecurityPolicy = development
        ? "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*; object-src 'none'; base-uri 'none'; frame-src 'none'"
        : "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'";
      session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [contentSecurityPolicy],
          },
        }),
      );
      await vault.initialize();
      registerIpc(vault);
      await createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      });
    })
    .catch(async (cause) => {
      await dialog.showMessageBox({
        type: "error",
        title: "Palang IC could not start",
        message: "Your local vault could not be opened.",
        detail: safeStartupError(cause),
      });
      app.quit();
    });

app.on("second-instance", () => {
  if (!ownsInstance) return;
  if (!mainWindow) void createWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", (event) => {
  if (vaultReadyToQuit) {
    vault.lock();
    return;
  }
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  void vault
    .runExclusive(() => vault.lock())
    .finally(() => {
      vaultReadyToQuit = true;
      app.quit();
    });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function resolveDevelopmentRendererUrl(): string | null {
  const raw = process.env.ELECTRON_RENDERER_URL;
  if (!raw || app.isPackaged) return null;
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("The development renderer must use a loopback HTTP URL");
  return url.toString();
}

function safeStartupError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  const safeMessages = [
    "Vault metadata is missing",
    "Vault metadata is damaged",
    "The vault encryption key is missing",
    "Secure operating-system key storage is unavailable",
    "This vault was created by a newer version",
    "Unsupported vault version",
  ];
  return safeMessages.some((prefix) => message.startsWith(prefix))
    ? message
    : "Check that Palang IC can access its application-data folder, then try again.";
}
