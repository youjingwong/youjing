import { afterEach, describe, expect, it } from "vitest";
import { _electron as electron, type ElectronApplication } from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let running: ElectronApplication | undefined;
let userData: string | undefined;
const screenshotPath = (name: string) => path.join(tmpdir(), name);

afterEach(async () => {
  await running?.close();
  running = undefined;
  if (userData) await rm(userData, { recursive: true, force: true });
});

describe("Palang IC desktop shell", () => {
  it("starts offline with an isolated renderer and opens settings", async () => {
    userData = await mkdtemp(path.join(tmpdir(), "palang-ic-e2e-"));
    running = await electron.launch({
      args: ["."],
      cwd: path.resolve("."),
      env: { ...process.env, PALANG_IC_USER_DATA: userData },
    });
    const page = await running.firstWindow();
    const networkRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) networkRequests.push(request.url());
    });
    await page.getByRole("heading", { name: "Your profiles" }).waitFor();
    const rendererSecurity = await page.evaluate(() => ({
      nodeRequire: typeof (window as unknown as { require?: unknown }).require,
      api: Object.keys(window.palang).sort(),
    }));
    expect(rendererSecurity.nodeRequire).toBe("undefined");
    expect(rendererSecurity.api).toEqual(
      [
        "changePassword",
        "chooseExportFolder",
        "copyImage",
        "createBackup",
        "createProfile",
        "deleteAll",
        "deleteProfile",
        "disablePassword",
        "duplicateProfile",
        "enablePassword",
        "getVersion",
        "importImage",
        "importImageBytes",
        "list",
        "lock",
        "onLocked",
        "openExport",
        "openExternal",
        "openProfile",
        "pasteImage",
        "previewBackup",
        "removeBack",
        "reorderProfiles",
        "resetForgottenPassword",
        "restoreBackup",
        "restoreSelectedBackup",
        "revealExport",
        "saveData",
        "saveEditorState",
        "saveExport",
        "selectBackup",
        "showLicenses",
        "status",
        "unlock",
        "updateProfile",
      ].sort(),
    );
    await expect(
      page.evaluate(() => window.palang.openExternal("https://example.com/")),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      page.evaluate(() => window.palang.createProfile("x".repeat(101))),
    ).rejects.toThrow(/profile name/i);
    await page.getByRole("button", { name: /Settings/ }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await page
      .getByText("Palang IC works offline.", { exact: false })
      .waitFor();
    const appearance = page.getByLabel("Appearance");
    await appearance.selectOption("dark");
    await expect
      .poll(() => page.locator("html").getAttribute("data-theme"))
      .toBe("dark");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(13, 18, 16)");
    await page.screenshot({ path: screenshotPath("palang-settings-dark.png") });
    await appearance.selectOption("light");
    await expect
      .poll(() => page.locator("html").getAttribute("data-theme"))
      .toBe("light");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(245, 246, 242)");
    await appearance.selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(13, 18, 16)");
    const loadedNetworkResources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => /^https?:/.test(url)),
    );
    expect([...networkRequests, ...loadedNetworkResources]).toEqual([]);
    const reopenedWindow = running.waitForEvent("window");
    await page.close();
    await running.evaluate(({ app }) => app.emit("activate"));
    const reopened = await reopenedWindow;
    await reopened.getByRole("heading", { name: "Your profiles" }).waitFor();
    await reopened.getByRole("button", { name: /Settings/ }).click();
    await reopened.getByRole("heading", { name: "Settings" }).waitFor();
    expect(await reopened.getByLabel("Appearance").inputValue()).toBe("system");
  });

  it("enables, changes, uses, and disables the local app password", async () => {
    userData = await mkdtemp(path.join(tmpdir(), "palang-ic-e2e-"));
    running = await electron.launch({
      args: ["."],
      cwd: path.resolve("."),
      env: { ...process.env, PALANG_IC_USER_DATA: userData },
    });
    const page = await running.firstWindow();
    await page.getByRole("heading", { name: "Your profiles" }).waitFor();
    await page.getByRole("button", { name: /Settings/ }).click();
    const security = page.locator("section.settings-card").filter({
      has: page.getByRole("heading", { name: "Security", exact: true }),
    });
    await security
      .getByLabel("Password", { exact: true })
      .fill("first password");
    await security.getByLabel("Confirm password").fill("first password");
    await security
      .getByRole("button", { name: "Enable application password" })
      .click();
    await security.getByLabel("Current password").waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: /Lock app/ }).click();
    await page.getByRole("heading", { name: "Unlock Palang IC" }).waitFor();
    const unlockPassword = page.getByLabel("Password", { exact: true });
    await unlockPassword.fill("wrong password");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByText("Incorrect password.", { exact: true }).waitFor();
    await unlockPassword.fill("first password");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("heading", { name: "Your profiles" }).waitFor();

    await page.getByRole("button", { name: /Settings/ }).click();
    await security.getByLabel("Current password").fill("first password");
    await security.getByLabel("New password").fill("second password");
    await security.getByLabel("Confirm password").fill("second password");
    await security.getByRole("button", { name: "Change password" }).click();
    await expect
      .poll(() => security.getByLabel("Current password").inputValue())
      .toBe("");
    await security.getByLabel("Current password").fill("second password");
    await security.getByRole("button", { name: "Disable password" }).click();
    await security
      .getByRole("button", { name: "Enable application password" })
      .waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    expect(await page.getByRole("button", { name: /Lock app/ }).count()).toBe(
      0,
    );
  });

  it("uses the web-style image and watermark interactions", async () => {
    userData = await mkdtemp(path.join(tmpdir(), "palang-ic-e2e-"));
    running = await electron.launch({
      args: ["."],
      cwd: path.resolve("."),
      env: { ...process.env, PALANG_IC_USER_DATA: userData },
    });
    const page = await running.firstWindow();
    await page.getByRole("heading", { name: "Your profiles" }).waitFor();
    await page.getByRole("button", { name: "Add profile" }).first().click();
    await page.getByLabel("Profile name").fill("No Image Yet");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByText("Add the front image", { exact: true }).waitFor();
    expect(await page.locator(".editor-layout.no-image").isVisible()).toBe(
      true,
    );
    expect(await page.locator(".empty-image-upload").isVisible()).toBe(true);
    expect(await page.locator(".controls-panel").isVisible()).toBe(false);
    await page.screenshot({ path: screenshotPath("palang-new-profile.png") });
    expect(
      await page
        .getByRole("dialog", { name: "Crop and prepare image" })
        .count(),
    ).toBe(0);
    await page.getByRole("button", { name: /Back to profiles/ }).click();
    const emptyProfileCard = page
      .locator("article.profile-card")
      .filter({ hasText: "No Image Yet" });
    await emptyProfileCard.getByRole("button", { name: "Duplicate" }).click();
    await page.getByText("No Image Yet (copy)", { exact: true }).waitFor();
    await page.getByText("No Image Yet (copy)", { exact: true }).click();
    await page.getByText("Add the front image", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Back to profiles/ }).click();
    const imageBytes = await readFile(
      path.resolve("../public/og/id-marking.png"),
    );
    await page.evaluate(async (bytes) => {
      const profile = await window.palang.createProfile("Gesture Test", "ID");
      await window.palang.importImageBytes(
        profile.id,
        "front",
        new Uint8Array(bytes),
      );
    }, Array.from(imageBytes));
    await page.reload();
    await page.getByText("Gesture Test", { exact: true }).click();
    expect(await page.getByText("Recipient", { exact: true }).count()).toBe(0);
    const previousFrontImageId = await page.evaluate(async () => {
      const vault = await window.palang.list();
      return vault.profiles.find((profile) => profile.name === "Gesture Test")!
        .frontImageId;
    });
    await page
      .locator('article.document-side[data-side="front"]')
      .evaluate((panel, bytes) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "replacement.png", {
            type: "image/png",
          }),
        );
        panel.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      }, Array.from(imageBytes));
    await expect
      .poll(async () => {
        const vault = await page.evaluate(() => window.palang.list());
        return vault.profiles.find((profile) => profile.name === "Gesture Test")
          ?.frontImageId;
      })
      .not.toBe(previousFrontImageId);
    expect(
      await page
        .getByRole("dialog", { name: "Crop and prepare image" })
        .count(),
    ).toBe(0);
    await page.getByLabel("Front: Editor controls").waitFor();
    const backChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add back image" }).click();
    await (
      await backChooser
    ).setFiles(path.resolve("../public/og/id-marking.png"));
    await page.getByLabel("Back: Editor controls").waitFor();
    const frontEditor = page.locator(
      'article.document-side[data-side="front"]',
    );
    const backEditor = page.locator('article.document-side[data-side="back"]');
    const frontAdvanced = frontEditor.locator("details.side-advanced-settings");
    const backAdvanced = backEditor.locator("details.side-advanced-settings");
    const frontControls = frontEditor.getByLabel("Front: Editor controls");
    const backControls = backEditor.getByLabel("Back: Editor controls");
    const frontCanvas = frontEditor.locator(
      'canvas[aria-label="Front document preview"]',
    );
    const backCanvas = backEditor.locator(
      'canvas[aria-label="Back document preview"]',
    );
    await Promise.all([
      frontEditor.waitFor(),
      backEditor.waitFor(),
      frontControls.waitFor(),
      backControls.waitFor(),
      frontCanvas.waitFor(),
      backCanvas.waitFor(),
    ]);
    const exportPanel = page.locator(".controls-panel");
    expect(await exportPanel.locator("section").count()).toBe(1);
    expect(
      await exportPanel
        .getByRole("heading", { name: "Export", exact: true })
        .count(),
    ).toBe(1);
    expect(
      await exportPanel
        .locator(
          ".side-image-settings, textarea, input[type=range], input[type=color], input[type=checkbox]",
        )
        .count(),
    ).toBe(0);
    const frontOnlyExport = exportPanel.getByRole("button", {
      name: "Front only",
    });
    await frontOnlyExport.waitFor();
    expect(await frontOnlyExport.getAttribute("aria-pressed")).toBe("true");
    await exportPanel.getByLabel("Format").waitFor();
    await exportPanel.getByLabel("Quality").waitFor();
    const sideBySideLayout = await page.evaluate(() => {
      function bounds(selector: string) {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      }
      return {
        front: bounds('article.document-side[data-side="front"]'),
        back: bounds('article.document-side[data-side="back"]'),
        frontControls: bounds(
          'article.document-side[data-side="front"] .side-editor-tools',
        ),
        backControls: bounds(
          'article.document-side[data-side="back"] .side-editor-tools',
        ),
        frontAdvanced: bounds(
          'article.document-side[data-side="front"] .side-advanced-settings',
        ),
        backAdvanced: bounds(
          'article.document-side[data-side="back"] .side-advanced-settings',
        ),
        frontCanvas: bounds('article.document-side[data-side="front"] canvas'),
        backCanvas: bounds('article.document-side[data-side="back"] canvas'),
      };
    });
    expect(sideBySideLayout.front.right).toBeLessThanOrEqual(
      sideBySideLayout.back.left,
    );
    expect(sideBySideLayout.frontControls.bottom).toBeLessThanOrEqual(
      sideBySideLayout.frontCanvas.top,
    );
    expect(sideBySideLayout.backControls.bottom).toBeLessThanOrEqual(
      sideBySideLayout.backCanvas.top,
    );
    expect(sideBySideLayout.frontAdvanced.bottom).toBeLessThanOrEqual(
      sideBySideLayout.frontCanvas.top,
    );
    expect(sideBySideLayout.backAdvanced.bottom).toBeLessThanOrEqual(
      sideBySideLayout.backCanvas.top,
    );

    const frontSideButton = frontEditor.getByRole("button", {
      name: "Front",
      exact: true,
    });
    const backSideButton = backEditor.getByRole("button", {
      name: "Back",
      exact: true,
    });
    await backSideButton.focus();
    await page.keyboard.press("Enter");
    expect(await backSideButton.getAttribute("aria-pressed")).toBe("true");
    await frontSideButton.focus();
    await page.keyboard.press("Enter");
    expect(await frontSideButton.getAttribute("aria-pressed")).toBe("true");

    await running.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(960, 680);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(960);
    const minimumLayout = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
        };
      };
      return {
        front: bounds('article.document-side[data-side="front"]'),
        back: bounds('article.document-side[data-side="back"]'),
        frontControls: bounds(
          'article.document-side[data-side="front"] .side-editor-tools',
        ),
        backControls: bounds(
          'article.document-side[data-side="back"] .side-editor-tools',
        ),
        frontAdvanced: bounds(
          'article.document-side[data-side="front"] .side-advanced-settings',
        ),
        backAdvanced: bounds(
          'article.document-side[data-side="back"] .side-advanced-settings',
        ),
        frontCanvas: bounds('article.document-side[data-side="front"] canvas'),
        backCanvas: bounds('article.document-side[data-side="back"] canvas'),
        details: bounds(".controls-panel"),
        pair: bounds(".document-pair"),
        canScrollX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    expect(minimumLayout.front.right).toBeLessThanOrEqual(
      minimumLayout.back.left,
    );
    expect(minimumLayout.frontControls.bottom).toBeLessThanOrEqual(
      minimumLayout.frontCanvas.top,
    );
    expect(minimumLayout.backControls.bottom).toBeLessThanOrEqual(
      minimumLayout.backCanvas.top,
    );
    expect(minimumLayout.frontAdvanced.bottom).toBeLessThanOrEqual(
      minimumLayout.frontCanvas.top,
    );
    expect(minimumLayout.backAdvanced.bottom).toBeLessThanOrEqual(
      minimumLayout.backCanvas.top,
    );
    expect(minimumLayout.frontCanvas.width).toBeGreaterThan(350);
    expect(minimumLayout.backCanvas.width).toBeGreaterThan(350);
    expect(minimumLayout.details.top).toBeGreaterThanOrEqual(
      minimumLayout.pair.bottom,
    );
    expect(minimumLayout.canScrollX).toBe(false);
    await page.screenshot({
      path: screenshotPath("palang-editor-minimum.png"),
    });
    await frontAdvanced.locator("summary").click();
    const minimumExpanded = await page.evaluate(() => {
      const settings = document
        .querySelector(
          'article.document-side[data-side="front"] .side-advanced-settings',
        )!
        .getBoundingClientRect();
      const canvas = document
        .querySelector('article.document-side[data-side="front"] canvas')!
        .getBoundingClientRect();
      return {
        settingsBottom: settings.bottom,
        canvasTop: canvas.top,
        canScrollX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    expect(minimumExpanded.settingsBottom).toBeLessThanOrEqual(
      minimumExpanded.canvasTop,
    );
    expect(minimumExpanded.canScrollX).toBe(false);
    await page.screenshot({
      path: screenshotPath("palang-editor-minimum-settings.png"),
    });
    await frontAdvanced.locator("summary").click();
    await running.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 788);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280);

    await frontSideButton.click();
    const frontQuickWatermark = frontEditor.getByLabel("Edit Front watermark");
    const backQuickWatermark = backEditor.getByLabel("Edit Back watermark");
    await frontQuickWatermark.fill("FIRST LINE\nSECOND LINE");
    expect(await frontQuickWatermark.inputValue()).toBe(
      "FIRST LINE\nSECOND LINE",
    );
    await page.screenshot({
      path: screenshotPath("palang-multiline-watermark.png"),
    });
    await frontQuickWatermark.fill("FRONT ONLY");
    const frontImageZoom = frontEditor.getByRole("slider", {
      name: "Front image zoom",
    });
    const backImageZoom = backEditor.getByRole("slider", {
      name: "Back image zoom",
    });
    const frontColour = frontEditor.getByLabel("Front colour");
    const backColour = backEditor.getByLabel("Back colour");
    expect(await backImageZoom.inputValue()).toBe("1");
    await frontImageZoom.fill("1.1");
    expect(await frontImageZoom.inputValue()).toBe("1.1");
    expect(await backImageZoom.inputValue()).toBe("1");
    expect(await backColour.inputValue()).toBe("#111827");
    await frontColour.fill("#244c3b");
    expect(await frontColour.inputValue()).toBe("#244c3b");
    expect(await backColour.inputValue()).toBe("#111827");
    await frontImageZoom.fill("1");
    await frontAdvanced.locator("summary").click();
    expect(await frontAdvanced.getAttribute("open")).not.toBeNull();
    await backAdvanced.locator("summary").click();
    expect(await backAdvanced.getAttribute("open")).not.toBeNull();
    for (const name of [
      "Crop and prepare image",
      "Replace image",
      "Paste image",
    ])
      await frontControls
        .getByRole("button", { name: `Front: ${name}` })
        .waitFor();
    expect(
      await frontAdvanced.locator("summary").getAttribute("aria-label"),
    ).toBe("Front: More watermark settings");
    expect(
      await backAdvanced.locator("summary").getAttribute("aria-label"),
    ).toBe("Back: More watermark settings");
    await frontAdvanced.getByLabel("Front presets").waitFor();
    const backPresetSelect = backAdvanced.getByLabel("Back presets");
    expect(await backPresetSelect.locator("option").count()).toBeGreaterThan(1);
    await backPresetSelect.selectOption({ index: 1 });
    expect(await backPresetSelect.inputValue()).not.toBe("");
    await frontAdvanced
      .getByRole("button", { name: "Front: Save as preset" })
      .waitFor();
    await frontAdvanced
      .getByRole("slider", { name: "Front opacity" })
      .waitFor();
    await frontAdvanced.getByLabel("Front alignment").waitFor();
    await frontAdvanced
      .getByRole("slider", { name: "Front line spacing" })
      .waitFor();
    await frontAdvanced.getByLabel("Front uppercase").waitFor();
    await frontAdvanced.getByLabel("Front add today’s date").waitFor();
    await frontAdvanced
      .getByRole("checkbox", { name: "Front crossing lines", exact: true })
      .waitFor();
    await frontAdvanced
      .getByRole("group", { name: "Front: Crossing line controls" })
      .waitFor();
    const frontOpacity = frontEditor.getByRole("slider", {
      name: "Front opacity",
    });
    const backOpacity = backEditor.getByRole("slider", {
      name: "Back opacity",
    });
    const backOpacityBeforeCopy = await backOpacity.inputValue();
    const frontAlignment = frontEditor.getByLabel("Front alignment");
    const backAlignment = backEditor.getByLabel("Back alignment");
    const backAlignmentBeforeCopy = await backAlignment.inputValue();
    const frontLineThickness = frontEditor.getByRole("slider", {
      name: "Front line thickness",
    });
    const backLineThickness = backEditor.getByRole("slider", {
      name: "Back line thickness",
    });
    const backThicknessBeforeCopy = await backLineThickness.inputValue();
    await frontOpacity.fill("64");
    await frontAlignment.selectOption("right");
    await frontLineThickness.fill("7");
    expect(await backOpacity.inputValue()).toBe(backOpacityBeforeCopy);
    expect(await backAlignment.inputValue()).toBe(backAlignmentBeforeCopy);
    expect(await backLineThickness.inputValue()).toBe(backThicknessBeforeCopy);
    await frontAdvanced
      .getByRole("button", { name: "Front: Copy watermark to back" })
      .click();
    expect(await backQuickWatermark.inputValue()).toBe("FRONT ONLY");
    expect(await backColour.inputValue()).toBe("#244c3b");
    expect(await backOpacity.inputValue()).toBe("64");
    expect(await backAlignment.inputValue()).toBe("right");
    expect(await backLineThickness.inputValue()).toBe("7");
    expect(await backImageZoom.inputValue()).toBe("1");
    expect(await backPresetSelect.inputValue()).toBe("");
    await backControls
      .getByRole("button", { name: "Back: Remove back" })
      .waitFor();
    const expandedOrdering = await page.evaluate(() => {
      const bottom = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect().bottom;
      const top = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect().top;
      return {
        front: {
          settings: bottom(
            'article.document-side[data-side="front"] .side-advanced-settings',
          ),
          canvas: top('article.document-side[data-side="front"] canvas'),
        },
        back: {
          settings: bottom(
            'article.document-side[data-side="back"] .side-advanced-settings',
          ),
          canvas: top('article.document-side[data-side="back"] canvas'),
        },
      };
    });
    expect(expandedOrdering.front.settings).toBeLessThanOrEqual(
      expandedOrdering.front.canvas,
    );
    expect(expandedOrdering.back.settings).toBeLessThanOrEqual(
      expandedOrdering.back.canvas,
    );
    await page.screenshot({
      path: screenshotPath("palang-settings-above.png"),
    });
    await frontAdvanced.locator("summary").click();
    await backAdvanced.locator("summary").click();
    await backImageZoom.fill("0.9");
    expect(await frontImageZoom.inputValue()).toBe("1");
    await backQuickWatermark.fill("BACK ONLY");
    expect(await frontImageZoom.inputValue()).toBe("1");
    expect(await backImageZoom.inputValue()).toBe("0.9");
    expect(await frontQuickWatermark.inputValue()).toBe("FRONT ONLY");
    const rotation = frontEditor.getByRole("slider", {
      name: "Front rotation",
    });
    const initialRotation = Number(await rotation.inputValue());
    await frontControls
      .getByRole("button", { name: "Front: Rotate watermark right 5°" })
      .click();
    expect(Number(await rotation.inputValue())).toBe(initialRotation + 5);
    await frontControls
      .getByRole("button", { name: "Front: Rotate watermark left 5°" })
      .click();
    expect(Number(await rotation.inputValue())).toBe(initialRotation);

    const zoom = frontEditor.getByRole("group", {
      name: "Front image zoom",
    });
    const canvas = frontCanvas;
    expect(await canvas.getAttribute("aria-describedby")).toBe(
      "front-watermark-gestures",
    );
    await frontEditor.getByText(/When the preview is focused/).waitFor();
    await canvas.focus();
    const previewScrollBeforeKeys = await page
      .locator(".preview-panel")
      .evaluate((element) => element.scrollTop);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    expect(
      await page
        .locator(".preview-panel")
        .evaluate((element) => element.scrollTop),
    ).toBe(previewScrollBeforeKeys);
    await zoom.getByText("100%").waitFor();
    await zoom.getByRole("button", { name: "Front: Zoom image in" }).click();
    await zoom.getByText("105%").waitFor();
    await zoom.getByRole("button", { name: "Front: Zoom image out" }).click();
    await zoom.getByText("100%").waitFor();
    for (let step = 0; step < 4; step += 1)
      await zoom.getByRole("button", { name: "Front: Zoom image out" }).click();
    await zoom.getByText("80%").waitFor();
    const edgePixel = await canvas.evaluate((element) =>
      Array.from(
        (element as HTMLCanvasElement)
          .getContext("2d")!
          .getImageData(2, 2, 1, 1).data,
      ),
    );
    expect(edgePixel.slice(0, 3)).not.toEqual([255, 255, 255]);
    await page.screenshot({
      path: screenshotPath("palang-blurred-background.png"),
    });
    for (let step = 0; step < 4; step += 1)
      await zoom.getByRole("button", { name: "Front: Zoom image in" }).click();
    await zoom.getByText("100%").waitFor();

    const size = frontEditor.getByRole("slider", {
      name: "Front text size",
    });
    const initialSize = Number(await size.inputValue());
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const watermarkPoint = {
      x: box!.x + box!.width * (4 / 15),
      y: box!.y + box!.height * 0.3,
    };
    await page.mouse.click(watermarkPoint.x, watermarkPoint.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -35);
    await page.keyboard.up("Control");
    await expect
      .poll(async () => Number(await size.inputValue()))
      .toBeGreaterThan(initialSize);
    const resizedSize = Number(await size.inputValue());
    await page.mouse.click(box!.x + 8, box!.y + 8);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -35);
    await page.keyboard.up("Control");
    expect(Number(await size.inputValue())).toBe(resizedSize);
    await expect
      .poll(async () => Number((await zoom.textContent())?.match(/\d+/)?.[0]))
      .toBeGreaterThan(100);
    await page.mouse.move(watermarkPoint.x, watermarkPoint.y);
    await page.mouse.down();
    await page.mouse.move(watermarkPoint.x + 24, watermarkPoint.y + 18, {
      steps: 4,
    });
    await page.mouse.up();
    await frontQuickWatermark.fill("CONFIDENTIAL COPY");
    await rotation.fill("18");
    const persistedZoom = (await zoom.textContent())?.match(/\d+%/)?.[0];
    const persistedSize = await size.inputValue();
    const landscapeDimensions = await canvas.evaluate((element) => ({
      width: (element as HTMLCanvasElement).width,
      height: (element as HTMLCanvasElement).height,
    }));
    await frontControls
      .getByRole("button", { name: "Front: Rotate image right 90°" })
      .click();
    await expect
      .poll(async () => {
        const dimensions = await canvas.evaluate((element) => ({
          width: (element as HTMLCanvasElement).width,
          height: (element as HTMLCanvasElement).height,
        }));
        return (
          dimensions.width < dimensions.height &&
          dimensions.width !== landscapeDimensions.width
        );
      })
      .toBe(true);
    await page.getByRole("button", { name: "Copy image" }).click();
    await expect
      .poll(async () => {
        const vault = await page.evaluate(() => window.palang.list());
        return vault.profiles.find((profile) => profile.name === "Gesture Test")
          ?.frontEditorState?.watermark.text;
      })
      .toBe("CONFIDENTIAL COPY");
    await expect
      .poll(async () => {
        const vault = await page.evaluate(() => window.palang.list());
        return vault.profiles.find((profile) => profile.name === "Gesture Test")
          ?.frontEditorState?.imageRotation;
      })
      .toBe(90);
    await page.getByRole("button", { name: /Back to profiles/ }).click();
    await page.getByText("Gesture Test", { exact: true }).click();
    expect(await frontQuickWatermark.inputValue()).toBe("CONFIDENTIAL COPY");
    expect(
      await frontEditor
        .getByRole("slider", { name: "Front rotation" })
        .inputValue(),
    ).toBe("18");
    expect(
      await frontEditor
        .getByRole("slider", { name: "Front text size" })
        .inputValue(),
    ).toBe(persistedSize);
    expect(
      await frontCanvas.evaluate(
        (element) =>
          (element as HTMLCanvasElement).height >
          (element as HTMLCanvasElement).width,
      ),
    ).toBe(true);
    await frontControls
      .getByRole("button", { name: "Front: Rotate image left 90°" })
      .click();
    await page.getByRole("button", { name: "Copy image" }).click();
    await expect
      .poll(async () => {
        const vault = await page.evaluate(() => window.palang.list());
        return vault.profiles.find((profile) => profile.name === "Gesture Test")
          ?.frontEditorState?.imageRotation;
      })
      .toBe(0);
    await backSideButton.click();
    expect(await backQuickWatermark.inputValue()).toBe("BACK ONLY");
    expect(
      await page.getByRole("slider", { name: "Back image zoom" }).inputValue(),
    ).toBe("0.9");
    await frontSideButton.click();
    await zoom.getByText(persistedZoom!).waitFor();
    const fit = await page.evaluate(() => {
      const tools = document
        .querySelector(
          'article.document-side[data-side="front"] .side-editor-tools',
        )!
        .getBoundingClientRect();
      const canvas = document
        .querySelector('canvas[aria-label="Front document preview"]')!
        .getBoundingClientRect();
      return {
        canScrollX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        toolsVisible: tools.top >= 0 && tools.bottom <= window.innerHeight,
        canvasVisible: canvas.top >= 0 && canvas.bottom <= window.innerHeight,
      };
    });
    expect(fit).toEqual({
      canScrollX: false,
      toolsVisible: true,
      canvasVisible: true,
    });
    await page.waitForTimeout(350);
    await page.screenshot({
      path: screenshotPath("palang-desktop-unified.png"),
    });
    await page.evaluate(async () => {
      const vault = await window.palang.list();
      await window.palang.saveData({
        settings: { ...vault.settings, theme: "dark" },
      });
    });
    await page.reload();
    await page.getByText("Gesture Test", { exact: true }).click();
    await page.getByRole("group", { name: "Front image zoom" }).waitFor();
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: screenshotPath("palang-editor-dark.png") });
  }, 60_000);
});
