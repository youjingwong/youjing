import { contextBridge, ipcRenderer } from "electron";
import type {
  ExportRequest,
  ImageSide,
  ProfileEditorStateUpdate,
  RestoreConflict,
  VaultData,
  WatermarkPreset,
} from "../shared/types";

const api = {
  getVersion: () => ipcRenderer.invoke("app:version"),
  showLicenses: () => ipcRenderer.invoke("app:licenses"),
  status: () => ipcRenderer.invoke("vault:status"),
  list: () => ipcRenderer.invoke("vault:list"),
  unlock: (password: string) => ipcRenderer.invoke("vault:unlock", password),
  lock: () => ipcRenderer.invoke("vault:lock"),
  enablePassword: (password: string) =>
    ipcRenderer.invoke("vault:enablePassword", password),
  changePassword: (current: string, next: string) =>
    ipcRenderer.invoke("vault:changePassword", current, next),
  disablePassword: (password: string) =>
    ipcRenderer.invoke("vault:disablePassword", password),
  createProfile: (name: string, label?: string) =>
    ipcRenderer.invoke("profile:create", name, label),
  updateProfile: (
    id: string,
    changes: { name?: string; documentLabel?: string; order?: number },
  ) => ipcRenderer.invoke("profile:update", id, changes),
  saveEditorState: (id: string, state: ProfileEditorStateUpdate) =>
    ipcRenderer.invoke("profile:saveEditorState", id, state),
  openProfile: (id: string) => ipcRenderer.invoke("profile:open", id),
  deleteProfile: (id: string) => ipcRenderer.invoke("profile:delete", id),
  duplicateProfile: (id: string) => ipcRenderer.invoke("profile:duplicate", id),
  reorderProfiles: (ids: string[]) =>
    ipcRenderer.invoke("profile:reorder", ids),
  importImage: (id: string, side: ImageSide) =>
    ipcRenderer.invoke("profile:import", id, side),
  importImageBytes: (
    id: string,
    side: ImageSide,
    bytes: Uint8Array,
    editorState?: ProfileEditorStateUpdate,
  ) => ipcRenderer.invoke("profile:importBytes", id, side, bytes, editorState),
  pasteImage: (id: string, side: ImageSide) =>
    ipcRenderer.invoke("profile:pasteImage", id, side),
  removeBack: (id: string) => ipcRenderer.invoke("profile:removeBack", id),
  saveData: (
    data: Partial<
      Pick<
        VaultData,
        "settings" | "presets" | "recentRecipients" | "recentPurposes"
      >
    >,
  ) => ipcRenderer.invoke("vault:saveData", data),
  saveExport: (request: ExportRequest) =>
    ipcRenderer.invoke("export:save", request),
  copyImage: (dataUrl: string) =>
    ipcRenderer.invoke("export:clipboard", dataUrl),
  chooseExportFolder: () => ipcRenderer.invoke("export:chooseFolder"),
  openExport: (file: string) => ipcRenderer.invoke("export:open", file),
  revealExport: (file: string) => ipcRenderer.invoke("export:reveal", file),
  createBackup: (password: string, includeRecent: boolean) =>
    ipcRenderer.invoke("backup:create", password, includeRecent),
  restoreBackup: (password: string, conflict: RestoreConflict) =>
    ipcRenderer.invoke("backup:restore", password, conflict),
  selectBackup: () => ipcRenderer.invoke("backup:select"),
  previewBackup: (token: string, password: string) =>
    ipcRenderer.invoke("backup:preview", token, password),
  restoreSelectedBackup: (
    token: string,
    password: string,
    conflict: RestoreConflict,
    selectedIds: string[],
  ) =>
    ipcRenderer.invoke(
      "backup:restoreSelected",
      token,
      password,
      conflict,
      selectedIds,
    ),
  deleteAll: (password?: string) =>
    ipcRenderer.invoke("vault:deleteAll", password),
  resetForgottenPassword: () => ipcRenderer.invoke("vault:resetForgotten"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  onLocked: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("vault:locked", handler);
    return () => {
      ipcRenderer.removeListener("vault:locked", handler);
    };
  },
};

contextBridge.exposeInMainWorld("palang", api);
export type PalangApi = typeof api;
