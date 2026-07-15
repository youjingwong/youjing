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
      await page.locator('[data-testid="image-crop-dialog"]').count(),
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
      await page.locator('[data-testid="image-crop-dialog"]').count(),
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
    for (const name of ["Crop", "Replace image", "Paste image"])
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

  it("uses a focused direct-manipulation crop editor", async () => {
    userData = await mkdtemp(path.join(tmpdir(), "palang-ic-crop-e2e-"));
    running = await electron.launch({
      args: ["."],
      cwd: path.resolve("."),
      env: { ...process.env, PALANG_IC_USER_DATA: userData },
    });
    const page = await running.firstWindow();
    await page.getByRole("heading", { name: "Your profiles" }).waitFor();
    const imageBytes = await readFile(
      path.resolve("../public/og/id-marking.png"),
    );
    await page.evaluate(async (bytes) => {
      const profile = await window.palang.createProfile(
        "Crop Interaction",
        "ID",
      );
      await window.palang.importImageBytes(
        profile.id,
        "front",
        new Uint8Array(bytes),
      );
      await window.palang.importImageBytes(
        profile.id,
        "back",
        new Uint8Array(bytes),
      );
    }, Array.from(imageBytes));
    await page.reload();
    await page.getByText("Crop Interaction", { exact: true }).click();

    const frontEditor = page.locator(
      'article.document-side[data-side="front"]',
    );
    const backEditor = page.locator('article.document-side[data-side="back"]');
    const frontCrop = frontEditor.getByRole("button", {
      name: "Front: Crop",
    });
    const before = await page.evaluate(async () => {
      const profile = (await window.palang.list()).profiles.find(
        (item) => item.name === "Crop Interaction",
      )!;
      return {
        frontImageId: profile.frontImageId,
        backImageId: profile.backImageId,
      };
    });
    const frontImageZoom = frontEditor.getByRole("slider", {
      name: "Front image zoom",
    });
    await frontImageZoom.fill("1.2");
    await frontEditor
      .getByRole("button", { name: "Front: Rotate image right 90°" })
      .click();
    await frontCrop.click();

    let dialog = page.locator('[data-testid="image-crop-dialog"]');
    await dialog.waitFor();
    expect(await dialog.getAttribute("aria-label")).toBe("Crop image: Front");
    expect(await dialog.locator('input[type="range"]').count()).toBe(0);
    const cropSurface = dialog.locator('[data-testid="crop-surface"]');
    await expect
      .poll(() => cropSurface.getAttribute("data-ready"))
      .toBe("true");
    await expect
      .poll(() =>
        cropSurface.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    const initialPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    const zoomIn = dialog.getByRole("button", { name: "Zoom crop in" });
    await zoomIn.click();
    await zoomIn.click();
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(initialPreview);
    const zoomedPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    expect(
      Number(
        (await dialog.locator("#crop-zoom-status strong").innerText()).replace(
          "%",
          "",
        ),
      ),
    ).toBeGreaterThan(100);
    const surfaceBounds = await cropSurface.boundingBox();
    expect(surfaceBounds).not.toBeNull();
    await page.mouse.move(
      surfaceBounds!.x + surfaceBounds!.width / 2,
      surfaceBounds!.y + surfaceBounds!.height / 2,
    );
    await page.mouse.wheel(0, 120);
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(zoomedPreview);
    const wheelPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );

    const pinchCenter = {
      x: surfaceBounds!.x + surfaceBounds!.width / 2,
      y: surfaceBounds!.y + surfaceBounds!.height / 2,
    };
    await cropSurface.dispatchEvent("pointerdown", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      buttons: 1,
      clientX: pinchCenter.x - 30,
      clientY: pinchCenter.y,
    });
    await cropSurface.dispatchEvent("pointerdown", {
      pointerId: 42,
      pointerType: "touch",
      buttons: 1,
      clientX: pinchCenter.x + 30,
      clientY: pinchCenter.y,
    });
    await cropSurface.dispatchEvent("pointermove", {
      pointerId: 42,
      pointerType: "touch",
      buttons: 1,
      clientX: pinchCenter.x + 70,
      clientY: pinchCenter.y,
    });
    await cropSurface.dispatchEvent("pointerup", {
      pointerId: 42,
      pointerType: "touch",
      clientX: pinchCenter.x + 70,
      clientY: pinchCenter.y,
    });
    await cropSurface.dispatchEvent("pointerup", {
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
      clientX: pinchCenter.x - 30,
      clientY: pinchCenter.y,
    });
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(wheelPreview);
    const pinchPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    await cropSurface.press("ArrowRight");
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(pinchPreview);
    const keyboardMovedPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    await cropSurface.press("Alt+ArrowRight");
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(keyboardMovedPreview);
    const idCardRatio = dialog.getByRole("button", { name: "ID card" });
    await idCardRatio.click();
    expect(await idCardRatio.getAttribute("aria-pressed")).toBe("true");
    await zoomIn.click();
    const dragStartPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    const cropBounds = await cropSurface.boundingBox();
    expect(cropBounds).not.toBeNull();
    await page.mouse.move(
      cropBounds!.x + cropBounds!.width / 2,
      cropBounds!.y + cropBounds!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cropBounds!.x + cropBounds!.width / 2 + 35,
      cropBounds!.y + cropBounds!.height / 2 + 18,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(dragStartPreview);
    const draggedPreview = await cropSurface.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    );
    const northWestHandle = await cropSurface.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      return {
        x: bounds.left + Number(canvas.dataset.cropX) * bounds.width,
        y: bounds.top + Number(canvas.dataset.cropY) * bounds.height,
      };
    });
    await page.mouse.move(northWestHandle.x, northWestHandle.y);
    await page.mouse.down();
    await page.mouse.move(northWestHandle.x + 28, northWestHandle.y + 20, {
      steps: 4,
    });
    await page.mouse.up();
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .not.toBe(draggedPreview);

    await dialog.getByRole("button", { name: "Rotate right" }).click();
    const flipped = dialog.getByRole("button", {
      name: "Flip horizontally",
    });
    await flipped.click();
    expect(await flipped.getAttribute("aria-pressed")).toBe("true");
    await dialog.getByRole("button", { name: "Reset" }).click();
    expect(await flipped.getAttribute("aria-pressed")).toBe("false");
    await expect
      .poll(() =>
        cropSurface.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL(),
        ),
      )
      .toBe(initialPreview);
    for (let index = 0; index < 24 && (await zoomIn.isEnabled()); index += 1)
      await zoomIn.click();
    const done = dialog.getByRole("button", { name: "Done" });
    await expect.poll(() => done.isDisabled()).toBe(true);
    await dialog.getByText(/minimum 300 × 180 px/).waitFor();
    await dialog.getByRole("button", { name: "Full image" }).click();
    await expect.poll(() => done.isEnabled()).toBe(true);
    await zoomIn.click();
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog.count()).toBe(0);
    expect(
      await frontCrop.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    expect(await frontImageZoom.inputValue()).toBe("1.2");
    expect(
      await page.evaluate(async () => {
        const profile = (await window.palang.list()).profiles.find(
          (item) => item.name === "Crop Interaction",
        )!;
        return {
          frontImageId: profile.frontImageId,
          backImageId: profile.backImageId,
        };
      }),
    ).toEqual(before);

    await frontCrop.click();
    dialog = page.locator('[data-testid="image-crop-dialog"]');
    await dialog.waitFor();
    await expect
      .poll(() =>
        dialog
          .locator('[data-testid="crop-surface"]')
          .getAttribute("data-ready"),
      )
      .toBe("true");
    await dialog.getByRole("button", { name: "ID card" }).click();
    await dialog.getByRole("button", { name: "Zoom crop in" }).click();
    await dialog.getByRole("button", { name: "Rotate left" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10_000 });
    expect(await frontImageZoom.inputValue()).toBe("1");
    const after = await page.evaluate(async () => {
      const profile = (await window.palang.list()).profiles.find(
        (item) => item.name === "Crop Interaction",
      )!;
      return {
        frontImageId: profile.frontImageId,
        backImageId: profile.backImageId,
      };
    });
    expect(after.frontImageId).not.toBe(before.frontImageId);
    expect(after.backImageId).toBe(before.backImageId);
    const croppedFront = await page.evaluate(async () => {
      const profile = (await window.palang.list()).profiles.find(
        (item) => item.name === "Crop Interaction",
      )!;
      const opened = await window.palang.openProfile(profile.id);
      const image = new Image();
      image.src = opened.frontDataUrl;
      await image.decode();
      const sample = document.createElement("canvas");
      sample.width = 40;
      sample.height = 40;
      const context = sample.getContext("2d")!;
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(
        0,
        0,
        sample.width,
        sample.height,
      ).data;
      const colours = new Set<string>();
      for (let index = 0; index < pixels.length; index += 4)
        colours.add(
          `${pixels[index]}-${pixels[index + 1]}-${pixels[index + 2]}`,
        );
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        colourCount: colours.size,
      };
    });
    expect(croppedFront.width).toBeGreaterThanOrEqual(300);
    expect(croppedFront.width).toBeLessThan(1024);
    expect(croppedFront.height).toBeGreaterThan(croppedFront.width);
    expect(croppedFront.height).toBeLessThan(1792);
    expect(croppedFront.height / croppedFront.width).toBeCloseTo(1.586, 1);
    expect(croppedFront.colourCount).toBeGreaterThan(10);

    await page.getByRole("button", { name: /Back to profiles/ }).click();
    await page.getByText("Crop Interaction", { exact: true }).click();
    expect(await frontImageZoom.inputValue()).toBe("1");
    expect(
      await page.evaluate(async () => {
        const profile = (await window.palang.list()).profiles.find(
          (item) => item.name === "Crop Interaction",
        )!;
        return {
          imageScale: profile.frontEditorState?.imageScale,
          imageRotation: profile.frontEditorState?.imageRotation,
        };
      }),
    ).toEqual({ imageScale: 1, imageRotation: 0 });

    await running.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(960, 680);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(960);
    const backCrop = backEditor.getByRole("button", { name: "Back: Crop" });
    await backCrop.click();
    dialog = page.locator('[data-testid="image-crop-dialog"]');
    await dialog.waitFor();
    await expect
      .poll(() =>
        dialog
          .locator('[data-testid="crop-surface"]')
          .getAttribute("data-ready"),
      )
      .toBe("true");
    const minimumFit = await page.evaluate(() => {
      const modal = document
        .querySelector(".image-prep-modal")!
        .getBoundingClientRect();
      const surface = document
        .querySelector('[data-testid="crop-surface"]')!
        .getBoundingClientRect();
      const cancel = Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Cancel")!
        .getBoundingClientRect();
      const done = Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Done")!
        .getBoundingClientRect();
      return {
        modalInside:
          modal.left >= 0 &&
          modal.top >= 0 &&
          modal.right <= innerWidth &&
          modal.bottom <= innerHeight,
        surfaceUseful: surface.width > 300 && surface.height > 200,
        actionsVisible:
          cancel.top >= 0 &&
          cancel.bottom <= innerHeight &&
          done.top >= 0 &&
          done.bottom <= innerHeight,
        canScrollX: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(minimumFit).toEqual({
      modalInside: true,
      surfaceUseful: true,
      actionsVisible: true,
      canScrollX: false,
    });
    await page.screenshot({ path: screenshotPath("palang-crop-minimum.png") });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
    expect(
      await backCrop.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    const afterBackCancel = await page.evaluate(async () => {
      const profile = (await window.palang.list()).profiles.find(
        (item) => item.name === "Crop Interaction",
      )!;
      return {
        frontImageId: profile.frontImageId,
        backImageId: profile.backImageId,
      };
    });
    expect(afterBackCancel).toEqual(after);

    const backImageZoom = backEditor.getByRole("slider", {
      name: "Back image zoom",
    });
    await backImageZoom.fill("1.25");
    await backEditor
      .getByRole("button", { name: "Back: Rotate image right 90°" })
      .click();
    await backCrop.click();
    dialog = page.locator('[data-testid="image-crop-dialog"]');
    await expect
      .poll(() =>
        dialog
          .locator('[data-testid="crop-surface"]')
          .getAttribute("data-ready"),
      )
      .toBe("true");
    await dialog.getByRole("button", { name: "ID card" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10_000 });
    expect(await backImageZoom.inputValue()).toBe("1");
    const afterBackDone = await page.evaluate(async () => {
      const profile = (await window.palang.list()).profiles.find(
        (item) => item.name === "Crop Interaction",
      )!;
      return {
        frontImageId: profile.frontImageId,
        backImageId: profile.backImageId,
      };
    });
    expect(afterBackDone.frontImageId).toBe(after.frontImageId);
    expect(afterBackDone.backImageId).not.toBe(after.backImageId);

    await page.getByRole("button", { name: /Back to profiles/ }).click();
    await page.getByText("Crop Interaction", { exact: true }).click();
    expect(await backImageZoom.inputValue()).toBe("1");
    expect(
      await page.evaluate(async () => {
        const profile = (await window.palang.list()).profiles.find(
          (item) => item.name === "Crop Interaction",
        )!;
        return {
          imageScale: profile.backEditorState?.imageScale,
          imageRotation: profile.backEditorState?.imageRotation,
        };
      }),
    ).toEqual({ imageScale: 1, imageRotation: 0 });
  }, 60_000);
});
