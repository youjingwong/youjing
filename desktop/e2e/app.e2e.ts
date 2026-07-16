import { afterEach, describe, expect, it } from "vitest";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let running: ElectronApplication | undefined;
let userData: string | undefined;
const screenshotPath = (name: string) => path.join(tmpdir(), name);

async function readEditorLayout(page: Page) {
  return page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      front: bounds('article.document-side[data-side="front"]'),
      back: bounds('article.document-side[data-side="back"]'),
      exportPanel: bounds(".controls-panel"),
      frontToolbar: bounds(
        'article.document-side[data-side="front"] .side-editor-tools',
      ),
      backToolbar: bounds(
        'article.document-side[data-side="back"] .side-editor-tools',
      ),
      frontCanvas: bounds('canvas[aria-label="Front document preview"]'),
      backCanvas: bounds('canvas[aria-label="Back document preview"]'),
      canScrollX:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
}

async function readCompoundControlLayout(page: Page, selectors: string[]) {
  return page.evaluate((controlSelectors) => {
    return controlSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (control) => {
          const rect = control.getBoundingClientRect();
          const toolbar = control
            .closest<HTMLElement>(".contextual-control-row")!
            .getBoundingClientRect();
          const children = Array.from(control.children)
            .map((child) => (child as HTMLElement).getBoundingClientRect())
            .filter((child) => child.width > 0 && child.height > 0);
          const centres = children.map((child) => child.top + child.height / 2);
          return {
            control: control.dataset.control,
            childCount: children.length,
            oneLine:
              Math.max(...centres) - Math.min(...centres) <= 1 &&
              children.every(
                (child) =>
                  child.left >= rect.left - 1 && child.right <= rect.right + 1,
              ),
            noOverflow: control.scrollWidth <= control.clientWidth + 1,
            insideToolbar:
              rect.left >= toolbar.left - 1 && rect.right <= toolbar.right + 1,
          };
        },
      ),
    );
  }, selectors);
}

