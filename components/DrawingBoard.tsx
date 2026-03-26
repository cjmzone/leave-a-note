"use client";

import type p5 from "p5";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type DrawingBoardHandle = {
  exportImageBlob: () => Promise<Blob>;
  clear: () => void;
};

type ToolMode = "brush" | "text";

type CanvasTextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
};

type InteractionState = {
  mode: "drag" | "resize";
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

const DEFAULT_COLOR = "#000000";
const DEFAULT_BRUSH_SIZE = 4;
const DEFAULT_TEXT_BOX_WIDTH = 220;
const DEFAULT_TEXT_BOX_HEIGHT = 84;
const TEXT_BOX_MIN_WIDTH = 100;
const TEXT_BOX_MIN_HEIGHT = 56;
const TEXT_BOX_INNER_PADDING = 8;
const TEXT_BOX_DRAG_BAR_HEIGHT = 0;

const CANVAS_MAX_WIDTH = 1040;
const CANVAS_MIN_WIDTH = 320;
const CANVAS_HEIGHT_RATIO = 1.08;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createTextBoxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `box-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTextFontSize(boxHeight: number): number {
  return clamp(Math.round(boxHeight * 0.33), 16, 56);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  lineHeight: number
): void {
  const paragraphs = text.split("\n");
  let cursorY = y;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    const lines: string[] = [];

    if (words.length === 0) {
      lines.push("");
    }

    let currentLine = "";

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;

      if (context.measureText(nextLine).width <= width || !currentLine) {
        currentLine = nextLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine || lines.length === 0) {
      lines.push(currentLine);
    }

    for (const line of lines) {
      if (cursorY + lineHeight > y + height) {
        return;
      }

      context.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
  }
}

const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<p5 | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushColor, setBrushColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [canvasSize, setCanvasSize] = useState({
    width: CANVAS_MIN_WIDTH,
    height: Math.round(CANVAS_MIN_WIDTH * CANVAS_HEIGHT_RATIO),
  });
  const [textBoxes, setTextBoxes] = useState<CanvasTextBox[]>([]);
  const [activeTextBoxId, setActiveTextBoxId] = useState<string | null>(null);

  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const toolModeRef = useRef<ToolMode>(toolMode);
  const interactionRef = useRef<InteractionState | null>(null);
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    brushColorRef.current = brushColor;
  }, [brushColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    toolModeRef.current = toolMode;
  }, [toolMode]);

  useEffect(() => {
    let isMounted = true;
    let instance: p5 | null = null;

    const boot = async () => {
      const p5Module = await import("p5");
      const P5 = p5Module.default;

      if (!isMounted) {
        return;
      }

      const sketch = (p: p5) => {
        p.setup = () => {
          const hostWidth = canvasHostRef.current?.clientWidth ?? CANVAS_MAX_WIDTH;
          const canvasWidth = clamp(
            Math.floor(hostWidth),
            CANVAS_MIN_WIDTH,
            CANVAS_MAX_WIDTH
          );
          const canvasHeight = Math.round(canvasWidth * CANVAS_HEIGHT_RATIO);

          const canvas = p.createCanvas(canvasWidth, canvasHeight);
          canvas.parent(canvasMountRef.current as Element);
          p.background(255);
          p.strokeCap(p.ROUND);
          canvasElementRef.current = canvas.elt as HTMLCanvasElement;
          setCanvasSize({ width: canvasWidth, height: canvasHeight });
        };

        p.draw = () => {
          if (toolModeRef.current === "text") {
            return;
          }

          if (!p.mouseIsPressed) {
            return;
          }

          const insideCanvas =
            p.mouseX >= 0 &&
            p.mouseX <= p.width &&
            p.mouseY >= 0 &&
            p.mouseY <= p.height;

          if (!insideCanvas) {
            return;
          }

          p.stroke(brushColorRef.current);
          p.strokeWeight(brushSizeRef.current);
          p.line(p.pmouseX, p.pmouseY, p.mouseX, p.mouseY);
        };

        p.touchMoved = () => {
          return false;
        };
      };

      instance = new P5(sketch);
      p5Ref.current = instance;
    };

    void boot();

    return () => {
      isMounted = false;
      instance?.remove();
      p5Ref.current = null;
      canvasElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;

      if (!interaction) {
        return;
      }

      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((box) => {
          if (box.id !== interaction.id) {
            return box;
          }

          if (interaction.mode === "drag") {
            const maxX = Math.max(0, canvasSize.width - box.width);
            const maxY = Math.max(0, canvasSize.height - box.height);

            return {
              ...box,
              x: clamp(interaction.startX + deltaX, 0, maxX),
              y: clamp(interaction.startY + deltaY, 0, maxY),
            };
          }

          const widthLimit = Math.max(
            TEXT_BOX_MIN_WIDTH,
            canvasSize.width - interaction.startX
          );
          const heightLimit = Math.max(
            TEXT_BOX_MIN_HEIGHT,
            canvasSize.height - interaction.startY
          );

          return {
            ...box,
            width: clamp(interaction.startWidth + deltaX, TEXT_BOX_MIN_WIDTH, widthLimit),
            height: clamp(
              interaction.startHeight + deltaY,
              TEXT_BOX_MIN_HEIGHT,
              heightLimit
            ),
          };
        })
      );
    };

    const handleWindowMouseUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [canvasSize.height, canvasSize.width]);

  const clearCanvas = useCallback(() => {
    p5Ref.current?.background(255);
    setTextBoxes([]);
    setActiveTextBoxId(null);
    interactionRef.current = null;
  }, []);

  const cleanupEmptyTextBoxes = useCallback(() => {
    setTextBoxes((currentBoxes) =>
      currentBoxes.filter((box) => box.text.trim().length > 0)
    );
  }, []);

  const handleToolModeChange = useCallback(
    (nextMode: ToolMode) => {
      if (nextMode === "brush") {
        cleanupEmptyTextBoxes();
        setActiveTextBoxId(null);
      }

      setToolMode(nextMode);
    },
    [cleanupEmptyTextBoxes]
  );

  const activateTextBox = useCallback((boxId: string) => {
    setToolMode("text");
    setActiveTextBoxId(boxId);

    window.setTimeout(() => {
      textAreaRefs.current[boxId]?.focus();
    }, 0);
  }, []);

  const handleCanvasMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (toolMode !== "text") {
        return;
      }

      const canvasElement = canvasElementRef.current;

      if (!canvasElement || event.target !== canvasElement) {
        return;
      }

      const bounds = canvasElement.getBoundingClientRect();
      const clickX = event.clientX - bounds.left;
      const clickY = event.clientY - bounds.top;

      const width = clamp(
        DEFAULT_TEXT_BOX_WIDTH,
        TEXT_BOX_MIN_WIDTH,
        Math.max(TEXT_BOX_MIN_WIDTH, canvasSize.width)
      );
      const height = clamp(
        DEFAULT_TEXT_BOX_HEIGHT,
        TEXT_BOX_MIN_HEIGHT,
        Math.max(TEXT_BOX_MIN_HEIGHT, canvasSize.height)
      );
      const maxX = Math.max(0, canvasSize.width - width);
      const maxY = Math.max(0, canvasSize.height - height);
      const id = createTextBoxId();

      setTextBoxes((currentBoxes) => [
        ...currentBoxes,
        {
          id,
          x: clamp(clickX - width / 2, 0, maxX),
          y: clamp(clickY - height / 2, 0, maxY),
          width,
          height,
          text: "",
          color: brushColor,
        },
      ]);
      setActiveTextBoxId(id);
      window.setTimeout(() => {
        textAreaRefs.current[id]?.focus();
      }, 0);
    },
    [brushColor, canvasSize.height, canvasSize.width, toolMode]
  );

  const startDrag = useCallback(
    (event: ReactMouseEvent, boxId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      interactionRef.current = {
        mode: "drag",
        id: box.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: box.x,
        startY: box.y,
        startWidth: box.width,
        startHeight: box.height,
      };
    },
    [textBoxes]
  );

  const startResize = useCallback(
    (event: ReactMouseEvent, boxId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      interactionRef.current = {
        mode: "resize",
        id: box.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: box.x,
        startY: box.y,
        startWidth: box.width,
        startHeight: box.height,
      };
    },
    [textBoxes]
  );

  useImperativeHandle(
    ref,
    () => ({
      exportImageBlob: async () => {
        const canvasElement = canvasElementRef.current;

        if (!canvasElement) {
          throw new Error("Canvas is not ready yet.");
        }

        const context = canvasElement.getContext("2d");

        if (!context) {
          throw new Error("Canvas context is not available.");
        }

        const snapshot = context.getImageData(
          0,
          0,
          canvasElement.width,
          canvasElement.height
        );

        for (const textBox of textBoxes) {
          const textValue = textBox.text.trim();

          if (!textValue) {
            continue;
          }

          const fontSize = getTextFontSize(textBox.height);
          const lineHeight = Math.round(fontSize * 1.2);

          context.fillStyle = textBox.color;
          context.font = `${fontSize}px Nunito, sans-serif`;
          context.textBaseline = "top";

          drawWrappedText(
            context,
            textValue,
            textBox.x + TEXT_BOX_INNER_PADDING,
            textBox.y + TEXT_BOX_DRAG_BAR_HEIGHT,
            Math.max(10, textBox.width - TEXT_BOX_INNER_PADDING * 2),
            Math.max(
              10,
              textBox.height - TEXT_BOX_DRAG_BAR_HEIGHT - TEXT_BOX_INNER_PADDING
            ),
            lineHeight
          );
        }

        return new Promise<Blob>((resolve, reject) => {
          canvasElement.toBlob((blob) => {
            context.putImageData(snapshot, 0, 0);

            if (!blob) {
              reject(new Error("Could not export the canvas."));
              return;
            }

            resolve(blob);
          }, "image/png");
        });
      },
      clear: clearCanvas,
    }),
    [clearCanvas, textBoxes]
  );

  return (
    <div className="space-y-4">
      <div className="border border-slate-200 bg-slate-50/80 p-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center border border-slate-300 bg-white">
            <button
              className={`border-r border-slate-300 px-3 py-2 text-sm font-semibold transition ${
                toolMode === "brush"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => handleToolModeChange("brush")}
              type="button"
            >
              Brush
            </button>
            <button
              className={`px-3 py-2 text-sm font-semibold transition ${
                toolMode === "text"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => handleToolModeChange("text")}
              type="button"
            >
              Text
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Color
            <input
              aria-label="Brush color"
              className="h-9 w-11 cursor-pointer border border-slate-300 bg-white"
              onChange={(event) => setBrushColor(event.target.value)}
              type="color"
              value={brushColor}
            />
          </label>

          <label className="flex min-w-[210px] flex-1 items-center gap-2 text-sm font-medium text-slate-700">
            Brush size
            <input
              aria-label="Brush size"
              className="w-full accent-slate-700"
              max={20}
              min={1}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              type="range"
              value={brushSize}
            />
            <span className="min-w-10 text-right text-xs font-semibold text-slate-500">
              {brushSize}px
            </span>
          </label>

          <button
            className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            onClick={clearCanvas}
            type="button"
          >
            Clear
          </button>
        </div>

        <p className="mt-2 text-xs font-medium text-slate-500">
          {toolMode === "text"
            ? "Text mode: tap to place text, click text to edit, drag text to move, and drag near the lower-right text area to resize."
            : "Brush mode: draw freely on the canvas."}
        </p>
      </div>

      <div className="overflow-hidden border border-slate-300 bg-white p-2 shadow-inner">
        <div
          className="relative mx-auto w-full max-w-[1040px]"
          onMouseDown={handleCanvasMouseDown}
          ref={canvasHostRef}
        >
          <div ref={canvasMountRef} />

          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
            }}
          >
            {textBoxes.map((textBox) => {
              const fontSize = getTextFontSize(textBox.height);
              const isEditing = toolMode === "text" && activeTextBoxId === textBox.id;

              if (!isEditing) {
                if (!textBox.text.trim()) {
                  return null;
                }

                return (
                  <div
                    className="pointer-events-none absolute"
                    data-testid="canvas-text-item"
                    key={textBox.id}
                    style={{
                      left: `${textBox.x}px`,
                      top: `${textBox.y + TEXT_BOX_DRAG_BAR_HEIGHT}px`,
                      width: `${textBox.width}px`,
                      height: `${Math.max(
                        24,
                        textBox.height - TEXT_BOX_DRAG_BAR_HEIGHT
                      )}px`,
                    }}
                  >
                    <button
                      aria-label="Edit placed text"
                      className="pointer-events-auto h-full w-full cursor-text bg-transparent p-0 text-left"
                      data-testid="canvas-text-placed"
                      onClick={() => activateTextBox(textBox.id)}
                      onMouseDown={(event) => startDrag(event, textBox.id)}
                      type="button"
                    >
                      <span
                        className="block whitespace-pre-wrap break-words px-2 py-1"
                        style={{
                          color: textBox.color,
                          fontSize: `${fontSize}px`,
                          lineHeight: "1.2",
                        }}
                      >
                        {textBox.text}
                      </span>
                    </button>
                    {toolMode === "text" ? (
                      <button
                        aria-label="Resize text"
                        className="pointer-events-auto absolute bottom-0 right-0 h-4 w-4 cursor-se-resize opacity-0"
                        data-testid="canvas-text-resize"
                        onMouseDown={(event) => startResize(event, textBox.id)}
                        type="button"
                      />
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  className="pointer-events-none absolute"
                  data-testid="canvas-text-item"
                  key={textBox.id}
                  style={{
                    left: `${textBox.x}px`,
                    top: `${textBox.y + TEXT_BOX_DRAG_BAR_HEIGHT}px`,
                    width: `${textBox.width}px`,
                    height: `${Math.max(
                      24,
                      textBox.height - TEXT_BOX_DRAG_BAR_HEIGHT
                    )}px`,
                  }}
                >
                  <textarea
                    aria-label="Canvas text"
                    className="pointer-events-auto h-full w-full resize-none border-0 bg-transparent px-2 py-1 text-slate-900 outline-none"
                    data-testid="canvas-text-editor"
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setTextBoxes((currentBoxes) =>
                        currentBoxes.map((currentBox) =>
                          currentBox.id === textBox.id
                            ? { ...currentBox, text: nextValue }
                            : currentBox
                        )
                      );
                    }}
                    onBlur={() => {
                      setTextBoxes((currentBoxes) => {
                        const currentBox = currentBoxes.find(
                          (box) => box.id === textBox.id
                        );

                        if (!currentBox) {
                          return currentBoxes;
                        }

                        if (!currentBox.text.trim()) {
                          return currentBoxes.filter((box) => box.id !== textBox.id);
                        }

                        return currentBoxes;
                      });
                      setActiveTextBoxId((currentActiveId) =>
                        currentActiveId === textBox.id ? null : currentActiveId
                      );
                    }}
                    ref={(element) => {
                      textAreaRefs.current[textBox.id] = element;
                    }}
                    style={{
                      color: textBox.color,
                      fontSize: `${fontSize}px`,
                      lineHeight: "1.2",
                    }}
                    value={textBox.text}
                  />

                  <button
                    aria-label="Resize text"
                    className="pointer-events-auto absolute bottom-0 right-0 h-4 w-4 cursor-se-resize opacity-0"
                    data-testid="canvas-text-resize"
                    onMouseDown={(event) => startResize(event, textBox.id)}
                    type="button"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default DrawingBoard;
