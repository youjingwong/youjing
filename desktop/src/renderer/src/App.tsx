import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { defaultPresets, defaultWatermark } from "../../shared/defaults";
import { createExportPlan } from "../../shared/export-plan";
import type {
  AppSettings,
  BackupPreview,
  ExportFormat,
  ExportMode,
  ExportQuality,
  ImageRotation,
  Profile,
  ProfileWithImages,
  RestoreConflict,
  ThemePreference,
  VaultData,
  WatermarkPreset,
  WatermarkSettings,
} from "../../shared/types";
import { initials, sanitizeFilename } from "../../shared/validation";
import {
  clampNormalized,
  normalizeLegacyWatermarkText,
} from "../../shared/watermark";
import {
  combineCanvases,
  drawWatermarkSelection,
  isPointInWatermark,
  normalizeImageRotation,
  renderDocument,
} from "./canvas";
import { messages, type MessageKey } from "./localization";
import ImagePreparationDialog from "./ImagePreparationDialog";

type Screen =
  | { kind: "home" }
  | { kind: "editor"; profile: ProfileWithImages }
  | { kind: "settings" };

export default function App() {
  const [vault, setVault] = useState<VaultData | null>(null);
  const [locked, setLocked] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [error, setError] = useState("");
  const language = vault?.settings.language || "en";
  const theme = vault?.settings.theme || "system";
  const t = useCallback(
    (key: MessageKey) => messages[language][key],
    [language],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("palang-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const refresh = useCallback(async () => {
    const data = await window.palang.list();
    setVault(data);
    setLocked(false);
  }, []);
  useEffect(() => {
    void window.palang
      .status()
      .then(async (status) => {
        setPasswordEnabled(status.passwordEnabled);
        if (!status.locked) await refresh();
        else setLocked(true);
      })
      .catch((cause) => setError(String(cause)));
    return window.palang.onLocked(() => {
      setLocked(true);
      setScreen({ kind: "home" });
      setVault(null);
    });
  }, [refresh]);
  useEffect(() => {
    if (
      !vault?.settings.lockEnabled ||
      vault.settings.autoLockMinutes === 0 ||
      locked
    )
      return;
    let lastActivity = Date.now();
    const activity = () => {
      lastActivity = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true }),
    );
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity >= vault.settings.autoLockMinutes * 60_000)
        void doLock();
    }, 10_000);
    return () => {
      clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
    };
  }, [vault?.settings.lockEnabled, vault?.settings.autoLockMinutes, locked]);

  async function doLock() {
    try {
      await window.palang.lock();
      setLocked(true);
      setScreen({ kind: "home" });
      setVault(null);
    } catch (cause) {
      setError(readError(cause));
    }
  }
  async function openProfile(id: string) {
    try {
      setError("");
      setScreen({
        kind: "editor",
        profile: await window.palang.openProfile(id),
      });
    } catch (cause) {
      setError(readError(cause));
    }
  }
  if (locked)
    return (
      <LockScreen
        t={t}
        passwordEnabled={passwordEnabled}
        error={error}
        onReset={async () => {
          try {
            await window.palang.resetForgottenPassword();
            setPasswordEnabled(false);
            await refresh();
          } catch (cause) {
            setError(readError(cause));
          }
        }}
        onUnlock={async (password) => {
          try {
            setError("");
            await window.palang.unlock(password);
            await refresh();
          } catch {
            setError(t("incorrectPassword"));
          }
        }}
      />
    );
  if (!vault)
    return (
      <div className="splash">
        <Logo />
        <p>{t("privacy")}</p>
      </div>
    );

  return (
    <div className="app-shell">
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label={t("close")}>
            ×
          </button>
        </div>
      )}
      {screen.kind === "home" && (
        <Home
          vault={vault}
          t={t}
          onOpen={openProfile}
          onRefresh={refresh}
          onSettings={() => setScreen({ kind: "settings" })}
          onLock={doLock}
          onError={setError}
        />
      )}
      {screen.kind === "editor" && (
        <Editor
          profile={screen.profile}
          vault={vault}
          t={t}
          onBack={async () => {
            try {
              await refresh();
              setScreen({ kind: "home" });
            } catch (cause) {
              setError(readError(cause));
            }
          }}
          onProfileChange={async () => {
            const profile = await window.palang.openProfile(screen.profile.id);
            setScreen({ kind: "editor", profile });
            return profile;
          }}
          onVaultChange={(next) => setVault(next)}
          onError={setError}
        />
      )}
      {screen.kind === "settings" && (
        <Settings
          vault={vault}
          passwordEnabled={passwordEnabled}
          t={t}
          onChange={(next) => setVault(next)}
          onPasswordEnabled={setPasswordEnabled}
          onDone={() => setScreen({ kind: "home" })}
          onError={setError}
        />
      )}
    </div>
  );
}

