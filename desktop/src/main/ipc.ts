import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type {
  ExportRequest,
  ImageSide,
  RestoreConflict,
} from "../shared/types";
import {
  assertId,
  assertString,
  sanitizeFilename,
  validateVaultUpdate,
  validateProfileEditorState,
} from "../shared/validation";
import { VaultService } from "./vault";

const imageFilters = [
  {
    name: "Identity images",
    extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  },
];

export function registerIpc(vault: VaultService): void {
  const completedExports = new Set<string>();
  const selectedBackups = new Map<
    string,
    { source: string; expiresAt: number }
  >();
  const selectedBackup = (token: string): string => {
    const selection = selectedBackups.get(token);
    if (!selection || selection.expiresAt < Date.now()) {
      selectedBackups.delete(token);
      throw new Error("Backup selection expired");
    }
    return selection.source;
  };
  const withVault = <T>(operation: () => T | Promise<T>): Promise<T> =>
    vault.runExclusive(operation);
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:licenses", () =>
    dialog.showMessageBox(requireWindow(), {
      type: "info",
      title: "Open-source licences",
      message: "Third-party software",
      detail:
        "Electron — MIT\nReact — MIT\nVite and electron-vite — MIT\nSharp — Apache-2.0\nlibvips — LGPL-3.0-or-later\nPDF-LIB — MIT\nelectron-builder — MIT\nTypeScript — Apache-2.0\nVitest — MIT",
    }),
  );
  ipcMain.handle("vault:status", () =>
    withVault(async () => ({
      locked: vault.isLocked(),
      passwordEnabled: await vault.hasPassword(),
    })),
  );
  ipcMain.handle("vault:list", () => withVault(() => vault.list()));
  ipcMain.handle("vault:unlock", (_event, password: unknown) => {
    if (typeof password !== "string" || password.length > 200)
      throw new Error("Invalid password");
    return withVault(() => vault.unlock(password));
  });
  ipcMain.handle("vault:lock", () => withVault(() => vault.lock()));
  ipcMain.handle("vault:enablePassword", (_event, password: unknown) => {
    assertNewPassword(password, "password");
    return withVault(() => vault.enablePassword(password));
  });
  ipcMain.handle(
    "vault:changePassword",
    (_event, current: unknown, next: unknown) => {
      assertString(current, "password");
      assertNewPassword(next, "new password");
      return withVault(() => vault.changePassword(current, next));
    },
  );
  ipcMain.handle("vault:disablePassword", (_event, password: unknown) => {
    assertString(password, "password");
    return withVault(() => vault.disablePassword(password));
  });
  ipcMain.handle("profile:create", (_event, name: unknown, label: unknown) => {
    assertString(name, "profile name", 100);
    if (
      label !== undefined &&
      (typeof label !== "string" || label.length > 100)
    )
      throw new Error("Invalid label");
    return withVault(() =>
      vault.createProfile(name, label as string | undefined),
    );
  });
  ipcMain.handle("profile:update", (_event, id: unknown, changes: unknown) => {
    assertId(id);
    if (!changes || typeof changes !== "object")
      throw new Error("Invalid changes");
    const update = changes as Record<string, unknown>;
    if (
      Object.keys(update).some(
        (key) => !["name", "documentLabel", "order"].includes(key),
      ) ||
      (update.name !== undefined &&
        (typeof update.name !== "string" ||
          !update.name.trim() ||
          update.name.length > 100)) ||
      (update.documentLabel !== undefined &&
        (typeof update.documentLabel !== "string" ||
          update.documentLabel.length > 100)) ||
      (update.order !== undefined &&
        (!Number.isSafeInteger(update.order) ||
          Number(update.order) < 0 ||
          Number(update.order) > 10_000))
    )
      throw new Error("Invalid profile changes");
    return withVault(() =>
      vault.updateProfile(
        id,
        update as { name?: string; documentLabel?: string; order?: number },
      ),
    );
  });
  ipcMain.handle(
    "profile:saveEditorState",
    (_event, id: unknown, state: unknown) => {
      assertId(id);
      const validated = validateProfileEditorState(state);
      return withVault(() => vault.saveEditorState(id, validated));
    },
  );
  ipcMain.handle("profile:open", (_event, id: unknown) => {
    assertId(id);
    return withVault(() => vault.openProfile(id));
  });
  ipcMain.handle("profile:delete", (_event, id: unknown) => {
    assertId(id);
    return withVault(() => vault.deleteProfile(id));
  });
  ipcMain.handle("profile:duplicate", (_event, id: unknown) => {
    assertId(id);
    return withVault(() => vault.duplicateProfile(id));
  });
  ipcMain.handle("profile:reorder", (_event, ids: unknown) => {
    if (
      !Array.isArray(ids) ||
      ids.length > 10_000 ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) => typeof id !== "string" || !/^[a-f0-9-]{20,50}$/i.test(id),
      )
    )
      throw new Error("Invalid profile order");
    return withVault(() => vault.reorderProfiles(ids));
  });
  ipcMain.handle("profile:removeBack", (_event, id: unknown) => {
    assertId(id);
    return withVault(() => vault.removeBack(id));
  });
  ipcMain.handle(
    "profile:import",
    async (_event, id: unknown, side: unknown) => {
      assertId(id);
      if (side !== "front" && side !== "back")
        throw new Error("Invalid image side");
      const result = await dialog.showOpenDialog(requireWindow(), {
        properties: ["openFile"],
        filters: imageFilters,
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return withVault(() =>
        vault.importImage(id, side as ImageSide, result.filePaths[0]),
      );
    },
  );
  ipcMain.handle(
    "profile:importBytes",
    async (
      _event,
      id: unknown,
      side: unknown,
      bytes: unknown,
      editorState: unknown,
    ) => {
      assertId(id);
      if (side !== "front" && side !== "back")
        throw new Error("Invalid image side");
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 50 * 1024 * 1024)
        throw new Error("Invalid image data");
      const validatedEditorState =
        editorState === undefined
          ? undefined
          : validateProfileEditorState(editorState);
      const input = Buffer.from(bytes);
      return withVault(() =>
        vault.importImageBytes(
          id,
          side as ImageSide,
          input,
          validatedEditorState,
        ),
      );
    },
  );
  ipcMain.handle(
    "profile:pasteImage",
    async (_event, id: unknown, side: unknown) => {
      assertId(id);
      if (side !== "front" && side !== "back")
        throw new Error("Invalid image side");
      const image = clipboard.readImage();
      if (image.isEmpty())
        throw new Error("The clipboard does not contain an image");
      const input = image.toPNG();
      return withVault(() =>
        vault.importImageBytes(id, side as ImageSide, input),
      );
    },
  );
  ipcMain.handle("vault:saveData", (_event, data: unknown) =>
    withVault(() => vault.saveVaultData(validateVaultUpdate(data))),
  );
  ipcMain.handle("export:save", async (_event, request: ExportRequest) => {
    const saved = await saveExport(requireWindow(), request);
    if (saved) {
      completedExports.add(saved);
      if (completedExports.size > 100)
        completedExports.delete(completedExports.values().next().value!);
    }
    return saved;
  });
  ipcMain.handle("export:clipboard", (_event, dataUrl: unknown) => {
    assertString(dataUrl, "image", 30_000_000);
    if (!/^data:image\/(?:png|jpeg);base64,/.test(dataUrl))
      throw new Error("Invalid rendered image");
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) throw new Error("Invalid rendered image");
    clipboard.writeImage(image);
  });
  ipcMain.handle("export:chooseFolder", async () => {
    const result = await dialog.showOpenDialog(requireWindow(), {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle("export:open", async (_event, file: unknown) => {
    if (typeof file !== "string" || !completedExports.has(file))
      throw new Error("Unknown export path");
    const message = await shell.openPath(file);
    if (message) throw new Error("The exported file could not be opened");
  });
  ipcMain.handle("export:reveal", (_event, file: unknown) => {
    if (typeof file !== "string" || !completedExports.has(file))
      throw new Error("Unknown export path");
    shell.showItemInFolder(file);
  });
  ipcMain.handle(
    "backup:create",
    async (_event, password: unknown, includeRecent: unknown) => {
      assertString(password, "backup password");
      if (password.length < 8)
        throw new Error("Backup password must contain at least 8 characters");
      const result = await dialog.showSaveDialog(requireWindow(), {
        defaultPath: "palang-ic-backup.palangvault",
        filters: [
          { name: "Palang IC encrypted backup", extensions: ["palangvault"] },
        ],
      });
      if (!result.canceled && result.filePath) {
        await withVault(() =>
          vault.createBackup(
            result.filePath!,
            password,
            includeRecent === true,
          ),
        );
        return true;
      }
      return false;
    },
  );
  ipcMain.handle(
    "backup:restore",
    async (_event, password: unknown, conflict: unknown) => {
      assertString(password, "backup password");
      if (!["keep", "replace", "copy"].includes(String(conflict)))
        throw new Error("Invalid conflict choice");
      const result = await dialog.showOpenDialog(requireWindow(), {
        properties: ["openFile"],
        filters: [
          { name: "Palang IC encrypted backup", extensions: ["palangvault"] },
        ],
      });
      if (result.canceled || !result.filePaths[0]) return false;
      await withVault(() =>
        vault.restoreBackup(
          result.filePaths[0],
          password,
          conflict as RestoreConflict,
        ),
      );
      return true;
    },
  );
  ipcMain.handle("backup:select", async () => {
    const result = await dialog.showOpenDialog(requireWindow(), {
      properties: ["openFile"],
      filters: [
        { name: "Palang IC encrypted backup", extensions: ["palangvault"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    for (const [key, selection] of selectedBackups)
      if (selection.expiresAt < Date.now()) selectedBackups.delete(key);
    while (selectedBackups.size >= 20)
      selectedBackups.delete(selectedBackups.keys().next().value!);
    const token = randomUUID();
    selectedBackups.set(token, {
      source: result.filePaths[0],
      expiresAt: Date.now() + 15 * 60_000,
    });
    return token;
  });
  ipcMain.handle(
    "backup:preview",
    async (_event, token: unknown, password: unknown) => {
      assertString(token, "backup selection");
      assertString(password, "backup password");
      const source = selectedBackup(token);
      const { preview } = await withVault(() =>
        vault.previewBackup(source, password),
      );
      return {
        version: preview.version,
        profiles: preview.profiles.map(
          ({ id, name, documentLabel, updatedAt }) => ({
            id,
            name,
            documentLabel,
            updatedAt,
          }),
        ),
      };
    },
  );
  ipcMain.handle(
    "backup:restoreSelected",
    async (
      _event,
      token: unknown,
      password: unknown,
      conflict: unknown,
      selectedIds: unknown,
    ) => {
      assertString(token, "backup selection");
      assertString(password, "backup password");
      if (
        !["keep", "replace", "copy"].includes(String(conflict)) ||
        !Array.isArray(selectedIds) ||
        selectedIds.length > 10_000 ||
        new Set(selectedIds).size !== selectedIds.length ||
        selectedIds.some(
          (id) => typeof id !== "string" || !/^[a-f0-9-]{20,50}$/i.test(id),
        )
      )
        throw new Error("Invalid restore options");
      const source = selectedBackup(token);
      try {
        await withVault(() =>
          vault.restoreBackup(
            source,
            password,
            conflict as RestoreConflict,
            selectedIds as string[],
          ),
        );
      } finally {
        selectedBackups.delete(token);
      }
    },
  );
  ipcMain.handle("vault:deleteAll", (_event, password: unknown) => {
    if (password !== undefined && typeof password !== "string")
      throw new Error("Invalid password");
    return withVault(() => vault.deleteAll(password as string | undefined));
  });
  ipcMain.handle("vault:resetForgotten", () =>
    withVault(() => vault.resetInaccessibleVault()),
  );
  ipcMain.handle("shell:openExternal", (_event, url: unknown) => {
    if (
      typeof url !== "string" ||
      !["https://palang.ic/", "https://www.youjing.dev/"].some((base) =>
        url.startsWith(base),
      )
    )
      throw new Error("External URL is not allowed");
    return shell.openExternal(url);
  });
}

function assertNewPassword(
  value: unknown,
  field: string,
): asserts value is string {
  assertString(value, field, 200);
  if (value.length < 8)
    throw new Error("Password must contain at least 8 characters");
}

function requireWindow(): BrowserWindow {
  const window =
    BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed())
    throw new Error("The application window is unavailable");
  return window;
}

async function saveExport(
  window: BrowserWindow,
  request: ExportRequest,
): Promise<string | null> {
  if (
    !request ||
    !["jpeg", "png", "pdf"].includes(request.format) ||
    typeof request.dataUrl !== "string" ||
    request.dataUrl.length > 80_000_000 ||
    typeof request.suggestedName !== "string" ||
    request.suggestedName.length > 200 ||
    (request.defaultFolder !== undefined &&
      (typeof request.defaultFolder !== "string" ||
        request.defaultFolder.length > 1000))
  )
    throw new Error("Invalid export");
  const extension = request.format === "jpeg" ? "jpg" : request.format;
  const base = sanitizeFilename(request.suggestedName);
  const defaultPath = request.defaultFolder
    ? path.join(path.resolve(request.defaultFolder), `${base}.${extension}`)
    : `${base}.${extension}`;
  const result = await dialog.showSaveDialog(window, {
    defaultPath,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  const match = /^data:image\/(?:png|jpeg);base64,(.+)$/.exec(request.dataUrl);
  if (
    !match ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      match[1],
    )
  )
    throw new Error("Invalid rendered image");
  const image = Buffer.from(match[1], "base64");
  if (!image.length || image.length > 60_000_000)
    throw new Error("Rendered image is empty or too large");
  if (request.format === "pdf") {
    const pdf = await PDFDocument.create();
    const embedded = request.dataUrl.startsWith("data:image/png")
      ? await pdf.embedPng(image)
      : await pdf.embedJpg(image);
    const page = pdf.addPage([595.28, 841.89]);
    const scale = Math.min(
      (page.getWidth() - 72) / embedded.width,
      (page.getHeight() - 72) / embedded.height,
    );
    page.drawImage(embedded, {
      x: (page.getWidth() - embedded.width * scale) / 2,
      y: (page.getHeight() - embedded.height * scale) / 2,
      width: embedded.width * scale,
      height: embedded.height * scale,
    });
    await writeFile(path.resolve(result.filePath), await pdf.save());
  } else await writeFile(path.resolve(result.filePath), image);
  return result.filePath;
}
