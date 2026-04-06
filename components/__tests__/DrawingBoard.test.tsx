/** @vitest-environment jsdom */

import React from "react";
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DrawingBoard, { type DrawingBoardHandle } from "@/components/DrawingBoard";

vi.mock("p5", () => {
  class MockP5 {
    setup?: () => void;
    draw?: () => void;
    touchMoved?: () => boolean;

    mouseIsPressed = false;
    mouseX = 0;
    mouseY = 0;
    pmouseX = 0;
    pmouseY = 0;
    width = 0;
    height = 0;
    ROUND = "round";

    private canvas: HTMLCanvasElement | null = null;

    constructor(sketch: (p: MockP5) => void) {
      sketch(this);
      this.setup?.();
    }

    createCanvas(width: number, height: number) {
      this.width = width;
      this.height = height;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: width,
          bottom: height,
          width,
          height,
          toJSON: () => ({}),
        }),
      });

      this.canvas = canvas;

      return {
        elt: canvas,
        parent: (element: Element) => {
          element.appendChild(canvas);
        },
      };
    }

    background(..._args: unknown[]) {}
    strokeCap(..._args: unknown[]) {}
    stroke(..._args: unknown[]) {}
    strokeWeight(..._args: unknown[]) {}
    line(..._args: unknown[]) {}

    remove() {
      this.canvas?.remove();
    }
  }

  return {
    default: MockP5,
  };
});

type CanvasContextMock = {
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  measureText: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  usedFonts: string[];
};

function ensureCanvasToBlob() {
  if (HTMLCanvasElement.prototype.toBlob) {
    return;
  }

  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value(callback: BlobCallback) {
      callback(new Blob(["fake-png"], { type: "image/png" }));
    },
  });
}