function Home({
  vault,
  t,
  onOpen,
  onRefresh,
  onSettings,
  onLock,
  onError,
}: {
  vault: VaultData;
  t: T;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onSettings: () => void;
  onLock: () => void;
  onError: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"custom" | "modified" | "name">("custom");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const profiles = useMemo(
    () =>
      vault.profiles
        .filter((p) =>
          `${p.name} ${p.documentLabel || ""}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "modified"
              ? b.updatedAt.localeCompare(a.updatedAt)
              : a.order - b.order,
        ),
    [vault.profiles, query, sort],
  );
  async function remove(profile: Profile) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      await window.palang.deleteProfile(profile.id);
      await onRefresh();
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function move(profile: Profile, direction: -1 | 1) {
    try {
      const ordered = [...vault.profiles].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((item) => item.id === profile.id);
      const target = index + direction;
      if (target < 0 || target >= ordered.length) return;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      await window.palang.reorderProfiles(ordered.map((item) => item.id));
      await onRefresh();
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function duplicate(profile: Profile) {
    try {
      await window.palang.duplicateProfile(profile.id);
      await onRefresh();
    } catch (cause) {
      onError(readError(cause));
    }
  }
  return (
    <>
      <header className="topbar">
        <Logo />
        <div className="privacy">
          <span>●</span>
          {t("privacy")}
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={onSettings}>
            ⚙ <span>{t("settings")}</span>
          </button>
          {vault.settings.lockEnabled && (
            <button className="icon-button" onClick={onLock}>
              ⌁ <span>{t("lock")}</span>
            </button>
          )}
        </div>
      </header>
      <main className="home">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PALANG IC · {t("privateVault")}</p>
            <h1>{t("profiles")}</h1>
          </div>
          <button className="primary" onClick={() => setCreating(true)}>
            ＋ {t("add")}
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            ⌕
            <input
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label={t("sort")}
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "custom" | "modified" | "name")
            }
          >
            <option value="custom">{t("sortCustom")}</option>
            <option value="modified">{t("sortModified")}</option>
            <option value="name">{t("sortName")}</option>
          </select>
        </div>
        {profiles.length ? (
          <div className="profile-grid">
            {profiles.map((profile, index) => (
              <article className="profile-card" key={profile.id}>
                <button
                  className="profile-main"
                  onClick={() => onOpen(profile.id)}
                >
                  <span className={`avatar tone-${profile.name.length % 4}`}>
                    {initials(profile.name)}
                  </span>
                  <span className="profile-copy">
                    <strong>{profile.name}</strong>
                    <span>{profile.documentLabel || t("identityCard")}</span>
                    <small>
                      {t("modified")}{" "}
                      {formatDate(profile.updatedAt, vault.settings.language)}
                    </small>
                  </span>
                  <span className="arrow">→</span>
                </button>
                <div className="card-actions">
                  {sort === "custom" && (
                    <>
                      <button
                        disabled={index === 0}
                        aria-label={t("moveUp")}
                        onClick={() => void move(profile, -1)}
                      >
                        ↑
                      </button>
                      <button
                        disabled={index === profiles.length - 1}
                        aria-label={t("moveDown")}
                        onClick={() => void move(profile, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <button onClick={() => void duplicate(profile)}>
                    {t("duplicate")}
                  </button>
                  <button onClick={() => setEditing(profile)}>
                    {t("edit")}
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => void remove(profile)}
                  >
                    {t("delete")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-mark">▱</div>
            <h2>{t("emptyTitle")}</h2>
            <p>{t("emptyBody")}</p>
            <button className="primary" onClick={() => setCreating(true)}>
              ＋ {t("add")}
            </button>
          </div>
        )}
      </main>
      {(creating || editing) && (
        <ProfileDialog
          t={t}
          profile={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async (profile, created) => {
            setCreating(false);
            setEditing(null);
            await onRefresh();
            if (created) onOpen(profile.id);
          }}
          onError={onError}
        />
      )}
    </>
  );
}

function ProfileDialog({
  t,
  profile,
  onClose,
  onSaved,
  onError,
}: {
  t: T;
  profile: Profile | null;
  onClose: () => void;
  onSaved: (profile: Profile, created: boolean) => void;
  onError: (value: string) => void;
}) {
  const [name, setName] = useState(profile?.name || "");
  const [label, setLabel] = useState(profile?.documentLabel || "");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (profile) {
        const next = await window.palang.updateProfile(profile.id, {
          name,
          documentLabel: label,
        });
        onSaved(next, false);
      } else {
        const next = await window.palang.createProfile(name, label);
        onSaved(next, true);
      }
    } catch (cause) {
      onError(readError(cause));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={profile ? t("rename") : t("create")}
      closeLabel={t("close")}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack">
        <label>
          {t("name")}
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t("label")}
          <input
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("documentPlaceholder")}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {busy ? "…" : t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Editor({
  profile,
  vault,
  t,
  onBack,
  onProfileChange,
  onVaultChange,
  onError,
}: {
  profile: ProfileWithImages;
  vault: VaultData;
  t: T;
  onBack: () => void;
  onProfileChange: () => Promise<ProfileWithImages>;
  onVaultChange: (v: VaultData) => void;
  onError: (value: string) => void;
}) {
  const [side, setSide] = useState<"front" | "back">("front");
  const [front, setFront] = useState<WatermarkSettings>(() => ({
    ...structuredClone(
      profile.frontEditorState?.watermark || vault.settings.defaultWatermark,
    ),
    x: profile.frontEditorState?.watermark.x ?? defaultWatermark.x,
    y: profile.frontEditorState?.watermark.y ?? defaultWatermark.y,
    text: normalizeLegacyWatermarkText(
      profile.frontEditorState?.watermark.text ??
        vault.settings.defaultWatermark.text,
    ),
  }));
  const [back, setBack] = useState<WatermarkSettings>(() => ({
    ...structuredClone(
      profile.backEditorState?.watermark || vault.settings.defaultWatermark,
    ),
    x: profile.backEditorState?.watermark.x ?? defaultWatermark.x,
    y: profile.backEditorState?.watermark.y ?? defaultWatermark.y,
    text: normalizeLegacyWatermarkText(
      profile.backEditorState?.watermark.text ??
        vault.settings.defaultWatermark.text,
    ),
  }));
  const [imageScales, setImageScales] = useState({
    front: profile.frontEditorState?.imageScale || 1,
    back: profile.backEditorState?.imageScale || 1,
  });
  const [imageRotations, setImageRotations] = useState<
    Record<"front" | "back", ImageRotation>
  >({
    front: profile.frontEditorState?.imageRotation ?? 0,
    back: profile.backEditorState?.imageRotation ?? 0,
  });
  const [exportMode, setExportMode] = useState<ExportMode>(
    profile.backImageId ? "combined" : "front",
  );
  const [format, setFormat] = useState<ExportFormat>(
    vault.settings.defaultExportFormat,
  );
  const [quality, setQuality] = useState<ExportQuality>(
    vault.settings.defaultExportQuality,
  );
  const [busy, setBusy] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [preparing, setPreparing] = useState<{
    side: "front" | "back";
    dataUrl: string;
  } | null>(null);
  const [draggingFile, setDraggingFile] = useState<"front" | "back" | null>(
    null,
  );
  const [lastExport, setLastExport] = useState<string | null>(null);
  const controlsPanelRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageInputSide = useRef<"front" | "back">("front");
  const settings = side === "front" ? front : back;
  const activeSideLabel = side === "front" ? t("front") : t("backSide");
  const imageScale = imageScales[side];
  const updateSide = (
    target: "front" | "back",
    changes: Partial<WatermarkSettings>,
  ) => {
    const setter = target === "front" ? setFront : setBack;
    setter((current) => ({ ...current, ...changes }));
  };
  const update = (changes: Partial<WatermarkSettings>) =>
    updateSide(side, changes);
  const rotateWatermark = (target: "front" | "back", degrees: number) => {
    const current = target === "front" ? front : back;
    const rotation =
      ((((current.rotation + degrees + 180) % 360) + 360) % 360) - 180;
    updateSide(target, { rotation });
  };
  const updateImageScale = (target: "front" | "back", next: number) =>
    setImageScales((current) => ({
      ...current,
      [target]: Math.min(3, Math.max(0.5, next)),
    }));
  const rotateImage = (target: "front" | "back", degrees: -90 | 90) =>
    setImageRotations((current) => ({
      ...current,
      [target]: normalizeImageRotation(current[target] + degrees),
    }));
  const resetWatermark = (target: "front" | "back") =>
    updateSide(target, structuredClone(vault.settings.defaultWatermark));
  useEffect(() => {
    controlsPanelRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [side]);
  async function doExport(copy = false) {
    setBusy(true);
    try {
      const exportPlan = createExportPlan(
        exportMode,
        Boolean(profile.backImageId),
      );
      const needsFront =
        exportPlan.kind !== "single" || exportPlan.side === "front";
      const needsBack =
        exportPlan.kind !== "single" || exportPlan.side === "back";
      if (needsFront && !profile.frontDataUrl)
        throw new Error(t("corruptImage"));
      if (needsBack && !profile.backDataUrl) throw new Error(t("corruptImage"));
      const frontCanvas = needsFront
        ? await renderDocument(
            profile.frontDataUrl,
            front,
            quality,
            imageScales.front,
            imageRotations.front,
          )
        : null;
      const backCanvas = needsBack
        ? await renderDocument(
            profile.backDataUrl!,
            back,
            quality,
            imageScales.back,
            imageRotations.back,
          )
        : null;
      const canvasFor = (target: "front" | "back") => {
        const canvas = target === "front" ? frontCanvas : backCanvas;
        if (!canvas) throw new Error(t("corruptImage"));
        return canvas;
      };
      const bothCanvases = () => [canvasFor("front"), canvasFor("back")];
      const date = new Intl.DateTimeFormat("en-CA").format(new Date());
      const baseName = sanitizeFilename(`${profile.name}_${date}`);
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const encode = (canvas: HTMLCanvasElement) =>
        canvas.toDataURL(
          mime,
          format === "jpeg"
            ? quality === "standard"
              ? 0.82
              : quality === "high"
                ? 0.92
                : 1
            : undefined,
        );
      let completed = false;
      if (copy) {
        const output =
          exportPlan.kind === "single"
            ? canvasFor(exportPlan.side)
            : await combineCanvases(bothCanvases());
        await window.palang.copyImage(encode(output));
        completed = true;
      } else if (exportPlan.kind === "separate") {
        const first = await window.palang.saveExport({
          dataUrl: encode(canvasFor("front")),
          format,
          suggestedName: `${baseName}_front`,
          defaultFolder: vault.settings.defaultExportFolder,
        });
        if (first) setLastExport(first);
        const second = await window.palang.saveExport({
          dataUrl: encode(canvasFor("back")),
          format,
          suggestedName: `${baseName}_back`,
          defaultFolder: vault.settings.defaultExportFolder,
        });
        if (second) setLastExport(second);
        completed = Boolean(first || second);
      } else {
        const output =
          exportPlan.kind === "single"
            ? canvasFor(exportPlan.side)
            : await combineCanvases(bothCanvases());
        const saved = await window.palang.saveExport({
          dataUrl: encode(output),
          format,
          suggestedName: baseName,
          defaultFolder: vault.settings.defaultExportFolder,
        });
        if (saved) setLastExport(saved);
        completed = Boolean(saved);
      }
      if (completed)
        await window.palang.saveEditorState(profile.id, {
          front: {
            watermark: structuredClone(front),
            imageScale: imageScales.front,
            imageRotation: imageRotations.front,
          },
          back: profile.backImageId
            ? {
                watermark: structuredClone(back),
                imageScale: imageScales.back,
                imageRotation: imageRotations.back,
              }
            : undefined,
        });
    } catch (cause) {
      onError(readError(cause));
    } finally {
      setBusy(false);
    }
  }
  function chooseImage(target: "front" | "back") {
    imageInputSide.current = target;
    imageInputRef.current?.click();
  }
  async function importFile(target: "front" | "back", file: File) {
    try {
      const changed = await window.palang.importImageBytes(
        profile.id,
        target,
        new Uint8Array(await file.arrayBuffer()),
      );
      if (changed) {
        if (changed.qualityWarning) onError(t("qualityWarning"));
        await onProfileChange();
        setSelectedPreset("");
        setSide(target);
      }
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function pasteImage(target: "front" | "back") {
    try {
      const changed = await window.palang.pasteImage(profile.id, target);
      if (changed.qualityWarning) onError(t("qualityWarning"));
      await onProfileChange();
      setSelectedPreset("");
      setSide(target);
    } catch (cause) {
      onError(readError(cause));
    }
  }
  function activateSide(target: "front" | "back") {
    setSelectedPreset("");
    setSide(target);
  }
  async function removeBackImage() {
    if (!confirm(t("confirmRemoveBack"))) return;
    try {
      await window.palang.removeBack(profile.id);
      setBack(structuredClone(vault.settings.defaultWatermark));
      setImageScales((current) => ({ ...current, back: 1 }));
      setImageRotations((current) => ({ ...current, back: 0 }));
      setExportMode("front");
      activateSide("front");
      await onProfileChange();
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function savePreset(mode: "create" | "update") {
    const currentName =
      mode === "update"
        ? vault.presets.find((item) => item.id === selectedPreset)?.name
        : undefined;
    const name = prompt(t("presetName"), currentName);
    if (!name) return;
    const preset: WatermarkPreset = {
      ...structuredClone(settings),
      id:
        mode === "update" && selectedPreset
          ? selectedPreset
          : crypto.randomUUID(),
      name,
    };
    const presets =
      mode === "update"
        ? vault.presets.map((item) => (item.id === preset.id ? preset : item))
        : [...vault.presets, preset];
    try {
      onVaultChange(await window.palang.saveData({ presets }));
      setSelectedPreset(preset.id);
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function deletePreset() {
    try {
      onVaultChange(
        await window.palang.saveData({
          presets: vault.presets.filter((item) => item.id !== selectedPreset),
        }),
      );
      setSelectedPreset("");
    } catch (cause) {
      onError(readError(cause));
    }
  }
  return (
    <>
      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(imageInputSide.current, file);
          event.currentTarget.value = "";
        }}
      />
      <header className="topbar editor-bar">
        <button className="back-button" onClick={onBack}>
          ← {t("back")}
        </button>
        <div className="editor-title">
          <span className="avatar small">{initials(profile.name)}</span>
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.documentLabel || t("identityCard")}</span>
          </div>
        </div>
        <div className="privacy">
          <span>●</span>
          {t("privacy")}
        </div>
      </header>
      <main
        className={`editor-layout ${!profile.frontImageId ? "no-image" : ""}`}
      >
        <section className="preview-panel">
          {!profile.frontImageId ? (
            <div
              className={`empty-image-upload ${draggingFile === "front" ? "file-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDraggingFile("front");
              }}
              onDragLeave={() => setDraggingFile(null)}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingFile(null);
                const file = event.dataTransfer.files[0];
                if (file) void importFile("front", file);
              }}
            >
              <span className="empty-image-icon">
                <EditorIcon name="image" />
              </span>
              <strong>{t("addFrontTitle")}</strong>
              <p>{t("addFrontBody")}</p>
              <button className="primary" onClick={() => chooseImage("front")}>
                ＋ {t("chooseFrontImage")}
              </button>
              <small>{t("dropHint")}</small>
            </div>
          ) : (
            <div className="document-pair">
              <DocumentSideEditor
                target="front"
                label={t("front")}
                active={side === "front"}
                exists={Boolean(profile.frontImageId)}
                dataUrl={profile.frontDataUrl}
                settings={front}
                imageScale={imageScales.front}
                imageRotation={imageRotations.front}
                dragging={draggingFile === "front"}
                t={t}
                onActivate={() => activateSide("front")}
                onChoose={() => chooseImage("front")}
                onPaste={() => void pasteImage("front")}
                onDrop={(file) => void importFile("front", file)}
                onDragState={(dragging) =>
                  setDraggingFile(dragging ? "front" : null)
                }
                onPrepare={() =>
                  setPreparing({ side: "front", dataUrl: profile.frontDataUrl })
                }
                onSettings={(changes) => updateSide("front", changes)}
                onImageScale={(value) => updateImageScale("front", value)}
                onRotateImage={(degrees) => rotateImage("front", degrees)}
                onRotate={(degrees) => rotateWatermark("front", degrees)}
                onReset={() => resetWatermark("front")}
              />
              <DocumentSideEditor
                target="back"
                label={t("backSide")}
                active={side === "back"}
                exists={Boolean(profile.backImageId)}
                dataUrl={profile.backDataUrl}
                settings={back}
                imageScale={imageScales.back}
                imageRotation={imageRotations.back}
                dragging={draggingFile === "back"}
                t={t}
                onActivate={() => activateSide("back")}
                onChoose={() => chooseImage("back")}
                onPaste={() => void pasteImage("back")}
                onDrop={(file) => void importFile("back", file)}
                onDragState={(dragging) =>
                  setDraggingFile(dragging ? "back" : null)
                }
                onPrepare={() =>
                  profile.backDataUrl &&
                  setPreparing({ side: "back", dataUrl: profile.backDataUrl })
                }
                onSettings={(changes) => updateSide("back", changes)}
                onImageScale={(value) => updateImageScale("back", value)}
                onRotateImage={(degrees) => rotateImage("back", degrees)}
                onRotate={(degrees) => rotateWatermark("back", degrees)}
                onReset={() => resetWatermark("back")}
                onRemove={() => void removeBackImage()}
              />
            </div>
          )}
        </section>
        <aside ref={controlsPanelRef} className="controls-panel">
          <section className="side-image-settings">
            <h2>
              1 · {activeSideLabel} {t("imageSettings")}
            </h2>
            <p>{t("imageSettingsNote")}</p>
            <Range
              label={t("imageZoom")}
              value={Math.round(imageScale * 100)}
              min={50}
              max={300}
              suffix="%"
              onChange={(value) => updateImageScale(side, value / 100)}
            />
          </section>
          <section>
            <div className="section-heading">
              <h2>
                2 · {activeSideLabel} {t("watermarkSettings")}
              </h2>
              <select
                aria-label={t("presets")}
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  const preset = vault.presets.find(
                    (p) => p.id === e.target.value,
                  );
                  if (preset) {
                    const { id: _id, name: _name, ...watermark } = preset;
                    const next = {
                      ...watermark,
                      text: normalizeLegacyWatermarkText(preset.text),
                    };
                    update(next);
                  }
                }}
              >
                <option value="">{t("presets")}…</option>
                {vault.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="side-settings-banner">
              <div className="side-settings-copy">
                <strong>{activeSideLabel}</strong>
                <span>{t("sideSpecific")}</span>
              </div>
              {profile.backImageId && (
                <button
                  type="button"
                  onClick={() => {
                    if (side === "front") setBack(structuredClone(front));
                    else setFront(structuredClone(back));
                  }}
                >
                  {side === "front" ? t("copyToBack") : t("copyToFront")}
                </button>
              )}
            </div>
            <div className="preset-actions">
              <button onClick={() => void savePreset("create")}>
                ＋ {t("savePreset")}
              </button>
              {selectedPreset && (
                <>
                  <button onClick={() => void savePreset("update")}>
                    {t("updatePreset")}
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => void deletePreset()}
                  >
                    {t("deletePreset")}
                  </button>
                </>
              )}
            </div>
            <label>
              {t("watermark")}
              <textarea
                rows={3}
                maxLength={1000}
                value={settings.text}
                onChange={(e) => {
                  update({ text: e.target.value });
                }}
              />
            </label>
            <div className="control-grid">
              <Range
                label={t("opacity")}
                value={Math.round(settings.opacity * 100)}
                min={10}
                max={100}
                suffix="%"
                onChange={(v) => update({ opacity: v / 100 })}
              />
              <label>
                {t("color")}
                <input
                  className="color"
                  type="color"
                  value={settings.color}
                  onChange={(e) => update({ color: e.target.value })}
                />
              </label>
              <label>
                {t("textAlign")}
                <select
                  value={settings.align}
                  onChange={(e) =>
                    update({
                      align: e.target.value as WatermarkSettings["align"],
                    })
                  }
                >
                  <option value="left">{t("alignLeft")}</option>
                  <option value="center">{t("alignCenter")}</option>
                  <option value="right">{t("alignRight")}</option>
                </select>
              </label>
              <Range
                label={t("lineSpacing")}
                value={Math.round(settings.lineHeight * 100)}
                min={80}
                max={200}
                suffix="%"
                onChange={(v) => update({ lineHeight: v / 100 })}
              />
            </div>
            <div className="check-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.uppercase}
                  onChange={(e) => update({ uppercase: e.target.checked })}
                />
                {t("uppercase")}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.dateEnabled}
                  onChange={(e) => update({ dateEnabled: e.target.checked })}
                />
                {t("date")}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.crossingLines.enabled}
                  onChange={(e) =>
                    update({
                      crossingLines: {
                        ...settings.crossingLines,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                {t("lines")}
              </label>
            </div>
            {settings.crossingLines.enabled && (
              <div className="control-grid crossing-controls">
                <Range
                  label={t("lineThickness")}
                  value={settings.crossingLines.thickness}
                  min={1}
                  max={20}
                  onChange={(thickness) =>
                    update({
                      crossingLines: { ...settings.crossingLines, thickness },
                    })
                  }
                />
                <Range
                  label={t("lineOpacity")}
                  value={Math.round(settings.crossingLines.opacity * 100)}
                  min={10}
                  max={100}
                  suffix="%"
                  onChange={(v) =>
                    update({
                      crossingLines: {
                        ...settings.crossingLines,
                        opacity: v / 100,
                      },
                    })
                  }
                />
                <Range
                  label={t("lineWidth")}
                  value={Math.round(settings.crossingLines.scale * 100)}
                  min={20}
                  max={100}
                  suffix="%"
                  onChange={(v) =>
                    update({
                      crossingLines: {
                        ...settings.crossingLines,
                        scale: v / 100,
                      },
                    })
                  }
                />
                <label>
                  {t("color")}
                  <input
                    className="color"
                    type="color"
                    value={settings.crossingLines.color}
                    onChange={(e) =>
                      update({
                        crossingLines: {
                          ...settings.crossingLines,
                          color: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}
          </section>
          <section className="export-section">
            <h2>3 · {t("export")}</h2>
            <div className="segmented">
              <button
                className={exportMode === "front" ? "active" : ""}
                onClick={() => setExportMode("front")}
              >
                {t("frontOnly")}
              </button>
              {profile.backImageId && (
                <>
                  <button
                    className={exportMode === "back" ? "active" : ""}
                    onClick={() => setExportMode("back")}
                  >
                    {t("backOnly")}
                  </button>
                  <button
                    className={exportMode === "combined" ? "active" : ""}
                    onClick={() => setExportMode("combined")}
                  >
                    {t("combined")}
                  </button>
                  {format !== "pdf" && (
                    <button
                      className={exportMode === "separate" ? "active" : ""}
                      onClick={() => setExportMode("separate")}
                    >
                      {t("separate")}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="two-col">
              <label>
                {t("format")}
                <select
                  value={format}
                  onChange={(e) => {
                    const next = e.target.value as ExportFormat;
                    setFormat(next);
                    if (next === "pdf" && exportMode === "separate")
                      setExportMode("combined");
                  }}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="pdf">PDF</option>
                </select>
              </label>
              <label>
                {t("quality")}
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as ExportQuality)}
                >
                  <option value="standard">{t("standard")}</option>
                  <option value="high">{t("high")}</option>
                  <option value="maximum">{t("maximum")}</option>
                </select>
              </label>
            </div>
            <div className="export-actions">
              <button
                onClick={() => void doExport(true)}
                disabled={busy || format === "pdf" || !profile.frontImageId}
              >
                {t("copy")}
              </button>
              <button
                className="primary grow"
                onClick={() => void doExport()}
                disabled={busy || !profile.frontImageId}
              >
                {busy ? "…" : `↓ ${t("export")}`}
              </button>
            </div>
            {lastExport && (
              <div className="post-export">
                <button
                  onClick={() => void window.palang.openExport(lastExport)}
                >
                  {t("openFile")}
                </button>
                <button
                  onClick={() => void window.palang.revealExport(lastExport)}
                >
                  {t("showFolder")}
                </button>
              </div>
            )}
          </section>
        </aside>
      </main>
      {preparing && (
        <ImagePreparationDialog
          dataUrl={preparing.dataUrl}
          t={t}
          onCancel={() => setPreparing(null)}
          onConfirm={async (dataUrl) => {
            try {
              await window.palang.importImageBytes(
                profile.id,
                preparing.side,
                dataUrlBytes(dataUrl),
              );
              await onProfileChange();
              setPreparing(null);
            } catch (cause) {
              onError(readError(cause));
            }
          }}
        />
      )}
    </>
  );
}

function DocumentSideEditor({
  target,
  label,
  active,
  exists,
  dataUrl,
  settings,
  imageScale,
  imageRotation,
  dragging,
  t,
  onActivate,
  onChoose,
  onPaste,
  onDrop,
  onDragState,
  onPrepare,
  onSettings,
  onImageScale,
  onRotateImage,
  onRotate,
  onReset,
  onRemove,
}: {
  target: "front" | "back";
  label: string;
  active: boolean;
  exists: boolean;
  dataUrl?: string;
  settings: WatermarkSettings;
  imageScale: number;
  imageRotation: ImageRotation;
  dragging: boolean;
  t: T;
  onActivate: () => void;
  onChoose: () => void;
  onPaste: () => void;
  onDrop: (file: File) => void;
  onDragState: (dragging: boolean) => void;
  onPrepare: () => void;
  onSettings: (changes: Partial<WatermarkSettings>) => void;
  onImageScale: (value: number) => void;
  onRotateImage: (degrees: -90 | 90) => void;
  onRotate: (degrees: number) => void;
  onReset: () => void;
  onRemove?: () => void;
}) {
  function drop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    onDragState(false);
    const file = event.dataTransfer.files[0];
    if (file) onDrop(file);
  }
  return (
    <article
      className={`document-side ${active ? "active" : ""} ${dragging ? "file-dragging" : ""}`}
      data-side={target}
      onFocusCapture={onActivate}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragState(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          onDragState(false);
      }}
      onDrop={drop}
    >
      <button
        type="button"
        className="document-side-heading"
        aria-label={label}
        aria-pressed={active}
        onClick={onActivate}
      >
        <div>
          <span>{target === "front" ? "01" : "02"}</span>
          <strong>{label}</strong>
        </div>
        {active && <small>{t("editing")}</small>}
      </button>
      {!exists ? (
        <div className="empty-side-upload">
          <span className="empty-image-icon">
            <EditorIcon name="image" />
          </span>
          <strong>{t("addBack")}</strong>
          <p>{t("addBackBody")}</p>
          <button className="primary" onClick={onChoose}>
            ＋ {t("addBack")}
          </button>
          <button onClick={onPaste}>⌘ {t("paste")}</button>
        </div>
      ) : (
        <>
          <div
            className="editor-tools side-editor-tools"
            role="group"
            aria-label={`${label}: ${t("editorControls")}`}
          >
            <div
              className="editor-tool-row"
              role="group"
              aria-label={`${label}: ${t("imageControls")}`}
            >
              <span className="editor-tool-label">
                <EditorIcon name="image" />
                {t("imageControls")}
              </span>
              <button
                className="tool-icon-button"
                disabled={!dataUrl}
                aria-label={`${label}: ${t("rotateImageLeft")}`}
                onClick={() => onRotateImage(-90)}
              >
                <EditorIcon name="rotate-left" />
              </button>
              <button
                className="tool-icon-button"
                disabled={!dataUrl}
                aria-label={`${label}: ${t("rotateImageRight")}`}
                onClick={() => onRotateImage(90)}
              >
                <EditorIcon name="rotate-right" />
              </button>
              <div
                className="zoom-control"
                role="group"
                aria-label={`${label} ${t("imageZoom").toLowerCase()}`}
              >
                <button
                  className="tool-icon-button"
                  disabled={imageScale <= 0.5}
                  aria-label={`${label}: ${t("zoomOut")}`}
                  onClick={() => onImageScale(imageScale - 0.05)}
                >
                  <EditorIcon name="zoom-out" />
                </button>
                <input
                  className="image-zoom-slider"
                  aria-label={`${label} ${t("imageZoom").toLowerCase()}`}
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.05}
                  value={imageScale}
                  onChange={(event) => onImageScale(Number(event.target.value))}
                />
                <output>{Math.round(imageScale * 100)}%</output>
                <button
                  className="tool-icon-button"
                  disabled={imageScale >= 3}
                  aria-label={`${label}: ${t("zoomIn")}`}
                  onClick={() => onImageScale(imageScale + 0.05)}
                >
                  <EditorIcon name="zoom-in" />
                </button>
              </div>
            </div>
            <div
              className="editor-tool-row watermark-tool-row"
              role="group"
              aria-label={`${label}: ${t("watermarkControl")}`}
            >
              <span
                className="watermark-tool-icon"
                title={t("watermarkControl")}
              >
                <EditorIcon name="type" />
              </span>
              <textarea
                className="quick-watermark-input"
                aria-label={`${t("edit")} ${label} ${t("watermarkControl").toLowerCase()}`}
                rows={2}
                maxLength={1000}
                value={settings.text}
                onChange={(event) => onSettings({ text: event.target.value })}
              />
              <label
                className="tool-color-button"
                title={`${t("color")}: ${settings.color.toUpperCase()}`}
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: settings.color }}
                />
                <EditorIcon name="palette" />
                <input
                  aria-label={`${label} ${t("color").toLowerCase()}`}
                  type="color"
                  value={settings.color}
                  onChange={(event) =>
                    onSettings({ color: event.target.value })
                  }
                />
              </label>
              <label className="tool-slider" title={t("size")}>
                <span aria-hidden="true">A</span>
                <input
                  aria-label={`${label} ${t("size").toLowerCase()}`}
                  type="range"
                  min={20}
                  max={200}
                  value={settings.fontSize}
                  onChange={(event) =>
                    onSettings({ fontSize: Number(event.target.value) })
                  }
                />
                <output>{Math.round(settings.fontSize)}px</output>
              </label>
              <button
                className="tool-icon-button"
                aria-label={`${label}: ${t("rotateWatermarkLeft")}`}
                onClick={() => onRotate(-5)}
              >
                <EditorIcon name="rotate-left" />
              </button>
              <label className="tool-slider" title={t("rotation")}>
                <EditorIcon name="angle" />
                <input
                  aria-label={`${label} ${t("rotation").toLowerCase()}`}
                  type="range"
                  min={-180}
                  max={180}
                  value={settings.rotation}
                  onChange={(event) =>
                    onSettings({ rotation: Number(event.target.value) })
                  }
                />
                <output>{Math.round(settings.rotation)}°</output>
              </label>
              <button
                className="tool-icon-button"
                aria-label={`${label}: ${t("rotateWatermarkRight")}`}
                onClick={() => onRotate(5)}
              >
                <EditorIcon name="rotate-right" />
              </button>
              <button
                className="tool-icon-button"
                aria-label={`${label}: ${t("resetWatermark")}`}
                onClick={onReset}
              >
                <EditorIcon name="reset" />
              </button>
            </div>
          </div>
          <p id={`${target}-watermark-gestures`} className="sr-only">
            {t("watermarkGesturesHint")}
          </p>
          {dataUrl ? (
            <WatermarkCanvas
              dataUrl={dataUrl}
              settings={settings}
              imageScale={imageScale}
              imageRotation={imageRotation}
              ariaLabel={`${label} ${t("documentPreview").toLowerCase()}`}
              ariaDescribedBy={`${target}-watermark-gestures`}
              onPosition={(x, y) => onSettings({ x, y })}
              onTransform={(fontSize, rotation) =>
                onSettings({ fontSize, rotation })
              }
              onImageScale={onImageScale}
            />
          ) : (
            <div className="corrupt-image">
              <strong>{t("error")}</strong>
              <p>{t("corruptImage")}</p>
              <button className="primary" onClick={onChoose}>
                {t("replace")}
              </button>
            </div>
          )}
          <p className="drop-hint">{t("dropHint")}</p>
          <div className="image-actions">
            <button disabled={!dataUrl} onClick={onPrepare}>
              ✂ {t("prepareImage")}
            </button>
            <button onClick={onChoose}>↻ {t("replace")}</button>
            <button onClick={onPaste}>⌘ {t("paste")}</button>
            {onRemove && (
              <button className="danger-text" onClick={onRemove}>
                {t("removeBack")}
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

type EditorIconName =
  | "image"
  | "crop"
  | "zoom-in"
  | "zoom-out"
  | "type"
  | "palette"
  | "angle"
  | "rotate-left"
  | "rotate-right"
  | "reset";

function EditorIcon({ name }: { name: EditorIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "image" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="m21 15-5-5L5 19" />
        </>
      )}
      {name === "crop" && (
        <>
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </>
      )}
      {(name === "zoom-in" || name === "zoom-out") && (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4M8 11h6" />
          {name === "zoom-in" && <path d="M11 8v6" />}
        </>
      )}
      {name === "type" && (
        <>
          <path d="M5 7V4h14v3M9 20h6M12 4v16" />
        </>
      )}
      {name === "palette" && (
        <>
          <path d="M12 22a9 9 0 1 0 0-18c-1.1 0-2 .9-2 2 0 .5.2 1 .6 1.4.4.4.6.9.6 1.4 0 1.1-.9 2-2 2H7a4 4 0 0 0 0 8h1.5c1 0 1.8.8 1.8 1.8 0 .8.7 1.4 1.7 1.4Z" />
          <circle cx="7.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="10.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="14.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="16.5" cy="11.5" r=".5" fill="currentColor" />
        </>
      )}
      {name === "angle" && (
        <>
          <path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 12v6" />
        </>
      )}
      {name === "rotate-left" && (
        <>
          <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
          <path d="M3 3v5h5" />
        </>
      )}
      {name === "rotate-right" && (
        <>
          <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
          <path d="M21 3v5h-5" />
        </>
      )}
      {name === "reset" && (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </>
      )}
    </svg>
  );
}

function WatermarkCanvas({
  dataUrl,
  settings,
  imageScale,
  imageRotation,
  ariaLabel,
  ariaDescribedBy,
  onPosition,
  onTransform,
  onImageScale,
}: {
  dataUrl: string;
  settings: WatermarkSettings;
  imageScale: number;
  imageRotation: ImageRotation;
  ariaLabel: string;
  ariaDescribedBy: string;
  onPosition: (x: number, y: number) => void;
  onTransform: (fontSize: number, rotation: number) => void;
  onImageScale: (scale: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{
    pointerId: number;
    point: { x: number; y: number };
  } | null>(null);
  const transform = useRef<{
    distance: number;
    angle: number;
    fontSize: number;
    rotation: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void renderDocument(
      dataUrl,
      settings,
      "standard",
      imageScale,
      imageRotation,
    ).then((rendered) => {
      if (!active || !ref.current) return;
      ref.current.width = rendered.width;
      ref.current.height = rendered.height;
      const ctx = ref.current.getContext("2d")!;
      ctx.drawImage(rendered, 0, 0);
      if (selected) drawWatermarkSelection(ctx, ref.current, settings);
    });
    return () => {
      active = false;
    };
  }, [dataUrl, settings, imageScale, imageRotation, selected]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startTransform() {
    const active = [...pointers.current.values()];
    if (active.length < 2) return;
    transform.current = {
      distance: Math.hypot(
        active[1].x - active[0].x,
        active[1].y - active[0].y,
      ),
      angle: Math.atan2(active[1].y - active[0].y, active[1].x - active[0].x),
      fontSize: settings.fontSize,
      rotation: settings.rotation,
    };
    drag.current = null;
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, point);
    if (transform.current && pointers.current.size >= 2) {
      const active = [...pointers.current.values()];
      const distance = Math.hypot(
        active[1].x - active[0].x,
        active[1].y - active[0].y,
      );
      const angle = Math.atan2(
        active[1].y - active[0].y,
        active[1].x - active[0].x,
      );
      const ratio = transform.current.distance
        ? distance / transform.current.distance
        : 1;
      const rotation =
        transform.current.rotation +
        ((angle - transform.current.angle) * 180) / Math.PI;
      onTransform(
        Math.min(200, Math.max(20, transform.current.fontSize * ratio)),
        ((((rotation + 180) % 360) + 360) % 360) - 180,
      );
      return;
    }
    if (!drag.current || drag.current.pointerId !== event.pointerId) {
      const ctx = event.currentTarget.getContext("2d");
      if (ctx)
        event.currentTarget.style.cursor = isPointInWatermark(
          ctx,
          event.currentTarget,
          settings,
          point,
        )
          ? "move"
          : "default";
      return;
    }
    const dx = (point.x - drag.current.point.x) / event.currentTarget.width;
    const dy = (point.y - drag.current.point.y) / event.currentTarget.height;
    drag.current.point = point;
    onPosition(
      clampNormalized(settings.x + dx),
      clampNormalized(settings.y + dy),
    );
  }

  function endPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    if (pointers.current.size < 2) transform.current = null;
  }

  function pinchWatermark(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (!event.ctrlKey) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.012);
    if (selected || isPointInWatermark(ctx, canvas, settings, point)) {
      setSelected(true);
      onTransform(
        Math.min(200, Math.max(20, settings.fontSize * factor)),
        settings.rotation,
      );
    } else {
      onImageScale(Math.min(3, Math.max(0.5, imageScale * factor)));
    }
  }
  return (
    <div className="canvas-frame">
      <canvas
        ref={ref}
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onPointerDown={(e) => {
          const point = canvasPoint(e);
          pointers.current.set(e.pointerId, point);
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d");
          const hit = Boolean(
            ctx && isPointInWatermark(ctx, e.currentTarget, settings, point),
          );
          if (pointers.current.size >= 2 && (selected || drag.current)) {
            setSelected(true);
            startTransform();
          } else if (hit) {
            setSelected(true);
            drag.current = { pointerId: e.pointerId, point };
          } else {
            setSelected(false);
            drag.current = null;
          }
        }}
        onPointerMove={move}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={pinchWatermark}
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          )
            return;
          e.preventDefault();
          const step = e.shiftKey ? 0.001 : 0.008;
          if (e.key === "ArrowLeft")
            onPosition(clampNormalized(settings.x - step), settings.y);
          if (e.key === "ArrowRight")
            onPosition(clampNormalized(settings.x + step), settings.y);
          if (e.key === "ArrowUp")
            onPosition(settings.x, clampNormalized(settings.y - step));
          if (e.key === "ArrowDown")
            onPosition(settings.x, clampNormalized(settings.y + step));
        }}
      />
    </div>
  );
}

function Settings({
  vault,
  passwordEnabled,
  t,
  onChange,
  onPasswordEnabled,
  onDone,
  onError,
}: {
  vault: VaultData;
  passwordEnabled: boolean;
  t: T;
  onChange: (v: VaultData) => void;
  onPasswordEnabled: (v: boolean) => void;
  onDone: () => void;
  onError: (v: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [conflict, setConflict] = useState<RestoreConflict>("copy");
  const [backupToken, setBackupToken] = useState<string | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(
    null,
  );
  const [selectedRestoreIds, setSelectedRestoreIds] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const vaultRef = useRef(vault);
  const settingsRef = useRef(vault.settings);
  const settingsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsRevisionRef = useRef(0);
  useEffect(() => {
    vaultRef.current = vault;
    settingsRef.current = vault.settings;
  }, [vault]);
  useEffect(() => {
    void window.palang.getVersion().then(setVersion);
  }, []);
  async function settings(changes: Partial<AppSettings>) {
    const revision = ++settingsRevisionRef.current;
    const current = settingsRef.current;
    const nextDefaultWatermark = changes.defaultWatermark
      ? {
          ...current.defaultWatermark,
          ...changes.defaultWatermark,
          crossingLines: {
            ...current.defaultWatermark.crossingLines,
            ...changes.defaultWatermark.crossingLines,
          },
        }
      : current.defaultWatermark;
    const nextSettings: AppSettings = {
      ...current,
      ...changes,
      defaultWatermark: nextDefaultWatermark,
    };
    settingsRef.current = nextSettings;
    const optimisticVault = {
      ...vaultRef.current,
      settings: nextSettings,
    };
    vaultRef.current = optimisticVault;
    onChange(optimisticVault);
    let saved: VaultData | undefined;
    const request = settingsQueueRef.current.then(async () => {
      saved = await window.palang.saveData({ settings: nextSettings });
    });
    settingsQueueRef.current = request.catch(() => undefined);
    try {
      await request;
      if (saved && settingsRef.current === nextSettings) {
        vaultRef.current = saved;
        onChange(saved);
      }
    } catch (cause) {
      onError(readError(cause));
      if (settingsRevisionRef.current !== revision) return;
      try {
        const fresh = await window.palang.list();
        vaultRef.current = fresh;
        settingsRef.current = fresh.settings;
        onChange(fresh);
      } catch {
        // Keep the original persistence error visible.
      }
    }
  }
  async function enable() {
    if (password !== confirmPassword || password.length < 8) {
      onError(t("passwordRules"));
      return;
    }
    try {
      await window.palang.enablePassword(password);
      onPasswordEnabled(true);
      await settings({ lockEnabled: true });
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function chooseDefaultFolder() {
    try {
      const folder = await window.palang.chooseExportFolder();
      if (folder) await settings({ defaultExportFolder: folder });
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function restoreDefaultPresets() {
    try {
      onChange(
        await window.palang.saveData({
          presets: structuredClone(defaultPresets),
        }),
      );
    } catch (cause) {
      onError(readError(cause));
    }
  }
  async function selectBackupFile() {
    try {
      const token = await window.palang.selectBackup();
      setBackupToken(token);
      setBackupPreview(null);
      setSelectedRestoreIds([]);
    } catch (cause) {
      onError(readError(cause));
    }
  }
  return (
    <>
      <header className="topbar">
        <Logo />
        <div className="privacy">
          <span>●</span>
          {t("privacy")}
        </div>
        <button className="primary" onClick={onDone}>
          {t("done")}
        </button>
      </header>
      <main className="settings-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PALANG IC</p>
            <h1>{t("settings")}</h1>
          </div>
        </div>
        <div className="settings-columns">
          <section className="settings-card">
            <h2>{t("general")}</h2>
            <label>
              {t("language")}
              <select
                value={vault.settings.language}
                onChange={(e) =>
                  void settings({ language: e.target.value as "en" | "ms" })
                }
              >
                <option value="en">English</option>
                <option value="ms">Bahasa Malaysia</option>
              </select>
            </label>
            <label>
              {t("appearance")}
              <select
                value={vault.settings.theme || "system"}
                onChange={(e) =>
                  void settings({ theme: e.target.value as ThemePreference })
                }
              >
                <option value="system">{t("themeSystem")}</option>
                <option value="light">{t("themeLight")}</option>
                <option value="dark">{t("themeDark")}</option>
              </select>
            </label>
            <label>
              {t("format")}
              <select
                value={vault.settings.defaultExportFormat}
                onChange={(e) =>
                  void settings({
                    defaultExportFormat: e.target.value as ExportFormat,
                  })
                }
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <label>
              {t("quality")}
              <select
                value={vault.settings.defaultExportQuality}
                onChange={(e) =>
                  void settings({
                    defaultExportQuality: e.target.value as ExportQuality,
                  })
                }
              >
                <option value="standard">{t("standard")}</option>
                <option value="high">{t("high")}</option>
                <option value="maximum">{t("maximum")}</option>
              </select>
            </label>
            <div>
              <label>{t("defaultFolder")}</label>
              <p className="path-value">
                {vault.settings.defaultExportFolder || "—"}
              </p>
              <button onClick={() => void chooseDefaultFolder()}>
                {t("chooseFolder")}
              </button>
            </div>
            <button onClick={() => void restoreDefaultPresets()}>
              ↺ {t("reset")} {t("presets")}
            </button>
          </section>
          <section className="settings-card">
            <h2>{t("watermark")}</h2>
            <Range
              label={t("opacity")}
              value={Math.round(vault.settings.defaultWatermark.opacity * 100)}
              min={10}
              max={100}
              suffix="%"
              onChange={(value) =>
                void settings({
                  defaultWatermark: {
                    ...vault.settings.defaultWatermark,
                    opacity: value / 100,
                  },
                })
              }
            />
            <label>
              {t("color")}
              <input
                className="color"
                type="color"
                value={vault.settings.defaultWatermark.color}
                onChange={(event) =>
                  void settings({
                    defaultWatermark: {
                      ...vault.settings.defaultWatermark,
                      color: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={vault.settings.defaultWatermark.dateEnabled}
                onChange={(event) =>
                  void settings({
                    defaultWatermark: {
                      ...vault.settings.defaultWatermark,
                      dateEnabled: event.target.checked,
                    },
                  })
                }
              />
              {t("date")}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={vault.settings.defaultWatermark.crossingLines.enabled}
                onChange={(event) =>
                  void settings({
                    defaultWatermark: {
                      ...vault.settings.defaultWatermark,
                      crossingLines: {
                        ...vault.settings.defaultWatermark.crossingLines,
                        enabled: event.target.checked,
                      },
                    },
                  })
                }
              />
              {t("lines")}
            </label>
            <button
              onClick={() =>
                void settings({
                  defaultWatermark: structuredClone(defaultWatermark),
                })
              }
            >
              ↺ {t("reset")}
            </button>
          </section>
          <section className="settings-card">
            <h2>{t("security")}</h2>
            <p className="hint">{t("noRecovery")}</p>
            {!passwordEnabled ? (
              <>
                <label>
                  {t("password")}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  {t("passwordConfirm")}
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                <button className="primary" onClick={() => void enable()}>
                  {t("enablePassword")}
                </button>
              </>
            ) : (
              <>
                <label>
                  {t("autoLock")}
                  <select
                    value={vault.settings.autoLockMinutes}
                    onChange={(e) =>
                      void settings({
                        autoLockMinutes: Number(
                          e.target.value,
                        ) as AppSettings["autoLockMinutes"],
                      })
                    }
                  >
                    <option value="0">{t("never")}</option>
                    <option value="1">{t("minute")}</option>
                    <option value="5">{t("minutes5")}</option>
                    <option value="15">{t("minutes15")}</option>
                    <option value="30">{t("minutes30")}</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={vault.settings.lockWhenMinimized}
                    onChange={(e) =>
                      void settings({ lockWhenMinimized: e.target.checked })
                    }
                  />
                  {t("minimized")}
                </label>
                <label>
                  {t("currentPassword")}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  {t("newPassword")}
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label>
                  {t("passwordConfirm")}
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    newPassword.length < 8 || newPassword !== confirmPassword
                  }
                  onClick={async () => {
                    try {
                      await window.palang.changePassword(password, newPassword);
                      setPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    } catch {
                      onError(t("incorrectPassword"));
                    }
                  }}
                >
                  {t("changePassword")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await window.palang.disablePassword(password);
                      onPasswordEnabled(false);
                      await settings({ lockEnabled: false });
                      setPassword("");
                    } catch {
                      onError(t("incorrectPassword"));
                    }
                  }}
                >
                  {t("disablePassword")}
                </button>
              </>
            )}
          </section>
          <section className="settings-card">
            <h2>{t("backup")}</h2>
            <p className="hint">{t("noRecovery")}</p>
            <label>
              {t("backupPassword")}
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
              />
            </label>
            <label>
              {t("passwordConfirm")}
              <input
                type="password"
                value={backupConfirm}
                onChange={(e) => setBackupConfirm(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={
                backupPassword.length < 8 || backupPassword !== backupConfirm
              }
              onClick={async () => {
                try {
                  if (await window.palang.createBackup(backupPassword, false))
                    await settings({ lastBackupAt: new Date().toISOString() });
                } catch (cause) {
                  onError(readError(cause));
                }
              }}
            >
              {t("createBackup")}
            </button>
            <button onClick={() => void selectBackupFile()}>
              {t("selectBackup")}
            </button>
            {backupToken && !backupPreview && (
              <button
                disabled={backupPassword.length < 1}
                onClick={async () => {
                  try {
                    const preview = await window.palang.previewBackup(
                      backupToken,
                      backupPassword,
                    );
                    setBackupPreview(preview);
                    setSelectedRestoreIds(
                      preview.profiles.map(
                        (profile: { id: string }) => profile.id,
                      ),
                    );
                  } catch {
                    onError(t("damagedBackup"));
                  }
                }}
              >
                {t("inspectBackup")}
              </button>
            )}
            {backupPreview && (
              <div className="restore-profiles">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={
                      selectedRestoreIds.length ===
                      backupPreview.profiles.length
                    }
                    onChange={(event) =>
                      setSelectedRestoreIds(
                        event.target.checked
                          ? backupPreview.profiles.map((profile) => profile.id)
                          : [],
                      )
                    }
                  />
                  {t("selectAll")}
                </label>
                {backupPreview.profiles.map((profile) => (
                  <label className="check" key={profile.id}>
                    <input
                      type="checkbox"
                      checked={selectedRestoreIds.includes(profile.id)}
                      onChange={(event) =>
                        setSelectedRestoreIds((current) =>
                          event.target.checked
                            ? [...current, profile.id]
                            : current.filter((id) => id !== profile.id),
                        )
                      }
                    />
                    {profile.name}
                    {profile.documentLabel ? ` · ${profile.documentLabel}` : ""}
                  </label>
                ))}
              </div>
            )}
            <label>
              {t("conflict")}
              <select
                value={conflict}
                onChange={(e) => setConflict(e.target.value as RestoreConflict)}
              >
                <option value="keep">{t("keep")}</option>
                <option value="replace">{t("replaceExisting")}</option>
                <option value="copy">{t("importCopy")}</option>
              </select>
            </label>
            <button
              disabled={
                !backupToken || !backupPreview || !selectedRestoreIds.length
              }
              onClick={async () => {
                try {
                  await window.palang.restoreSelectedBackup(
                    backupToken!,
                    backupPassword,
                    conflict,
                    selectedRestoreIds,
                  );
                  onChange(await window.palang.list());
                  setBackupToken(null);
                  setBackupPreview(null);
                  setSelectedRestoreIds([]);
                } catch {
                  onError(t("damagedBackup"));
                }
              }}
            >
              {t("restoreSelected")}
            </button>
          </section>
          <section className="settings-card">
            <h2>{t("about")}</h2>
            <p>{t("aboutBody")}</p>
            <p>
              {t("version")} {version}
            </p>
            <button
              onClick={() =>
                void window.palang.openExternal(
                  "https://www.youjing.dev/palang-ic",
                )
              }
            >
              {t("website")} ↗
            </button>
            <button
              onClick={() =>
                void window.palang.openExternal(
                  "https://www.youjing.dev/palang-ic",
                )
              }
            >
              {t("checkUpdates")} ↗
            </button>
            <button
              onClick={() =>
                void window.palang.openExternal("https://www.youjing.dev/")
              }
            >
              {t("support")} ↗
            </button>
            <button onClick={() => void window.palang.showLicenses()}>
              {t("licenses")}
            </button>
            <div className="danger-zone">
              <h3>{t("deleteAll")}</h3>
              <p>{t("deleteWarning")}</p>
              <button className="danger" onClick={() => setDeleteDialog(true)}>
                {t("deleteAll")}
              </button>
            </div>
          </section>
        </div>
      </main>
      {deleteDialog && (
        <Modal
          title={t("deleteAll")}
          closeLabel={t("close")}
          onClose={() => setDeleteDialog(false)}
        >
          <div className="form-stack">
            <p className="hint">{t("confirmDeleteAll")}</p>
            {passwordEnabled && (
              <label>
                {t("password")}
                <input
                  autoFocus
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </label>
            )}
            <div className="dialog-actions">
              <button onClick={() => setDeleteDialog(false)}>
                {t("cancel")}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await window.palang.deleteAll(
                      passwordEnabled ? deletePassword : undefined,
                    );
                    location.reload();
                  } catch {
                    onError(t("incorrectPassword"));
                  }
                }}
              >
                {t("deleteAll")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function LockScreen({
  t,
  passwordEnabled,
  error,
  onUnlock,
  onReset,
}: {
  t: T;
  passwordEnabled: boolean;
  error: string;
  onUnlock: (password: string) => void;
  onReset: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  return (
    <main className="lock-screen">
      <div className="lock-card">
        <Logo />
        <div className="lock-symbol">⌾</div>
        <h1>{t("unlock")}</h1>
        <p>{t("privacy")}</p>
        {error && <div className="inline-error">{error}</div>}
        {passwordEnabled ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUnlock(password);
            }}
          >
            <label>
              {t("password")}
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary">{t("unlockButton")}</button>
            <button
              type="button"
              className="danger-text forgot-button"
              onClick={() => {
                if (confirm(t("confirmResetVault"))) void onReset();
              }}
            >
              {t("forgotPassword")} {t("resetVault")}
            </button>
          </form>
        ) : (
          <button className="primary" onClick={() => onUnlock("")}>
            {t("unlockButton")}
          </button>
        )}
      </div>
    </main>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">P</span>
      <span>
        Palang <b>IC</b>
      </span>
    </div>
  );
}
function Modal({
  title,
  closeLabel,
  children,
  onClose,
}: {
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      {label}
      <div className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>
          {value}
          {suffix}
        </output>
      </div>
    </label>
  );
}
type T = (key: MessageKey) => string;
function formatDate(value: string, language: "en" | "ms") {
  return new Intl.DateTimeFormat(language === "ms" ? "ms-MY" : "en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function readError(cause: unknown) {
  const value = cause instanceof Error ? cause.message : String(cause);
  return value.replace(/^Error invoking remote method '[^']+': Error: /, "");
}
function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Invalid image");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
