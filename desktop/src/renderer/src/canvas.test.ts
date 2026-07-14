import { describe, expect, it, vi } from "vitest";
import { defaultWatermark } from "../../shared/defaults";
import {
  drawWatermark,
  getRotatedImageDimensions,
  isPointInWatermark,
  normalizeImageRotation,
} from "./canvas";

describe("watermark rendering", () => {
  it("normalizes image quarter-turns and swaps output dimensions", () => {
    expect(normalizeImageRotation(-90)).toBe(270);
    expect(normalizeImageRotation(450)).toBe(90);
    expect(getRotatedImageDimensions(1200, 800, 0)).toEqual({
      width: 1200,
      height: 800,
    });
    expect(getRotatedImageDimensions(1200, 800, 90)).toEqual({
      width: 800,
      height: 1200,
    });
  });

  it("uses one shared position and rotation for text and crossing lines", () => {
    const translate = vi.fn();
    const rotate = vi.fn();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate,
      rotate,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "center",
      textBaseline: "middle",
    } as unknown as CanvasRenderingContext2D;

    drawWatermark(
      context,
      { width: 1200, height: 800 } as HTMLCanvasElement,
      defaultWatermark,
    );

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith(320, 240);
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(rotate).toHaveBeenCalledWith((-35 * Math.PI) / 180);
  });

  it("only selects points inside the rotated watermark item", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 24 }),
      font: "",
    } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 1200, height: 800 } as HTMLCanvasElement;

    expect(
      isPointInWatermark(context, canvas, defaultWatermark, {
        x: 320,
        y: 240,
      }),
    ).toBe(true);
    expect(
      isPointInWatermark(context, canvas, defaultWatermark, { x: 10, y: 10 }),
    ).toBe(false);
  });

  it("keeps left- and right-aligned text inside the selectable item", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      measureText: () => ({ width: 240 }),
      font: "",
    } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 1200, height: 800 } as HTMLCanvasElement;
    const base = {
      ...defaultWatermark,
      rotation: 0,
      crossingLines: { ...defaultWatermark.crossingLines, enabled: false },
    };

    expect(
      isPointInWatermark(
        context,
        canvas,
        { ...base, align: "left" },
        { x: 520, y: 240 },
      ),
    ).toBe(true);
    expect(
      isPointInWatermark(
        context,
        canvas,
        { ...base, align: "left" },
        { x: 200, y: 240 },
      ),
    ).toBe(false);
    expect(
      isPointInWatermark(
        context,
        canvas,
        { ...base, align: "right" },
        { x: 120, y: 240 },
      ),
    ).toBe(true);
  });

  it("scales both crossing lines with the watermark text", () => {
    function renderAt(fontSize: number) {
      const moveTo = vi.fn();
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        moveTo,
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        globalAlpha: 1,
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textAlign: "center",
        textBaseline: "middle",
      } as unknown as CanvasRenderingContext2D;
      drawWatermark(
        context,
        { width: 1200, height: 800 } as HTMLCanvasElement,
        { ...defaultWatermark, fontSize },
      );
      return {
        firstLineStart: moveTo.mock.calls[0],
        thickness: context.lineWidth,
      };
    }

    const normal = renderAt(52);
    const doubled = renderAt(104);
    expect(doubled.firstLineStart[0]).toBe(normal.firstLineStart[0] * 2);
    expect(doubled.firstLineStart[1]).toBe(normal.firstLineStart[1] * 2);
    expect(doubled.thickness).toBe(normal.thickness * 2);
  });
});