async function readFrontWatermarkToolbarBounds(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(
      'article.document-side[data-side="front"]',
    )!;
    const toolbar = card.querySelector<HTMLElement>(
      ".contextual-toolbar.watermark-toolbar",
    )!;
    const context = toolbar.querySelector<HTMLElement>(".watermark-context")!;
    const text = toolbar.querySelector<HTMLElement>(".quick-watermark-input")!;
    const row = toolbar.querySelector<HTMLElement>(".watermark-control-row")!;
    const rect = (element: Element) => element.getBoundingClientRect();
    const contains = (outer: DOMRect, inner: DOMRect) =>
      inner.left >= outer.left - 1 &&
      inner.top >= outer.top - 1 &&
      inner.right <= outer.right + 1 &&
      inner.bottom <= outer.bottom + 1;
    const cardRect = rect(card);
    const toolbarRect = rect(toolbar);
    const controls = [
      [
        "size",
        row.querySelector<HTMLElement>('[data-control="watermark-size"]')!,
      ],
      [
        "rotation",
        row.querySelector<HTMLElement>('[data-control="watermark-rotation"]')!,
      ],
      ["colour", row.querySelector<HTMLElement>(".tool-color-button")!],
      [
        "more",
        row.querySelector<HTMLElement>(
          "details.side-advanced-settings > summary",
        )!,
      ],
    ] as const;
    const popover = toolbar.querySelector<HTMLElement>(
      ".advanced-settings-popover",
    );
    const popoverRect = popover ? rect(popover) : null;
    const sizeRange = row.querySelector<HTMLInputElement>(
      '[data-control="watermark-size"] input[type="range"]',
    )!;
    const rotationRange = row.querySelector<HTMLInputElement>(
      '[data-control="watermark-rotation"] input[type="range"]',
    )!;
    return {
      contextInsideToolbar: contains(toolbarRect, rect(context)),
      textInsideToolbar: contains(toolbarRect, rect(text)),
      textInsideCard: contains(cardRect, rect(text)),
      rowInsideToolbar: contains(toolbarRect, rect(row)),
      rowNoOverflow: row.scrollWidth <= row.clientWidth + 1,
      toolbarNoOverflow: toolbar.scrollWidth <= toolbar.clientWidth + 1,
      rangesVisible: {
        size: getComputedStyle(sizeRange).display !== "none",
        rotation: getComputedStyle(rotationRange).display !== "none",
      },
      controls: controls.map(([name, element]) => {
        const controlRect = rect(element);
        return {
          name,
          insideToolbar: contains(toolbarRect, controlRect),
          insideCard: contains(cardRect, controlRect),
        };
      }),
      canScrollX:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      popover:
        popover && popoverRect
          ? {
              position: getComputedStyle(popover).position,
              insideViewport:
                popoverRect.left >= -1 &&
                popoverRect.top >= -1 &&
                popoverRect.right <= innerWidth + 1 &&
                popoverRect.bottom <= innerHeight + 1,
              insideCardHorizontally:
                popoverRect.left >= cardRect.left - 1 &&
                popoverRect.right <= cardRect.right + 1,
            }
          : null,
    };
  });
}

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
    await page
      .locator('article.document-side[data-side="front"] .side-editor-tools')
      .waitFor();
    const frontOnlyEditor = page.locator(
      'article.document-side[data-side="front"]',
    );
    const frontOnlyWatermark = frontOnlyEditor.getByRole("button", {
      name: "Front: Edit watermark",
    });
    const frontOnlyImage = frontOnlyEditor.getByRole("button", {
      name: "Front: Edit image",
    });
    const frontOnlyMore = frontOnlyEditor.locator(
      'summary[aria-label="Front: More watermark settings"]',
    );
    expect(
      await page
        .locator('article.document-side[data-side="back"] .empty-side-upload')
        .isVisible(),
    ).toBe(true);
    const launchedSize = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const originalTheme = await page.locator("html").getAttribute("data-theme");
    await frontOnlyWatermark.click();
    await frontOnlyEditor
      .getByLabel("Edit Front watermark")
      .fill(
        "A VERY LONG PRIVATE WATERMARK LABEL\nSECOND PRIVATE WATERMARK LINE",
      );
    const assertFrontOnlyWatermarkFit = async (rangesVisible: boolean) => {
      const closed = await readFrontWatermarkToolbarBounds(page);
      expect(closed.contextInsideToolbar).toBe(true);
      expect(closed.textInsideToolbar).toBe(true);
      expect(closed.textInsideCard).toBe(true);
      expect(closed.rowInsideToolbar).toBe(true);
      expect(closed.rowNoOverflow).toBe(true);
      expect(closed.toolbarNoOverflow).toBe(true);
      expect(closed.rangesVisible).toEqual({
        size: rangesVisible,
        rotation: rangesVisible,
      });
      expect(closed.controls.map(({ name }) => name)).toEqual([
        "size",
        "rotation",
        "colour",
        "more",
      ]);
      expect(
        closed.controls.every(
          ({ insideToolbar, insideCard }) => insideToolbar && insideCard,
        ),
      ).toBe(true);
      expect(closed.canScrollX).toBe(false);
      await frontOnlyMore.click();
      const opened = await readFrontWatermarkToolbarBounds(page);
      expect(opened.popover).not.toBeNull();
      expect(opened.popover!.position).toBe("absolute");
      expect(opened.popover!.insideViewport).toBe(true);
      expect(opened.popover!.insideCardHorizontally).toBe(true);
      await frontOnlyMore.click();
    };
    for (const theme of ["light", "dark"] as const) {
      await page.locator("html").evaluate((element, value) => {
        element.dataset.theme = value;
      }, theme);
      await assertFrontOnlyWatermarkFit(true);
    }
    for (const size of [
      { width: 1100, height: 760 },
      { width: 960, height: 680 },
    ]) {
      await running.evaluate(({ BrowserWindow }, nextSize) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(
          nextSize.width,
          nextSize.height,
        );
      }, size);
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([size.width, size.height]);
      for (const theme of ["light", "dark"] as const) {
        await page.locator("html").evaluate((element, value) => {
          element.dataset.theme = value;
        }, theme);
        await assertFrontOnlyWatermarkFit(false);
      }
    }
    await running.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    }, launchedSize);
    await expect
      .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
      .toEqual([launchedSize.width, launchedSize.height]);
    await page.locator("html").evaluate((element, value) => {
      if (value === null) delete element.dataset.theme;
      else element.dataset.theme = value;
    }, originalTheme);
    await frontOnlyImage.click();
    const backChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add back image" }).click();
    await (
      await backChooser
    ).setFiles(path.resolve("../public/og/id-marking.png"));
    await page
      .locator('article.document-side[data-side="back"] .side-editor-tools')
      .waitFor();
    const frontEditor = page.locator(
      'article.document-side[data-side="front"]',
    );
    const backEditor = page.locator('article.document-side[data-side="back"]');
    const frontAdvanced = frontEditor.locator("details.side-advanced-settings");
    const backAdvanced = backEditor.locator("details.side-advanced-settings");
    const frontControls = frontEditor.locator(".side-editor-tools");
    const backControls = backEditor.locator(".side-editor-tools");
    const frontImageButton = frontEditor.getByRole("button", {
      name: "Front: Edit image",
    });
    const backImageButton = backEditor.getByRole("button", {
      name: "Back: Edit image",
    });
    const frontWatermarkButton = frontEditor.getByRole("button", {
      name: "Front: Edit watermark",
    });
    const backWatermarkButton = backEditor.getByRole("button", {
      name: "Back: Edit watermark",
    });
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
    expect(await frontImageButton.getAttribute("aria-pressed")).toBe("true");
    expect(await backImageButton.getAttribute("aria-pressed")).toBe("true");
    expect(await frontWatermarkButton.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(await backWatermarkButton.getAttribute("aria-pressed")).toBe(
      "false",
    );
    await frontEditor
      .locator('.contextual-toolbar.image-toolbar[aria-label="Front: Image"]')
      .waitFor();
    await backEditor
      .locator('.contextual-toolbar.image-toolbar[aria-label="Back: Image"]')
      .waitFor();
    expect(await frontEditor.getByLabel("Edit Front watermark").count()).toBe(
      0,
    );
    expect(await backEditor.getByLabel("Edit Back watermark").count()).toBe(0);
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
    await running.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    const sideBySideLayout = await readEditorLayout(page);
    expect(sideBySideLayout.front.right).toBeLessThanOrEqual(
      sideBySideLayout.back.left,
    );
    expect(sideBySideLayout.back.right).toBeLessThanOrEqual(
      sideBySideLayout.exportPanel.left,
    );
    expect(sideBySideLayout.exportPanel.right).toBeLessThanOrEqual(
      sideBySideLayout.viewport.width,
    );
    expect(sideBySideLayout.frontToolbar.bottom).toBeLessThanOrEqual(
      sideBySideLayout.frontCanvas.top,
    );
    expect(sideBySideLayout.backToolbar.bottom).toBeLessThanOrEqual(
      sideBySideLayout.backCanvas.top,
    );
    expect(sideBySideLayout.canScrollX).toBe(false);

    const imageControlLayout = await readCompoundControlLayout(page, [
      '[data-control="image-rotation"]',
      '[data-control="image-zoom"]',
    ]);
    expect(imageControlLayout).toHaveLength(4);
    const frontImageControlNames = await frontEditor
      .locator("[data-control]")
      .evaluateAll((controls) =>
        controls.map((control) => (control as HTMLElement).dataset.control),
      );
    const backImageControlNames = await backEditor
      .locator("[data-control]")
      .evaluateAll((controls) =>
        controls.map((control) => (control as HTMLElement).dataset.control),
      );
    expect(frontImageControlNames).toEqual(["image-rotation", "image-zoom"]);
    expect(backImageControlNames).toEqual(frontImageControlNames);
    expect(
      imageControlLayout.every(
        (control) =>
          control.childCount >= 3 &&
          control.oneLine &&
          control.noOverflow &&
          control.insideToolbar,
      ),
    ).toBe(true);
    expect(
      await frontEditor
        .getByRole("button", { name: "Front: Crop" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("crop");
    expect(
      await frontEditor
        .getByRole("button", { name: "Front: Rotate image left 90°" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("rotate-left");
    expect(
      await frontEditor
        .getByRole("button", { name: "Front: Rotate image right 90°" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("rotate-right");

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
    const minimumLayout = await readEditorLayout(page);
    expect(minimumLayout.front.right).toBeLessThanOrEqual(
      minimumLayout.back.left,
    );
    expect(minimumLayout.back.right).toBeLessThanOrEqual(
      minimumLayout.exportPanel.left,
    );
    expect(minimumLayout.exportPanel.right).toBeLessThanOrEqual(
      minimumLayout.viewport.width,
    );
    expect(minimumLayout.frontToolbar.bottom).toBeLessThanOrEqual(
      minimumLayout.frontCanvas.top,
    );
    expect(minimumLayout.backToolbar.bottom).toBeLessThanOrEqual(
      minimumLayout.backCanvas.top,
    );
    expect(minimumLayout.frontCanvas.width).toBeGreaterThan(250);
    expect(minimumLayout.backCanvas.width).toBeGreaterThan(250);
    expect(minimumLayout.frontCanvas.bottom).toBeLessThanOrEqual(
      minimumLayout.viewport.height,
    );
    expect(minimumLayout.backCanvas.bottom).toBeLessThanOrEqual(
      minimumLayout.viewport.height,
    );
    expect(minimumLayout.canScrollX).toBe(false);
    const minimumImageControls = await readCompoundControlLayout(page, [
      '[data-control="image-rotation"]',
      '[data-control="image-zoom"]',
    ]);
    expect(minimumImageControls).toHaveLength(4);
    expect(
      minimumImageControls.every(
        (control) =>
          control.oneLine && control.noOverflow && control.insideToolbar,
      ),
    ).toBe(true);
    await page.screenshot({
      path: screenshotPath("palang-editor-minimum.png"),
    });

    await frontWatermarkButton.click();
    expect(await frontWatermarkButton.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(await backImageButton.getAttribute("aria-pressed")).toBe("true");
    await frontEditor
      .locator(
        '.contextual-toolbar.watermark-toolbar[aria-label="Front: Watermark"]',
      )
      .waitFor();
    const canvasBeforeOverlay = await frontCanvas.boundingBox();
    const frontMore = frontAdvanced.locator(
      'summary[aria-label="Front: More watermark settings"]',
    );
    await frontMore.click();
    expect(await frontAdvanced.getAttribute("open")).not.toBeNull();
    const resetWatermark = frontAdvanced.getByRole("button", {
      name: "Front: Reset watermark",
    });
    expect(await resetWatermark.locator("svg").getAttribute("data-icon")).toBe(
      "restore",
    );
    expect(
      await resetWatermark.locator('svg[data-icon^="rotate"]').count(),
    ).toBe(0);
    expect(
      await frontControls.getByRole("button", { name: /undo|redo/i }).count(),
    ).toBe(0);
    const minimumExpanded = await page.evaluate(() => {
      const popover = document
        .querySelector(
          'article.document-side[data-side="front"] .advanced-settings-popover',
        )!
        .getBoundingClientRect();
      const canvas = document
        .querySelector('canvas[aria-label="Front document preview"]')!
        .getBoundingClientRect();
      return {
        popover: {
          top: popover.top,
          right: popover.right,
          bottom: popover.bottom,
          left: popover.left,
        },
        canvas: { top: canvas.top, height: canvas.height },
        position: getComputedStyle(
          document.querySelector(
            'article.document-side[data-side="front"] .advanced-settings-popover',
          )!,
        ).position,
        canScrollX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    expect(minimumExpanded.position).toBe("absolute");
    expect(minimumExpanded.canvas.top).toBeCloseTo(canvasBeforeOverlay!.y, 0);
    expect(minimumExpanded.canvas.height).toBeCloseTo(
      canvasBeforeOverlay!.height,
      0,
    );
    expect(minimumExpanded.popover.left).toBeGreaterThanOrEqual(0);
    expect(minimumExpanded.popover.right).toBeLessThanOrEqual(960);
    expect(minimumExpanded.popover.bottom).toBeLessThanOrEqual(
      minimumLayout.viewport.height,
    );
    expect(minimumExpanded.canScrollX).toBe(false);
    await page.screenshot({
      path: screenshotPath("palang-editor-minimum-settings.png"),
    });
    await frontMore.click();
    await backWatermarkButton.click();
    expect(await backWatermarkButton.getAttribute("aria-pressed")).toBe("true");
    const frontWatermarkControlNames = await frontEditor
      .locator("[data-control]")
      .evaluateAll((controls) =>
        controls.map((control) => (control as HTMLElement).dataset.control),
      );
    const backWatermarkControlNames = await backEditor
      .locator("[data-control]")
      .evaluateAll((controls) =>
        controls.map((control) => (control as HTMLElement).dataset.control),
      );
    expect(frontWatermarkControlNames).toEqual([
      "watermark-size",
      "watermark-rotation",
    ]);
    expect(backWatermarkControlNames).toEqual(frontWatermarkControlNames);
    const minimumWatermarkControls = await readCompoundControlLayout(page, [
      '[data-control="watermark-size"]',
      '[data-control="watermark-rotation"]',
    ]);
    expect(minimumWatermarkControls).toHaveLength(4);
    expect(
      minimumWatermarkControls.every(
        (control) =>
          control.oneLine && control.noOverflow && control.insideToolbar,
      ),
    ).toBe(true);
    expect(
      await frontEditor
        .getByRole("button", { name: "Front: Rotate watermark left 5°" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("rotate-left");
    expect(
      await frontEditor
        .getByRole("button", { name: "Front: Rotate watermark right 5°" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("rotate-right");
    await running.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);

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
    const frontColour = frontEditor.getByLabel("Front colour");
    const backColour = backEditor.getByLabel("Back colour");
    expect(await backColour.inputValue()).toBe("#111827");
    await frontColour.fill("#244c3b");
    expect(await frontColour.inputValue()).toBe("#244c3b");
    expect(await backColour.inputValue()).toBe("#111827");
    const canvasBeforeAdvanced = {
      front: await frontCanvas.boundingBox(),
      back: await backCanvas.boundingBox(),
    };
    await frontAdvanced.locator("summary").click();
    expect(await frontAdvanced.getAttribute("open")).not.toBeNull();
    await backAdvanced.locator("summary").click();
    expect(await backAdvanced.getAttribute("open")).not.toBeNull();
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
    expect(await backPresetSelect.inputValue()).toBe("");
    const canvasWithAdvanced = {
      front: await frontCanvas.boundingBox(),
      back: await backCanvas.boundingBox(),
    };
    expect(canvasWithAdvanced.front!.y).toBeCloseTo(
      canvasBeforeAdvanced.front!.y,
      0,
    );
    expect(canvasWithAdvanced.back!.y).toBeCloseTo(
      canvasBeforeAdvanced.back!.y,
      0,
    );
    expect(
      await page.evaluate(() => {
        const popovers = Array.from(
          document.querySelectorAll<HTMLElement>(".advanced-settings-popover"),
        );
        return popovers.every(
          (popover) =>
            getComputedStyle(popover).position === "absolute" &&
            popover.getBoundingClientRect().left >= 0 &&
            popover.getBoundingClientRect().top >= 0 &&
            popover.getBoundingClientRect().right <= innerWidth &&
            popover.getBoundingClientRect().bottom <= innerHeight,
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: screenshotPath("palang-watermark-overlays.png"),
    });
    await frontAdvanced.locator("summary").click();
    await backAdvanced.locator("summary").click();
    await backQuickWatermark.fill("BACK ONLY");
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

    await frontImageButton.click();
    expect(await frontImageButton.getAttribute("aria-pressed")).toBe("true");
    expect(await backWatermarkButton.getAttribute("aria-pressed")).toBe("true");
    await backImageButton.click();
    const frontImageZoom = frontEditor.getByRole("slider", {
      name: "Front image zoom",
    });
    const backImageZoom = backEditor.getByRole("slider", {
      name: "Back image zoom",
    });
    expect(await backImageZoom.inputValue()).toBe("1");
    await frontImageZoom.fill("1.1");
    expect(await frontImageZoom.inputValue()).toBe("1.1");
    expect(await backImageZoom.inputValue()).toBe("1");
    await frontImageZoom.fill("1");
    await backImageZoom.fill("0.9");
    expect(await frontImageZoom.inputValue()).toBe("1");
    expect(await backImageZoom.inputValue()).toBe("0.9");

    const frontImageActions = frontEditor.locator(
      'details.image-file-menu > summary[aria-label="Front: Image actions"]',
    );
    await frontImageActions.click();
    expect(
      await frontControls
        .getByRole("button", { name: "Front: Replace image" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("replace");
    expect(
      await frontControls
        .getByRole("button", { name: "Front: Paste image" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("paste");
    await frontImageActions.click();
    const backImageActions = backEditor.locator(
      'details.image-file-menu > summary[aria-label="Back: Image actions"]',
    );
    await backImageActions.click();
    expect(
      await backControls
        .getByRole("button", { name: "Back: Remove back" })
        .locator("svg")
        .getAttribute("data-icon"),
    ).toBe("trash");
    await backImageActions.click();

    await frontWatermarkButton.click();
    expect(await frontQuickWatermark.inputValue()).toBe("FRONT ONLY");
    expect(await frontColour.inputValue()).toBe("#244c3b");
    await frontImageButton.click();
    expect(await frontImageZoom.inputValue()).toBe("1");

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

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const watermarkPoint = {
      x: box!.x + box!.width * (4 / 15),
      y: box!.y + box!.height * 0.3,
    };
    await page.mouse.click(watermarkPoint.x, watermarkPoint.y);
    expect(await frontWatermarkButton.getAttribute("aria-pressed")).toBe(
      "true",
    );
    const size = frontEditor.getByRole("slider", {
      name: "Front text size",
    });
    const initialSize = Number(await size.inputValue());
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
    expect(await frontImageButton.getAttribute("aria-pressed")).toBe("true");
    await expect
      .poll(async () => Number((await zoom.textContent())?.match(/\d+/)?.[0]))
      .toBeGreaterThan(100);
    const persistedZoom = (await zoom.textContent())?.match(/\d+%/)?.[0];
    await frontWatermarkButton.click();
    expect(Number(await size.inputValue())).toBe(resizedSize);
    await page.mouse.move(watermarkPoint.x, watermarkPoint.y);
    await page.mouse.down();
    await page.mouse.move(watermarkPoint.x + 24, watermarkPoint.y + 18, {
      steps: 4,
    });
    await page.mouse.up();
    await frontQuickWatermark.fill("CONFIDENTIAL COPY");
    await rotation.fill("18");
    const persistedSize = await size.inputValue();
    await frontImageButton.click();
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
    expect(await frontImageButton.getAttribute("aria-pressed")).toBe("true");
    await frontWatermarkButton.click();
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
    await frontImageButton.click();
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
    await backWatermarkButton.click();
    expect(await backQuickWatermark.inputValue()).toBe("BACK ONLY");
    await backImageButton.click();
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
