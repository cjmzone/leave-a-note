/** @vitest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fillText: ReturnType<typeof vi.fn>;
  measureText: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
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

  beforeEach(() => {
    vi.restoreAllMocks();
    ensureCanvasToBlob();

    contextMock = {
      fillText: vi.fn(),
      measureText: vi.fn((value: string) => ({ width: value.length * 9 })),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([255, 255, 255, 255]),
        width: 1,
        height: 1,
      })),
      putImageData: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          fillStyle: "#000000",
          font: "16px sans-serif",
          textBaseline: "top",
          fillText: contextMock.fillText,
          measureText: contextMock.measureText,
          getImageData: contextMock.getImageData,
          putImageData: contextMock.putImageData,
        }) as unknown as CanvasRenderingContext2D
    );

    toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback: BlobCallback) => {
        callback(new Blob(["fake-png"], { type: "image/png" }));
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      expect(Number.parseFloat(resizedItem.style.width)).toBeGreaterThan(startWidth);
      expect(Number.parseFloat(resizedItem.style.height)).toBeGreaterThan(startHeight);
    });
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
    expect(contextMock.putImageData).toHaveBeenCalledTimes(1);
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