describe("DrawingBoard text tool", () => {
  let contextMock: CanvasContextMock;
  let toBlobSpy: ReturnType<typeof vi.spyOn>;
  const originalImage = globalThis.Image;
  const originalFileReader = globalThis.FileReader;

  beforeEach(() => {
    vi.restoreAllMocks();
    ensureCanvasToBlob();

    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 480;
        naturalHeight = 320;
        complete = true;
        private _src = "";

        set src(value: string) {
          this._src = value;
          queueMicrotask(() => {
            this.onload?.();
          });
        }

        get src() {
          return this._src;
        }
      } as unknown as typeof Image
    );

    vi.stubGlobal(
      "FileReader",
      class {
        result: string | ArrayBuffer | null = null;
        onloadend: (() => void) | null = null;
        onerror: (() => void) | null = null;

        readAsDataURL() {
          this.result = "data:image/png;base64,aW1hZ2UtYnl0ZXM=";
          queueMicrotask(() => {
            this.onloadend?.();
          });
        }
      } as unknown as typeof FileReader
    );

    const usedFonts: string[] = [];
    const contextState = {
      fillStyle: "#000000",
      font: "16px sans-serif",
      textBaseline: "top" as CanvasTextBaseline,
    };

    contextMock = {
      drawImage: vi.fn(),
      fillText: vi.fn(() => {
        usedFonts.push(contextState.font);
      }),
      fillRect: vi.fn(),
      measureText: vi.fn((value: string) => ({ width: value.length * 9 })),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([255, 255, 255, 255]),
        width: 1,
        height: 1,
      })),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      usedFonts,
    };

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const mockContext = {
        get fillStyle() {
          return contextState.fillStyle;
        },
        set fillStyle(value: string | CanvasGradient | CanvasPattern) {
          contextState.fillStyle = String(value);
        },
        get font() {
          return contextState.font;
        },
        set font(value: string) {
          contextState.font = value;
        },
        get textBaseline() {
          return contextState.textBaseline;
        },
        set textBaseline(value: CanvasTextBaseline) {
          contextState.textBaseline = value;
        },
        drawImage: contextMock.drawImage,
        fillText: contextMock.fillText,
        fillRect: contextMock.fillRect,
        measureText: contextMock.measureText,
        getImageData: contextMock.getImageData,
        putImageData: contextMock.putImageData,
        save: contextMock.save,
        restore: contextMock.restore,
        translate: contextMock.translate,
        rotate: contextMock.rotate,
      };

      return mockContext as unknown as CanvasRenderingContext2D;
    });

    toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback: BlobCallback) => {
        callback(new Blob(["fake-png"], { type: "image/png" }));
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      writable: true,
      value: originalFileReader,
    });
  });

  it("updates brush size continuously via input events while dragging", async () => {
    render(<DrawingBoard />);

    const slider = (await screen.findByLabelText("Brush size")) as HTMLInputElement;

    expect(screen.getByText("4px")).toBeInTheDocument();

    fireEvent.input(slider, { target: { value: "9" } });
    expect(screen.getByText("9px")).toBeInTheDocument();

    fireEvent.input(slider, { target: { value: "15" } });
    expect(screen.getByText("15px")).toBeInTheDocument();

    fireEvent.touchStart(slider);
    fireEvent.input(slider, { target: { value: "18" } });
    expect(screen.getByText("18px")).toBeInTheDocument();
  });

  it("still supports click-to-set updates through change events", async () => {
    render(<DrawingBoard />);

    const slider = await screen.findByLabelText("Brush size");

    fireEvent.change(slider, { target: { value: "6" } });
    expect(screen.getByText("6px")).toBeInTheDocument();
  });

  it("supports pasting an image and lets the user move/resize it", async () => {
    const user = userEvent.setup();
    render(<DrawingBoard />);

    const pastedFile = new File(["fake-image"], "clipboard.png", {
      type: "image/png",
    });

    fireEvent.paste(window, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => pastedFile,
          },
        ],
      },
    });

    const imageItem = (await screen.findByTestId("canvas-image-item")) as HTMLDivElement;
    expect(screen.getByTestId("canvas-image-element")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Text" }));

    const startLeft = Number.parseFloat(imageItem.style.left);
    const startTop = Number.parseFloat(imageItem.style.top);

    fireEvent.mouseDown(screen.getByTestId("canvas-image-element"), {
      clientX: 150,
      clientY: 120,
    });
    fireEvent.mouseMove(window, { clientX: 220, clientY: 180 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeGreaterThan(startLeft);
      expect(Number.parseFloat(movedItem.style.top)).toBeGreaterThan(startTop);
    });

    const movedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
    const startWidth = Number.parseFloat(movedItem.style.width);
    const startHeight = Number.parseFloat(movedItem.style.height);
    const startRatio = startWidth / startHeight;

    fireEvent.mouseDown(screen.getByTestId("canvas-image-resize"), {
      clientX: 220,
      clientY: 180,
    });
    fireEvent.mouseMove(window, { clientX: 170, clientY: 130 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const resizedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
      const resizedWidth = Number.parseFloat(resizedItem.style.width);
      const resizedHeight = Number.parseFloat(resizedItem.style.height);

      expect(resizedWidth).toBeLessThan(startWidth);
      expect(resizedHeight).toBeLessThan(startHeight);
      expect(Math.abs(resizedWidth / resizedHeight - startRatio)).toBeLessThan(0.05);
    });
  });

  it("supports upload fallback and ignores non-image files", async () => {
    render(<DrawingBoard />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const invalidFile = new File(["plain"], "note.txt", { type: "text/plain" });

    fireEvent.change(uploadInput, {
      target: {
        files: [invalidFile],
      },
    });

    expect(screen.queryByTestId("canvas-image-item")).not.toBeInTheDocument();

    const validFile = new File(["fake-image"], "upload.png", { type: "image/png" });
    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    expect(await screen.findByTestId("canvas-image-item")).toBeInTheDocument();
  });

  it("shows image resize handle only when image is selected and hides on deselect", async () => {
    const user = userEvent.setup();
    render(<DrawingBoard />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const validFile = new File(["fake-image"], "upload.png", { type: "image/png" });

    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    await screen.findByTestId("canvas-image-item");
    expect(screen.queryByTestId("canvas-image-resize")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(await screen.findByTestId("canvas-image-resize")).toBeInTheDocument();

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    fireEvent.mouseDown(canvas, { clientX: 16, clientY: 16 });

    await waitFor(() => {
      expect(screen.queryByTestId("canvas-image-resize")).not.toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByTestId("canvas-image-element"), {
      clientX: 40,
      clientY: 40,
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-image-resize")).toBeInTheDocument();
    });
  });

  it("puts the brush canvas above overlay media layers in brush mode", async () => {
    const user = userEvent.setup();
    render(<DrawingBoard />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const validFile = new File(["fake-image"], "layering.png", { type: "image/png" });
    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    await screen.findByTestId("canvas-image-item");

    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(screen.getByTestId("canvas-mount-layer")).toHaveClass("z-10");
    expect(screen.getByTestId("canvas-overlay-layer")).toHaveClass("z-20");

    await user.click(screen.getByRole("button", { name: "Brush" }));
    expect(screen.getByTestId("canvas-mount-layer")).toHaveClass("z-20");
    expect(screen.getByTestId("canvas-overlay-layer")).toHaveClass("z-10");
  });

  it("supports image one-finger drag plus two-finger scale/rotate on mobile touch", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();
    render(<DrawingBoard ref={boardRef} />);

    const pastedFile = new File(["fake-image"], "touch.png", {
      type: "image/png",
    });
    fireEvent.paste(window, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => pastedFile,
          },
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "Text" }));

    const imageElement = await screen.findByTestId("canvas-image-element");
    const imageItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
    const startLeft = Number.parseFloat(imageItem.style.left);
    const startTop = Number.parseFloat(imageItem.style.top);

    fireEvent.touchStart(imageElement, {
      touches: [{ identifier: 1, clientX: 140, clientY: 120 }],
    });

    const ownedDragMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 188, clientY: 164 }],
      cancelable: true,
    });
    fireEvent(document, ownedDragMove);
    expect(ownedDragMove.defaultPrevented).toBe(true);

    fireEvent.touchMove(imageElement, {
      touches: [{ identifier: 1, clientX: 188, clientY: 164 }],
    });
    fireEvent.touchEnd(imageElement, { touches: [] });

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeGreaterThan(startLeft);
      expect(Number.parseFloat(movedItem.style.top)).toBeGreaterThan(startTop);
    });

    const movedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
    const preTransformWidth = Number.parseFloat(movedItem.style.width);

    fireEvent.touchStart(imageElement, {
      touches: [
        { identifier: 21, clientX: 120, clientY: 120 },
        { identifier: 22, clientX: 210, clientY: 120 },
      ],
    });

    const ownedGestureStart = new Event("gesturestart", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document, ownedGestureStart);
    expect(ownedGestureStart.defaultPrevented).toBe(true);

    fireEvent.touchMove(imageElement, {
      touches: [
        { identifier: 21, clientX: 110, clientY: 110 },
        { identifier: 22, clientX: 245, clientY: 200 },
      ],
    });
    fireEvent.touchEnd(imageElement, { touches: [] });

    await waitFor(() => {
      const transformedItem = screen.getByTestId("canvas-image-item") as HTMLDivElement;
      expect(Number.parseFloat(transformedItem.style.width)).toBeGreaterThan(
        preTransformWidth
      );
      expect(transformedItem.style.transform).not.toBe("rotate(0deg)");
    });

    const idleMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 40, clientY: 40 }],
      cancelable: true,
    });
    fireEvent(document, idleMove);
    expect(idleMove.defaultPrevented).toBe(false);

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    expect(contextMock.drawImage).toHaveBeenCalled();
    expect(contextMock.rotate).toHaveBeenCalled();
  });

  it("keeps normal page scrolling for touch gestures outside active image manipulation", async () => {
    const user = userEvent.setup();
    render(<DrawingBoard />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const validFile = new File(["fake-image"], "touch-away.png", { type: "image/png" });
    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(await screen.findByTestId("canvas-image-resize")).toBeInTheDocument();

    fireEvent.touchStart(canvas, {
      touches: [{ identifier: 31, clientX: 12, clientY: 12 }],
    });

    await waitFor(() => {
      expect(screen.queryByTestId("canvas-image-resize")).not.toBeInTheDocument();
    });

    const outsideMove = createEvent.touchMove(document, {
      touches: [{ identifier: 31, clientX: 20, clientY: 40 }],
      cancelable: true,
    });
    fireEvent(document, outsideMove);
    expect(outsideMove.defaultPrevented).toBe(false);
  });

  it("creates, edits, drags, and resizes inline text without box chrome", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 70 });

    const textInput = await screen.findByTestId("canvas-text-editor");

    await user.type(textInput, "Move and resize me");
    fireEvent.blur(textInput);

    const textItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
    const startLeft = Number.parseFloat(textItem.style.left);
    const startTop = Number.parseFloat(textItem.style.top);

    fireEvent.mouseDown(screen.getByTestId("canvas-text-placed"), {
      clientX: 130,
      clientY: 80,
    });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 140 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeGreaterThan(startLeft);
      expect(Number.parseFloat(movedItem.style.top)).toBeGreaterThan(startTop);
    });

    const movedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
    const startWidth = Number.parseFloat(movedItem.style.width);
    const startHeight = Number.parseFloat(movedItem.style.height);

    fireEvent.mouseDown(screen.getByTestId("canvas-text-resize"), {
      clientX: 200,
      clientY: 140,
    });
    fireEvent.mouseMove(window, { clientX: 260, clientY: 200 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const resizedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(Number.parseFloat(resizedItem.style.width)).not.toBe(startWidth);
      expect(Number.parseFloat(resizedItem.style.height)).toBeGreaterThan(startHeight);
    });
  });

  it("supports two-finger touch rotation/scale and exports transformed text", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 150, clientY: 110 });
    await user.type(await screen.findByLabelText("Canvas text"), "Gesture text");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed");
    const placedText = screen.getByText("Gesture text") as HTMLElement;
    const startFontSize = Number.parseFloat(placedText.style.fontSize);

    fireEvent.touchStart(placedButton, {
      touches: [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 200, clientY: 100 },
      ],
    });
    fireEvent.touchMove(placedButton, {
      touches: [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 220, clientY: 160 },
      ],
    });
    fireEvent.touchEnd(placedButton, { touches: [] });

    await waitFor(() => {
      const transformedText = screen.getByText("Gesture text") as HTMLElement;
      const transformedButton = screen.getByTestId("canvas-text-placed") as HTMLButtonElement;
      expect(Number.parseFloat(transformedText.style.fontSize)).toBeGreaterThan(startFontSize);
      expect(transformedButton.style.transform).not.toBe("rotate(0deg)");
    });

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    const numericFonts = contextMock.usedFonts
      .map((fontValue) => Number.parseFloat(fontValue))
      .filter((fontValue) => Number.isFinite(fontValue));

    expect(contextMock.save).toHaveBeenCalled();
    expect(contextMock.rotate).toHaveBeenCalled();
    expect(contextMock.restore).toHaveBeenCalled();
    expect(Math.max(...numericFonts)).toBeGreaterThan(startFontSize);
  });

  it("does not change text rotation/scale from one-finger touch gestures", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 100 });
    await user.type(await screen.findByLabelText("Canvas text"), "Single touch");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed");
    const placedText = screen.getByText("Single touch") as HTMLElement;
    const startFontSize = Number.parseFloat(placedText.style.fontSize);
    const startTransform = (placedButton as HTMLButtonElement).style.transform;

    fireEvent.touchStart(placedButton, {
      touches: [{ identifier: 1, clientX: 120, clientY: 90 }],
    });
    fireEvent.touchMove(placedButton, {
      touches: [{ identifier: 1, clientX: 220, clientY: 180 }],
    });
    fireEvent.touchEnd(placedButton, { touches: [] });

    await waitFor(() => {
      const unchangedText = screen.getByText("Single touch") as HTMLElement;
      const unchangedButton = screen.getByTestId("canvas-text-placed") as HTMLButtonElement;
      expect(Number.parseFloat(unchangedText.style.fontSize)).toBe(startFontSize);
      expect(unchangedButton.style.transform).toBe(startTransform);
    });
  });

  it("opens text editing on single-finger tap without movement", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 90 });
    await user.type(await screen.findByLabelText("Canvas text"), "Tap edit");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed");
    fireEvent.touchStart(placedButton, {
      touches: [{ identifier: 1, clientX: 120, clientY: 90 }],
    });
    fireEvent.touchEnd(placedButton, { touches: [] });

    expect(await screen.findByLabelText("Canvas text")).toHaveValue("Tap edit");
  });

  it("claims touch ownership only during selected-text manipulation", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 150, clientY: 110 });
    await user.type(await screen.findByLabelText("Canvas text"), "Ownership");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed");
    fireEvent.touchStart(placedButton, {
      touches: [{ identifier: 1, clientX: 150, clientY: 110 }],
    });
    expect((placedButton as HTMLButtonElement).style.touchAction).toBe("none");

    const ownedDragMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 210, clientY: 170 }],
      cancelable: true,
    });
    fireEvent(document, ownedDragMove);
    expect(ownedDragMove.defaultPrevented).toBe(true);

    fireEvent.touchMove(placedButton, {
      touches: [{ identifier: 1, clientX: 210, clientY: 170 }],
    });
    fireEvent.touchEnd(placedButton, { touches: [] });
    expect((placedButton as HTMLButtonElement).style.touchAction).toBe("manipulation");

    fireEvent.touchStart(placedButton, {
      touches: [
        { identifier: 7, clientX: 140, clientY: 100 },
        { identifier: 8, clientX: 220, clientY: 130 },
      ],
    });
    const ownedGestureStart = new Event("gesturestart", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document, ownedGestureStart);
    expect(ownedGestureStart.defaultPrevented).toBe(true);
    fireEvent.touchEnd(placedButton, { touches: [] });

    const idleTouchMove = createEvent.touchMove(canvas, {
      touches: [{ identifier: 2, clientX: 24, clientY: 24 }],
      cancelable: true,
    });
    fireEvent(canvas, idleTouchMove);
    expect(idleTouchMove.defaultPrevented).toBe(false);
  });

  it("releases touch ownership on touchcancel so scrolling cannot get stuck", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 156, clientY: 116 });
    await user.type(await screen.findByLabelText("Canvas text"), "Cancel reset");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed") as HTMLButtonElement;

    fireEvent.touchStart(placedButton, {
      touches: [{ identifier: 1, clientX: 156, clientY: 116 }],
    });
    expect(placedButton.style.touchAction).toBe("none");

    const ownedMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 206, clientY: 166 }],
      cancelable: true,
    });
    fireEvent(document, ownedMove);
    expect(ownedMove.defaultPrevented).toBe(true);

    fireEvent.touchCancel(window, { touches: [] });
    await waitFor(() => {
      expect(placedButton.style.touchAction).toBe("manipulation");
    });

    const idleMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 206, clientY: 166 }],
      cancelable: true,
    });
    fireEvent(document, idleMove);
    expect(idleMove.defaultPrevented).toBe(false);
  });

  it("supports one-finger touch drag on placed text without opening edit mode", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 130, clientY: 100 });
    await user.type(await screen.findByLabelText("Canvas text"), "Thumb drag");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed");
    const startItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
    const startLeft = Number.parseFloat(startItem.style.left);
    const startTop = Number.parseFloat(startItem.style.top);

    fireEvent.touchStart(placedButton, {
      touches: [{ identifier: 1, clientX: 130, clientY: 100 }],
    });
    fireEvent.touchMove(placedButton, {
      touches: [{ identifier: 1, clientX: 205, clientY: 170 }],
    });
    fireEvent.touchEnd(placedButton, { touches: [] });

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeGreaterThan(startLeft);
      expect(Number.parseFloat(movedItem.style.top)).toBeGreaterThan(startTop);
    });

    fireEvent.click(placedButton);
    expect(screen.queryByLabelText("Canvas text")).not.toBeInTheDocument();
  });

  it("keeps text touch-action scroll-friendly when not actively dragging/transforming", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 110 });
    await user.type(await screen.findByLabelText("Canvas text"), "Touch action");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    const placedButton = screen.getByTestId("canvas-text-placed") as HTMLButtonElement;
    expect(placedButton.style.touchAction).toBe("manipulation");
  });

  it("blocks page scroll during an active brush touch stroke and releases on touchend", async () => {
    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    fireEvent.touchStart(canvas, {
      touches: [{ identifier: 1, clientX: 120, clientY: 90 }],
    });

    const ownedMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 170, clientY: 140 }],
      cancelable: true,
    });
    fireEvent(document, ownedMove);
    expect(ownedMove.defaultPrevented).toBe(true);

    fireEvent.touchEnd(window, { touches: [] });

    const idleMove = createEvent.touchMove(document, {
      touches: [{ identifier: 1, clientX: 170, clientY: 140 }],
      cancelable: true,
    });
    fireEvent(document, idleMove);
    expect(idleMove.defaultPrevented).toBe(false);
  });

  it("keeps page scroll enabled for brush-mode touches that start outside the canvas", async () => {
    render(<DrawingBoard />);

    await waitFor(() => {
      expect(document.querySelector("canvas")).toBeTruthy();
    });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.touchStart(clearButton, {
      touches: [{ identifier: 2, clientX: 16, clientY: 16 }],
    });

    const moveEvent = createEvent.touchMove(document, {
      touches: [{ identifier: 2, clientX: 30, clientY: 64 }],
      cancelable: true,
    });
    fireEvent(document, moveEvent);
    expect(moveEvent.defaultPrevented).toBe(false);
  });

  it("starts text insertion at the exact click position, including near the right edge", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 314, clientY: 210 });

    await screen.findByLabelText("Canvas text");

    const item = screen.getByTestId("canvas-text-item") as HTMLDivElement;
    expect(Number.parseFloat(item.style.left)).toBeCloseTo(314, 0);
    expect(Number.parseFloat(item.style.top)).toBeCloseTo(210, 0);

    await user.type(screen.getByLabelText("Canvas text"), "Edge insert");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    await waitFor(() => {
      const placedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(screen.getByText("Edge insert")).toBeInTheDocument();
      expect(Number.parseFloat(placedItem.style.left)).toBeCloseTo(314, 0);
      expect(Number.parseFloat(placedItem.style.top)).toBeCloseTo(210, 0);
    });
  });

  it("allows dragging text beyond visible canvas bounds and re-editing it", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 90 });
    await user.type(await screen.findByLabelText("Canvas text"), "Free drag");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    fireEvent.mouseDown(screen.getByTestId("canvas-text-placed"), {
      clientX: 120,
      clientY: 90,
    });
    fireEvent.mouseMove(window, { clientX: -80, clientY: -60 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeLessThan(0);
      expect(Number.parseFloat(movedItem.style.top)).toBeLessThan(0);
    });

    fireEvent.mouseDown(screen.getByTestId("canvas-text-placed"), {
      clientX: 20,
      clientY: 20,
    });
    fireEvent.mouseMove(window, { clientX: 620, clientY: 480 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      const movedItem = screen.getByTestId("canvas-text-item") as HTMLDivElement;
      expect(Number.parseFloat(movedItem.style.left)).toBeGreaterThan(320);
      expect(Number.parseFloat(movedItem.style.top)).toBeGreaterThan(346);
    });

    await user.click(screen.getByText("Free drag"));
    expect(await screen.findByLabelText("Canvas text")).toHaveValue("Free drag");
  });

  it("uses a taller canvas and reopens placed text after blur hides editor UI", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    expect(canvas.height).toBeGreaterThan(Math.round(canvas.width * 0.95));

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 150, clientY: 120 });

    const textInput = await screen.findByLabelText("Canvas text");
    await user.type(textInput, "Placed text");
    fireEvent.blur(textInput);

    await waitFor(() => {
      expect(screen.queryByTestId("canvas-text-editor")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("MOVE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-text-box")).not.toBeInTheDocument();
    expect(screen.getByText("Placed text")).toBeInTheDocument();

    await user.click(screen.getByText("Placed text"));

    await waitFor(() => {
      expect(screen.getByTestId("canvas-text-editor")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Canvas text")).toHaveValue("Placed text");
  });

  it("commits text on tool switch and removes empty inactive text boxes", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 80 });
    await screen.findByTestId("canvas-text-editor");

    await user.click(screen.getByRole("button", { name: "Brush" }));

    expect(screen.queryByTestId("canvas-text-editor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("canvas-text-placed")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 150 });

    await user.type(await screen.findByLabelText("Canvas text"), "Commit on switch");
    await user.click(screen.getByRole("button", { name: "Brush" }));

    await waitFor(() => {
      expect(screen.queryByTestId("canvas-text-editor")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Commit on switch")).toBeInTheDocument();

    await user.click(screen.getByText("Commit on switch"));
    expect(await screen.findByLabelText("Canvas text")).toHaveValue("Commit on switch");
  });

  it("lets users change font for selected text and exports with that font", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    const fontSelect = screen.getByLabelText("Text font");

    await user.selectOptions(fontSelect, "space-mono");
    fireEvent.mouseDown(canvas, { clientX: 170, clientY: 110 });
    await user.type(await screen.findByLabelText("Canvas text"), "Font swap");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    await waitFor(() => {
      expect((screen.getByText("Font swap") as HTMLElement).style.fontFamily).toContain(
        "Space Mono"
      );
    });

    await user.click(screen.getByText("Font swap"));
    expect(await screen.findByLabelText("Canvas text")).toHaveValue("Font swap");
    expect(screen.getByLabelText("Text font")).toHaveValue("space-mono");

    await user.selectOptions(fontSelect, "caveat");

    await waitFor(() => {
      expect((screen.getByText("Font swap") as HTMLElement).style.fontFamily).toContain(
        "Caveat"
      );
    });

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    expect(contextMock.usedFonts.some((font) => font.includes("Caveat"))).toBe(true);
  });

  it("keeps existing text font when changing the picker with no active text selected", async () => {
    const user = userEvent.setup();

    render(<DrawingBoard />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    const fontSelect = screen.getByLabelText("Text font");

    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 80 });
    await user.type(await screen.findByLabelText("Canvas text"), "First font");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    await waitFor(() => {
      expect((screen.getByText("First font") as HTMLElement).style.fontFamily).toContain(
        "Nunito"
      );
    });

    await user.selectOptions(fontSelect, "merriweather");
    expect((screen.getByText("First font") as HTMLElement).style.fontFamily).toContain(
      "Nunito"
    );

    fireEvent.mouseDown(canvas, { clientX: 240, clientY: 170 });
    await user.type(await screen.findByLabelText("Canvas text"), "Second font");
    fireEvent.blur(screen.getByLabelText("Canvas text"));

    await waitFor(() => {
      expect((screen.getByText("Second font") as HTMLElement).style.fontFamily).toContain(
        "Merriweather"
      );
    });
  });

  it("renders non-empty text boxes into the exported image", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 140, clientY: 80 });
    await user.type(await screen.findByLabelText("Canvas text"), "Exported text");

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    expect(contextMock.fillText).toHaveBeenCalled();
    expect(toBlobSpy).toHaveBeenCalledTimes(1);
    expect(contextMock.fillRect).toHaveBeenCalledWith(0, 0, 320, 346);
  });

  it("includes inserted image overlays in exported output", async () => {
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const validFile = new File(["fake-image"], "export.png", { type: "image/png" });

    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    const insertedImageElement = (await screen.findByTestId(
      "canvas-image-element"
    )) as HTMLImageElement;

    Object.defineProperty(insertedImageElement, "complete", {
      configurable: true,
      value: true,
    });

    contextMock.drawImage.mockClear();

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    expect(contextMock.fillRect).toHaveBeenCalledWith(0, 0, 320, 346);
    expect(contextMock.drawImage).toHaveBeenCalledTimes(2);
    const firstCallSource = contextMock.drawImage.mock.calls[0]?.[0];
    const secondCallSource = contextMock.drawImage.mock.calls[1]?.[0];
    expect(firstCallSource).toBe(insertedImageElement);
    expect(secondCallSource).toBeInstanceOf(HTMLCanvasElement);
    expect(toBlobSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps text-mode export order with overlay media above the brush canvas", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const uploadInput = screen.getByLabelText("Upload image file");
    const validFile = new File(["fake-image"], "text-mode-export.png", { type: "image/png" });
    fireEvent.change(uploadInput, {
      target: {
        files: [validFile],
      },
    });

    await screen.findByTestId("canvas-image-item");
    await user.click(screen.getByRole("button", { name: "Text" }));

    contextMock.drawImage.mockClear();

    await act(async () => {
      const blob = await boardRef.current?.exportImageBlob();
      expect(blob).toBeInstanceOf(Blob);
    });

    expect(contextMock.drawImage).toHaveBeenCalledTimes(2);
    const firstCallSource = contextMock.drawImage.mock.calls[0]?.[0];
    const secondCallSource = contextMock.drawImage.mock.calls[1]?.[0];
    expect(firstCallSource).toBeInstanceOf(HTMLCanvasElement);
    expect(secondCallSource).not.toBeInstanceOf(HTMLCanvasElement);
  });

  it("skips drawing empty text boxes during export", async () => {
    const user = userEvent.setup();
    const boardRef = React.createRef<DrawingBoardHandle>();

    render(<DrawingBoard ref={boardRef} />);

    const canvas = await waitFor(() => {
      const nextCanvas = document.querySelector("canvas");
      expect(nextCanvas).toBeTruthy();
      return nextCanvas as HTMLCanvasElement;
    });

    await user.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 60 });
    await screen.findByTestId("canvas-text-editor");

    await act(async () => {
      await boardRef.current?.exportImageBlob();
    });

    expect(contextMock.fillText).not.toHaveBeenCalled();
    expect(toBlobSpy).toHaveBeenCalledTimes(1);
  });
});
