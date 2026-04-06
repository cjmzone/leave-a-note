"use client";

import type p5 from "p5";
import {
  type ChangeEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

export type DrawingBoardHandle = {
  exportImageBlob: () => Promise<Blob>;
  clear: () => void;
};

type ToolMode = "brush" | "text";
type CanvasFontKey = "nunito" | "merriweather" | "space-mono" | "caveat";

type CanvasTextBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontKey: CanvasFontKey;
  rotationDeg: number;
  scale: number;
};

type CanvasImageItem = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  scale: number;
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

type ImageInteractionState = {
  mode: "drag" | "resize";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

type TouchTransformState = {
  id: string;
  startDistance: number;
  startAngle: number;
  startRotationDeg: number;
  startScale: number;
  targetRotationDeg: number;
  targetScale: number;
};

type TouchDragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
};

type TextTouchInteractionMode = "idle" | "dragging" | "transforming";

type ImageTouchTransformState = {
  startDistance: number;
  startAngle: number;
  startRotationDeg: number;
  startScale: number;
  startWidth: number;
  startHeight: number;
  targetRotationDeg: number;
  targetScale: number;
};

type ImageTouchDragState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
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
const IMAGE_MIN_WIDTH = 64;
const IMAGE_MIN_HEIGHT = 64;
const TEXT_SCALE_MIN = 0.5;
const TEXT_SCALE_MAX = 4;
const TOUCH_DRAG_THRESHOLD_PX = 4;
const DEFAULT_TEXT_FONT_KEY: CanvasFontKey = "nunito";

const CANVAS_TEXT_FONT_FAMILIES: Record<CanvasFontKey, string> = {
  nunito: "\"Nunito\", \"Helvetica Neue\", Arial, sans-serif",
  merriweather: "\"Merriweather\", Georgia, serif",
  "space-mono": "\"Space Mono\", \"Courier New\", monospace",
  caveat: "\"Caveat\", \"Brush Script MT\", cursive",
};

const CANVAS_TEXT_FONT_OPTIONS: Array<{ key: CanvasFontKey; label: string }> = [
  { key: "nunito", label: "Rounded" },
  { key: "merriweather", label: "Serif" },
  { key: "space-mono", label: "Mono" },
  { key: "caveat", label: "Handwritten" },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read image file."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

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

function getCanvasTextFontFamily(fontKey: CanvasFontKey): string {
  return CANVAS_TEXT_FONT_FAMILIES[fontKey] ?? CANVAS_TEXT_FONT_FAMILIES.nunito;
}

function getTouchMetrics(
  firstTouch: { clientX: number; clientY: number },
  secondTouch: { clientX: number; clientY: number }
): {
  distance: number;
  angle: number;
} {
  const deltaX = secondTouch.clientX - firstTouch.clientX;
  const deltaY = secondTouch.clientY - firstTouch.clientY;

  return {
    distance: Math.hypot(deltaX, deltaY),
    angle: Math.atan2(deltaY, deltaX),
  };
}

function normalizeAngleDeltaRadians(rawDelta: number): number {
  if (rawDelta > Math.PI) {
    return rawDelta - Math.PI * 2;
  }

  if (rawDelta < -Math.PI) {
    return rawDelta + Math.PI * 2;
  }

  return rawDelta;
}

function normalizeAngleDeltaDegrees(rawDelta: number): number {
  if (rawDelta > 180) {
    return rawDelta - 360;
  }

  if (rawDelta < -180) {
    return rawDelta + 360;
  }

  return rawDelta;
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
  const [selectedTextFontKey, setSelectedTextFontKey] =
    useState<CanvasFontKey>(DEFAULT_TEXT_FONT_KEY);
  const [insertedImage, setInsertedImage] = useState<CanvasImageItem | null>(null);
  const [isImageSelected, setIsImageSelected] = useState(false);

  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const toolModeRef = useRef<ToolMode>(toolMode);
  const interactionRef = useRef<InteractionState | null>(null);
  const imageInteractionRef = useRef<ImageInteractionState | null>(null);
  const touchTransformRef = useRef<TouchTransformState | null>(null);
  const touchDragRef = useRef<TouchDragState | null>(null);
  const imageTouchTransformRef = useRef<ImageTouchTransformState | null>(null);
  const imageTouchDragRef = useRef<ImageTouchDragState | null>(null);
  const suppressTextClickIdRef = useRef<string | null>(null);
  const suppressTextClickTimeoutRef = useRef<number | null>(null);
  const activeTextTouchElementRef = useRef<HTMLElement | null>(null);
  const activeImageTouchElementRef = useRef<HTMLElement | null>(null);
  const textTouchInteractionModeRef = useRef<TextTouchInteractionMode>("idle");
  const imageTouchInteractionModeRef = useRef<TextTouchInteractionMode>("idle");
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const brushSizeInputRef = useRef<HTMLInputElement | null>(null);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const insertedImageElementRef = useRef<HTMLImageElement | null>(null);
  const activeBrushPointerIdRef = useRef<number | null>(null);
  const brushTouchDrawingRef = useRef(false);

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
    return () => {
      if (suppressTextClickTimeoutRef.current) {
        window.clearTimeout(suppressTextClickTimeoutRef.current);
        suppressTextClickTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let resetTimeout: number | null = null;

    const clearTouchOwnership = () => {
      touchTransformRef.current = null;
      touchDragRef.current = null;
      textTouchInteractionModeRef.current = "idle";
      imageTouchTransformRef.current = null;
      imageTouchDragRef.current = null;
      imageTouchInteractionModeRef.current = "idle";
      if (activeTextTouchElementRef.current) {
        activeTextTouchElementRef.current.style.touchAction = "manipulation";
        activeTextTouchElementRef.current = null;
      }
      if (activeImageTouchElementRef.current) {
        activeImageTouchElementRef.current.style.touchAction = "manipulation";
        activeImageTouchElementRef.current = null;
      }
    };

    const preventNativeTouchDuringOwnership = (event: Event) => {
      const hasTextOwnership = textTouchInteractionModeRef.current !== "idle";
      const hasImageOwnership = imageTouchInteractionModeRef.current !== "idle";
      const hasBrushOwnership =
        brushTouchDrawingRef.current && toolModeRef.current === "brush";

      if (!hasTextOwnership && !hasImageOwnership && !hasBrushOwnership) {
        return;
      }

      if ("cancelable" in event && event.cancelable) {
        event.preventDefault();
      }
    };

    const startBrushTouchOwnership = (event: TouchEvent) => {
      if (toolModeRef.current !== "brush" || event.touches.length !== 1) {
        brushTouchDrawingRef.current = false;
        return;
      }

      const canvasElement = canvasElementRef.current;
      const target = event.target;

      if (!canvasElement || !(target instanceof Node) || !canvasElement.contains(target)) {
        brushTouchDrawingRef.current = false;
        return;
      }

      const touch = event.touches[0];
      const canvasBounds = canvasElement.getBoundingClientRect();
      const insideCanvas =
        touch.clientX >= canvasBounds.left &&
        touch.clientX <= canvasBounds.right &&
        touch.clientY >= canvasBounds.top &&
        touch.clientY <= canvasBounds.bottom;

      brushTouchDrawingRef.current = insideCanvas;
    };

    const resetTouchOwnershipIfEnded = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        return;
      }

      brushTouchDrawingRef.current = false;

      if (resetTimeout) {
        window.clearTimeout(resetTimeout);
      }

      // Let element-level touchend/touchcancel handlers run first.
      resetTimeout = window.setTimeout(() => {
        resetTimeout = null;
        if (
          textTouchInteractionModeRef.current !== "idle" ||
          imageTouchInteractionModeRef.current !== "idle"
        ) {
          clearTouchOwnership();
        }
      }, 0);
    };

    const touchBlockOptions: AddEventListenerOptions = {
      capture: true,
      passive: false,
    };
    const touchResetOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    document.addEventListener(
      "touchstart",
      startBrushTouchOwnership,
      touchResetOptions
    );
    document.addEventListener(
      "touchmove",
      preventNativeTouchDuringOwnership,
      touchBlockOptions
    );
    document.addEventListener(
      "gesturestart",
      preventNativeTouchDuringOwnership,
      touchBlockOptions
    );
    document.addEventListener(
      "gesturechange",
      preventNativeTouchDuringOwnership,
      touchBlockOptions
    );
    window.addEventListener("touchend", resetTouchOwnershipIfEnded, touchResetOptions);
    window.addEventListener(
      "touchcancel",
      resetTouchOwnershipIfEnded,
      touchResetOptions
    );

    return () => {
      if (resetTimeout) {
        window.clearTimeout(resetTimeout);
      }
      document.removeEventListener(
        "touchstart",
        startBrushTouchOwnership,
        touchResetOptions
      );
      document.removeEventListener(
        "touchmove",
        preventNativeTouchDuringOwnership,
        touchBlockOptions
      );
      document.removeEventListener(
        "gesturestart",
        preventNativeTouchDuringOwnership,
        touchBlockOptions
      );
      document.removeEventListener(
        "gesturechange",
        preventNativeTouchDuringOwnership,
        touchBlockOptions
      );
      window.removeEventListener(
        "touchend",
        resetTouchOwnershipIfEnded,
        touchResetOptions
      );
      window.removeEventListener(
        "touchcancel",
        resetTouchOwnershipIfEnded,
        touchResetOptions
      );
    };
  }, []);

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
          // Keep browser-native scrolling behavior unless text gesture ownership is active.
          return undefined;
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
      if (interaction) {
        const deltaX = event.clientX - interaction.startClientX;
        const deltaY = event.clientY - interaction.startClientY;

        setTextBoxes((currentBoxes) =>
          currentBoxes.map((box) => {
            if (box.id !== interaction.id) {
              return box;
            }

            if (interaction.mode === "drag") {
              return {
                ...box,
                x: interaction.startX + deltaX,
                y: interaction.startY + deltaY,
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
              width: clamp(
                interaction.startWidth + deltaX,
                TEXT_BOX_MIN_WIDTH,
                widthLimit
              ),
              height: clamp(
                interaction.startHeight + deltaY,
                TEXT_BOX_MIN_HEIGHT,
                heightLimit
              ),
            };
          })
        );
        return;
      }

      const imageInteraction = imageInteractionRef.current;

      if (!imageInteraction) {
        return;
      }

      const imageDeltaX = event.clientX - imageInteraction.startClientX;
      const imageDeltaY = event.clientY - imageInteraction.startClientY;

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        if (imageInteraction.mode === "drag") {
          const maxX = Math.max(0, canvasSize.width - currentImage.width);
          const maxY = Math.max(0, canvasSize.height - currentImage.height);

          return {
            ...currentImage,
            x: clamp(imageInteraction.startX + imageDeltaX, 0, maxX),
            y: clamp(imageInteraction.startY + imageDeltaY, 0, maxY),
          };
        }

        const safeStartWidth = Math.max(1, imageInteraction.startWidth);
        const safeStartHeight = Math.max(1, imageInteraction.startHeight);
        const scaleByX = (imageInteraction.startWidth + imageDeltaX) / safeStartWidth;
        const scaleByY = (imageInteraction.startHeight + imageDeltaY) / safeStartHeight;
        const rawScale =
          Math.abs(scaleByY - 1) > Math.abs(scaleByX - 1) ? scaleByY : scaleByX;
        const minScale = Math.max(
          IMAGE_MIN_WIDTH / safeStartWidth,
          IMAGE_MIN_HEIGHT / safeStartHeight
        );
        const maxScaleByWidth = (canvasSize.width - imageInteraction.startX) / safeStartWidth;
        const maxScaleByHeight =
          (canvasSize.height - imageInteraction.startY) / safeStartHeight;
        const maxScale = Math.max(minScale, Math.min(maxScaleByWidth, maxScaleByHeight));
        const scale = clamp(rawScale, minScale, maxScale);
        const nextWidth = Math.round(safeStartWidth * scale);
        const nextHeight = Math.round(safeStartHeight * scale);
        const widthScaleRatio = nextWidth / Math.max(1, safeStartWidth);

        return {
          ...currentImage,
          width: nextWidth,
          height: nextHeight,
          scale: currentImage.scale * widthScaleRatio,
        };
      });
    };

    const handleWindowMouseUp = () => {
      interactionRef.current = null;
      imageInteractionRef.current = null;
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [canvasSize.height, canvasSize.width]);

  const clearCanvas = useCallback(() => {
    p5Ref.current?.clear();
    setTextBoxes([]);
    setActiveTextBoxId(null);
    setInsertedImage(null);
    setIsImageSelected(false);
    interactionRef.current = null;
    imageInteractionRef.current = null;
    touchTransformRef.current = null;
    touchDragRef.current = null;
    imageTouchTransformRef.current = null;
    imageTouchDragRef.current = null;
    brushTouchDrawingRef.current = false;
    suppressTextClickIdRef.current = null;
    textTouchInteractionModeRef.current = "idle";
    imageTouchInteractionModeRef.current = "idle";
    if (suppressTextClickTimeoutRef.current) {
      window.clearTimeout(suppressTextClickTimeoutRef.current);
      suppressTextClickTimeoutRef.current = null;
    }
    if (activeTextTouchElementRef.current) {
      activeTextTouchElementRef.current.style.touchAction = "manipulation";
      activeTextTouchElementRef.current = null;
    }
    if (activeImageTouchElementRef.current) {
      activeImageTouchElementRef.current.style.touchAction = "manipulation";
      activeImageTouchElementRef.current = null;
    }
  }, []);

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }

      const src = await readFileAsDataUrl(file);
      const loadedImage = await loadImageElement(src);
      const imageWidth = Math.max(1, loadedImage.naturalWidth || 1);
      const imageHeight = Math.max(1, loadedImage.naturalHeight || 1);
      const maxWidth = Math.max(IMAGE_MIN_WIDTH, canvasSize.width * 0.8);
      const maxHeight = Math.max(IMAGE_MIN_HEIGHT, canvasSize.height * 0.8);
      const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight, 1);
      const width = clamp(Math.round(imageWidth * scale), IMAGE_MIN_WIDTH, canvasSize.width);
      const height = clamp(
        Math.round(imageHeight * scale),
        IMAGE_MIN_HEIGHT,
        canvasSize.height
      );

      setInsertedImage({
        src,
        x: Math.round((canvasSize.width - width) / 2),
        y: Math.round((canvasSize.height - height) / 2),
        width,
        height,
        rotationDeg: 0,
        scale: 1,
      });
      setIsImageSelected(true);
    },
    [canvasSize.height, canvasSize.width]
  );

  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;

      if (!items) {
        return;
      }

      const imageItem = Array.from(items).find((item) =>
        item.type.startsWith("image/")
      );

      if (!imageItem) {
        return;
      }

      const file = imageItem.getAsFile();

      if (!file) {
        return;
      }

      event.preventDefault();
      void insertImageFile(file);
    };

    window.addEventListener("paste", handleWindowPaste);

    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [insertImageFile]);

  const applyBrushSize = useCallback((nextSize: number) => {
    brushSizeRef.current = nextSize;
    setBrushSize(nextSize);
  }, []);

  const setBrushSizeFromPointer = useCallback(
    (clientX: number) => {
      if (!Number.isFinite(clientX)) {
        return;
      }

      const input = brushSizeInputRef.current;

      if (!input) {
        return;
      }

      const rect = input.getBoundingClientRect();

      if (rect.width <= 0) {
        return;
      }

      const parsedMin = Number(input.min || "1");
      const parsedMax = Number(input.max || "20");
      const parsedStep = Number(input.step || "1");
      const min = Number.isFinite(parsedMin) ? parsedMin : 1;
      const max = Number.isFinite(parsedMax) ? parsedMax : 20;
      const step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawValue = min + (max - min) * ratio;
      const steppedValue = Math.round((rawValue - min) / step) * step + min;

      applyBrushSize(clamp(steppedValue, min, max));
    },
    [applyBrushSize]
  );

  const handleBrushPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      activeBrushPointerIdRef.current = event.pointerId;

      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      setBrushSizeFromPointer(event.clientX);
    },
    [setBrushSizeFromPointer]
  );

  const handleBrushPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      if (activeBrushPointerIdRef.current !== event.pointerId) {
        return;
      }

      setBrushSizeFromPointer(event.clientX);
    },
    [setBrushSizeFromPointer]
  );

  const handleBrushPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      if (activeBrushPointerIdRef.current !== event.pointerId) {
        return;
      }

      activeBrushPointerIdRef.current = null;
    },
    []
  );

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
        setIsImageSelected(false);
        touchTransformRef.current = null;
        touchDragRef.current = null;
        imageTouchTransformRef.current = null;
        imageTouchDragRef.current = null;
        suppressTextClickIdRef.current = null;
        textTouchInteractionModeRef.current = "idle";
        imageTouchInteractionModeRef.current = "idle";
        if (suppressTextClickTimeoutRef.current) {
          window.clearTimeout(suppressTextClickTimeoutRef.current);
          suppressTextClickTimeoutRef.current = null;
        }
        if (activeTextTouchElementRef.current) {
          activeTextTouchElementRef.current.style.touchAction = "manipulation";
          activeTextTouchElementRef.current = null;
        }
        if (activeImageTouchElementRef.current) {
          activeImageTouchElementRef.current.style.touchAction = "manipulation";
          activeImageTouchElementRef.current = null;
        }
      }

      if (nextMode !== "brush") {
        brushTouchDrawingRef.current = false;
      }

      setToolMode(nextMode);
    },
    [cleanupEmptyTextBoxes]
  );

  const activateTextBox = useCallback(
    (boxId: string) => {
      const targetBox = textBoxes.find((box) => box.id === boxId);

      if (targetBox) {
        setSelectedTextFontKey(targetBox.fontKey);
      }

      setToolMode("text");
      setActiveTextBoxId(boxId);

      window.setTimeout(() => {
        textAreaRefs.current[boxId]?.focus();
      }, 0);
    },
    [textBoxes]
  );

  const handlePlacedTextClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, boxId: string) => {
      if (suppressTextClickIdRef.current === boxId) {
        suppressTextClickIdRef.current = null;
        event.preventDefault();
        return;
      }

      activateTextBox(boxId);
    },
    [activateTextBox]
  );

  const suppressNextTextClick = useCallback((boxId: string) => {
    suppressTextClickIdRef.current = boxId;
    if (suppressTextClickTimeoutRef.current) {
      window.clearTimeout(suppressTextClickTimeoutRef.current);
    }
    suppressTextClickTimeoutRef.current = window.setTimeout(() => {
      suppressTextClickIdRef.current = null;
      suppressTextClickTimeoutRef.current = null;
    }, 400);
  }, []);

  const handleTextFontChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextFontKey = event.currentTarget.value as CanvasFontKey;
      setSelectedTextFontKey(nextFontKey);

      if (!activeTextBoxId) {
        return;
      }

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((currentBox) =>
          currentBox.id === activeTextBoxId
            ? { ...currentBox, fontKey: nextFontKey }
            : currentBox
        )
      );
    },
    [activeTextBoxId]
  );

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
      const id = createTextBoxId();

      setTextBoxes((currentBoxes) => [
        ...currentBoxes,
        {
          id,
          x: clickX,
          y: clickY,
          width,
          height,
          text: "",
          color: brushColor,
          fontKey: selectedTextFontKey,
          rotationDeg: 0,
          scale: 1,
        },
      ]);
      setActiveTextBoxId(id);
      window.setTimeout(() => {
        textAreaRefs.current[id]?.focus();
      }, 0);
    },
    [brushColor, canvasSize.height, canvasSize.width, selectedTextFontKey, toolMode]
  );

  const handleCanvasMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!insertedImage) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-canvas-image-root='true']")) {
        return;
      }

      setIsImageSelected(false);
    },
    [insertedImage]
  );

  const handleCanvasTouchStartCapture = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!insertedImage) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest("[data-canvas-image-root='true']")) {
        return;
      }

      setIsImageSelected(false);
    },
    [insertedImage]
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

  const startTouchTransform = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (toolMode !== "text" || event.touches.length !== 2) {
        return;
      }

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      const touchPoints = Array.from(event.touches)
        .map((touch) => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }))
        .sort((left, right) => left.identifier - right.identifier);
      const touchA = touchPoints[0];
      const touchB = touchPoints[1];

      if (!touchA || !touchB) {
        return;
      }

      const { distance, angle } = getTouchMetrics(touchA, touchB);

      if (distance <= 0) {
        return;
      }

      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";
      touchDragRef.current = null;
      textTouchInteractionModeRef.current = "transforming";

      touchTransformRef.current = {
        id: boxId,
        startDistance: distance,
        startAngle: angle,
        startRotationDeg: box.rotationDeg,
        startScale: box.scale,
        targetRotationDeg: box.rotationDeg,
        targetScale: box.scale,
      };

      event.preventDefault();
      event.stopPropagation();
    },
    [textBoxes, toolMode]
  );

  const moveTouchTransform = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      const interaction = touchTransformRef.current;

      if (
        textTouchInteractionModeRef.current !== "transforming" ||
        !interaction ||
        interaction.id !== boxId ||
        event.touches.length !== 2
      ) {
        return;
      }

      const touchPoints = Array.from(event.touches)
        .map((touch) => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }))
        .sort((left, right) => left.identifier - right.identifier);
      const touchA = touchPoints[0];
      const touchB = touchPoints[1];

      if (!touchA || !touchB) {
        return;
      }

      const { distance, angle } = getTouchMetrics(touchA, touchB);
      const scaleRatio = distance / Math.max(1, interaction.startDistance);
      const rotationDeltaRad = normalizeAngleDeltaRadians(angle - interaction.startAngle);
      const rotationDeltaDeg = (rotationDeltaRad * 180) / Math.PI;
      const targetScale = clamp(
        interaction.startScale * scaleRatio,
        TEXT_SCALE_MIN,
        TEXT_SCALE_MAX
      );
      const targetRotationDeg = interaction.startRotationDeg + rotationDeltaDeg;

      interaction.targetScale = targetScale;
      interaction.targetRotationDeg = targetRotationDeg;

      setTextBoxes((currentBoxes) =>
        currentBoxes.map((currentBox) =>
          currentBox.id === boxId
            ? {
                ...currentBox,
                scale: currentBox.scale + (targetScale - currentBox.scale) * 0.45,
                rotationDeg:
                  currentBox.rotationDeg +
                  normalizeAngleDeltaDegrees(targetRotationDeg - currentBox.rotationDeg) *
                    0.45,
              }
            : currentBox
        )
      );

      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const endTouchTransform = useCallback((event: ReactTouchEvent, boxId: string) => {
    const interaction = touchTransformRef.current;

    if (!interaction || interaction.id !== boxId) {
      return;
    }

    if (event.touches.length < 2) {
      setTextBoxes((currentBoxes) =>
        currentBoxes.map((currentBox) =>
          currentBox.id === boxId
            ? {
                ...currentBox,
                scale: interaction.targetScale,
                rotationDeg: interaction.targetRotationDeg,
              }
            : currentBox
        )
      );
      touchTransformRef.current = null;
      textTouchInteractionModeRef.current = "idle";
      if (activeTextTouchElementRef.current) {
        activeTextTouchElementRef.current.style.touchAction = "manipulation";
        activeTextTouchElementRef.current = null;
      }
    }
  }, []);

  const startTouchDrag = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (toolMode !== "text" || event.touches.length !== 1) {
        return;
      }

      const box = textBoxes.find((item) => item.id === boxId);

      if (!box) {
        return;
      }

      const touch = event.touches[0];
      touchDragRef.current = {
        id: boxId,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startX: box.x,
        startY: box.y,
        hasMoved: false,
      };
      touchTransformRef.current = null;
      textTouchInteractionModeRef.current = "dragging";
      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";

      event.preventDefault();
      event.stopPropagation();
    },
    [textBoxes, toolMode]
  );

  const moveTouchDrag = useCallback((event: ReactTouchEvent, boxId: string) => {
    const dragInteraction = touchDragRef.current;

    if (
      textTouchInteractionModeRef.current !== "dragging" ||
      !dragInteraction ||
      dragInteraction.id !== boxId ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - dragInteraction.startClientX;
    const deltaY = touch.clientY - dragInteraction.startClientY;

    if (!dragInteraction.hasMoved) {
      if (Math.hypot(deltaX, deltaY) < TOUCH_DRAG_THRESHOLD_PX) {
        return;
      }

      dragInteraction.hasMoved = true;
      activeTextTouchElementRef.current = event.currentTarget as HTMLElement;
      activeTextTouchElementRef.current.style.touchAction = "none";
    }

    setTextBoxes((currentBoxes) =>
      currentBoxes.map((currentBox) =>
        currentBox.id === boxId
          ? {
              ...currentBox,
              x: dragInteraction.startX + deltaX,
              y: dragInteraction.startY + deltaY,
            }
          : currentBox
      )
    );

    event.preventDefault();
    event.stopPropagation();
  }, []);

  const endTouchDrag = useCallback((event: ReactTouchEvent, boxId: string) => {
    const dragInteraction = touchDragRef.current;

    if (!dragInteraction || dragInteraction.id !== boxId) {
      return;
    }

    if (dragInteraction.hasMoved) {
      suppressNextTextClick(boxId);
      event.preventDefault();
      event.stopPropagation();
    } else if (event.touches.length === 0) {
      suppressNextTextClick(boxId);
      activateTextBox(boxId);
      event.preventDefault();
      event.stopPropagation();
    }

    touchDragRef.current = null;
    textTouchInteractionModeRef.current = "idle";
    if (activeTextTouchElementRef.current) {
      activeTextTouchElementRef.current.style.touchAction = "manipulation";
      activeTextTouchElementRef.current = null;
    }
  }, [activateTextBox, suppressNextTextClick]);

  const handlePlacedTextTouchStart = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (event.touches.length === 2) {
        startTouchTransform(event, boxId);
        return;
      }

      startTouchDrag(event, boxId);
    },
    [startTouchDrag, startTouchTransform]
  );

  const handlePlacedTextTouchMove = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      if (
        event.touches.length === 2 &&
        textTouchInteractionModeRef.current !== "transforming"
      ) {
        startTouchTransform(event, boxId);
        return;
      }

      if (textTouchInteractionModeRef.current === "transforming") {
        moveTouchTransform(event, boxId);
        return;
      }

      if (textTouchInteractionModeRef.current === "dragging") {
        moveTouchDrag(event, boxId);
        return;
      }

      if (event.touches.length === 2) {
        startTouchTransform(event, boxId);
      }
    },
    [moveTouchDrag, moveTouchTransform, startTouchTransform]
  );

  const handlePlacedTextTouchEnd = useCallback(
    (event: ReactTouchEvent, boxId: string) => {
      endTouchTransform(event, boxId);
      endTouchDrag(event, boxId);
    },
    [endTouchDrag, endTouchTransform]
  );

  const releaseImageTouchOwnership = useCallback(() => {
    imageTouchTransformRef.current = null;
    imageTouchDragRef.current = null;
    imageTouchInteractionModeRef.current = "idle";
    if (activeImageTouchElementRef.current) {
      activeImageTouchElementRef.current.style.touchAction = "manipulation";
      activeImageTouchElementRef.current = null;
    }
  }, []);

  const startImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      if (toolMode !== "text" || !insertedImage || event.touches.length !== 2) {
        return;
      }

      const touchPoints = Array.from(event.touches)
        .map((touch) => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }))
        .sort((left, right) => left.identifier - right.identifier);
      const touchA = touchPoints[0];
      const touchB = touchPoints[1];

      if (!touchA || !touchB) {
        return;
      }

      const { distance, angle } = getTouchMetrics(touchA, touchB);

      if (distance <= 0) {
        return;
      }

      setIsImageSelected(true);
      imageTouchDragRef.current = null;
      imageTouchInteractionModeRef.current = "transforming";
      activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
      activeImageTouchElementRef.current.style.touchAction = "none";
      imageTouchTransformRef.current = {
        startDistance: distance,
        startAngle: angle,
        startRotationDeg: insertedImage.rotationDeg,
        startScale: insertedImage.scale,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
        targetRotationDeg: insertedImage.rotationDeg,
        targetScale: insertedImage.scale,
      };

      event.preventDefault();
      event.stopPropagation();
    },
    [insertedImage, toolMode]
  );

  const moveImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      const interaction = imageTouchTransformRef.current;

      if (
        imageTouchInteractionModeRef.current !== "transforming" ||
        !interaction ||
        event.touches.length !== 2
      ) {
        return;
      }

      const touchPoints = Array.from(event.touches)
        .map((touch) => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        }))
        .sort((left, right) => left.identifier - right.identifier);
      const touchA = touchPoints[0];
      const touchB = touchPoints[1];

      if (!touchA || !touchB) {
        return;
      }

      const { distance, angle } = getTouchMetrics(touchA, touchB);
      const scaleRatio = distance / Math.max(1, interaction.startDistance);
      const rotationDeltaRad = normalizeAngleDeltaRadians(angle - interaction.startAngle);
      const rotationDeltaDeg = (rotationDeltaRad * 180) / Math.PI;
      const targetScale = clamp(
        interaction.startScale * scaleRatio,
        TEXT_SCALE_MIN,
        TEXT_SCALE_MAX
      );
      const targetRotationDeg = interaction.startRotationDeg + rotationDeltaDeg;

      interaction.targetScale = targetScale;
      interaction.targetRotationDeg = targetRotationDeg;

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        const nextScale =
          currentImage.scale + (targetScale - currentImage.scale) * 0.45;
        const scaleRatioFromCurrent =
          nextScale / Math.max(0.001, currentImage.scale);

        return {
          ...currentImage,
          width: clamp(
            Math.round(currentImage.width * scaleRatioFromCurrent),
            IMAGE_MIN_WIDTH,
            canvasSize.width
          ),
          height: clamp(
            Math.round(currentImage.height * scaleRatioFromCurrent),
            IMAGE_MIN_HEIGHT,
            canvasSize.height
          ),
          scale: nextScale,
          rotationDeg:
            currentImage.rotationDeg +
            normalizeAngleDeltaDegrees(targetRotationDeg - currentImage.rotationDeg) *
              0.45,
        };
      });

      event.preventDefault();
      event.stopPropagation();
    },
    [canvasSize.height, canvasSize.width]
  );

  const endImageTouchTransform = useCallback(
    (event: ReactTouchEvent) => {
      const interaction = imageTouchTransformRef.current;

      if (!interaction) {
        return;
      }

      if (event.touches.length < 2) {
        const finalScaleRatio =
          interaction.targetScale / Math.max(0.001, interaction.startScale);
        setInsertedImage((currentImage) => {
          if (!currentImage) {
            return currentImage;
          }

          return {
            ...currentImage,
            width: clamp(
              Math.round(interaction.startWidth * finalScaleRatio),
              IMAGE_MIN_WIDTH,
              canvasSize.width
            ),
            height: clamp(
              Math.round(interaction.startHeight * finalScaleRatio),
              IMAGE_MIN_HEIGHT,
              canvasSize.height
            ),
            scale: interaction.targetScale,
            rotationDeg: interaction.targetRotationDeg,
          };
        });
        releaseImageTouchOwnership();
      }
    },
    [canvasSize.height, canvasSize.width, releaseImageTouchOwnership]
  );

  const startImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      if (toolMode !== "text" || !insertedImage || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      setIsImageSelected(true);
      imageTouchTransformRef.current = null;
      imageTouchDragRef.current = {
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        hasMoved: false,
      };
      imageTouchInteractionModeRef.current = "dragging";
      activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
      activeImageTouchElementRef.current.style.touchAction = "none";

      event.preventDefault();
      event.stopPropagation();
    },
    [insertedImage, toolMode]
  );

  const moveImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      const dragInteraction = imageTouchDragRef.current;

      if (
        imageTouchInteractionModeRef.current !== "dragging" ||
        !dragInteraction ||
        event.touches.length !== 1
      ) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - dragInteraction.startClientX;
      const deltaY = touch.clientY - dragInteraction.startClientY;

      if (!dragInteraction.hasMoved) {
        if (Math.hypot(deltaX, deltaY) < TOUCH_DRAG_THRESHOLD_PX) {
          return;
        }

        dragInteraction.hasMoved = true;
        activeImageTouchElementRef.current = event.currentTarget as HTMLElement;
        activeImageTouchElementRef.current.style.touchAction = "none";
      }

      setInsertedImage((currentImage) => {
        if (!currentImage) {
          return currentImage;
        }

        const maxX = Math.max(0, canvasSize.width - currentImage.width);
        const maxY = Math.max(0, canvasSize.height - currentImage.height);

        return {
          ...currentImage,
          x: clamp(dragInteraction.startX + deltaX, 0, maxX),
          y: clamp(dragInteraction.startY + deltaY, 0, maxY),
        };
      });

      event.preventDefault();
      event.stopPropagation();
    },
    [canvasSize.height, canvasSize.width]
  );

  const endImageTouchDrag = useCallback(
    (event: ReactTouchEvent) => {
      const dragInteraction = imageTouchDragRef.current;

      if (!dragInteraction) {
        return;
      }

      if (dragInteraction.hasMoved) {
        event.preventDefault();
        event.stopPropagation();
      }

      imageTouchDragRef.current = null;
      releaseImageTouchOwnership();
    },
    [releaseImageTouchOwnership]
  );

  const handleImageTouchStart = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches.length === 2) {
        startImageTouchTransform(event);
        return;
      }

      startImageTouchDrag(event);
    },
    [startImageTouchDrag, startImageTouchTransform]
  );

  const handleImageTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (
        event.touches.length === 2 &&
        imageTouchInteractionModeRef.current !== "transforming"
      ) {
        startImageTouchTransform(event);
        return;
      }

      if (imageTouchInteractionModeRef.current === "transforming") {
        moveImageTouchTransform(event);
        return;
      }

      if (imageTouchInteractionModeRef.current === "dragging") {
        moveImageTouchDrag(event);
      }
    },
    [moveImageTouchDrag, moveImageTouchTransform, startImageTouchTransform]
  );

  const handleImageTouchEnd = useCallback(
    (event: ReactTouchEvent) => {
      endImageTouchTransform(event);
      endImageTouchDrag(event);
    },
    [endImageTouchDrag, endImageTouchTransform]
  );

  const startImageDrag = useCallback(
    (event: ReactMouseEvent) => {
      if (!insertedImage || toolMode !== "text") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsImageSelected(true);

      imageInteractionRef.current = {
        mode: "drag",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
      };
    },
    [insertedImage, toolMode]
  );

  const startImageResize = useCallback(
    (event: ReactMouseEvent) => {
      if (!insertedImage || toolMode !== "text") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsImageSelected(true);

      imageInteractionRef.current = {
        mode: "resize",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: insertedImage.x,
        startY: insertedImage.y,
        startWidth: insertedImage.width,
        startHeight: insertedImage.height,
      };
    },
    [insertedImage, toolMode]
  );

  const handleUploadImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];

      if (file) {
        void insertImageFile(file);
      }

      event.currentTarget.value = "";
    },
    [insertImageFile]
  );

  useImperativeHandle(
    ref,
    () => ({
      exportImageBlob: async () => {
        const canvasElement = canvasElementRef.current;

        if (!canvasElement) {
          throw new Error("Canvas is not ready yet.");
        }

        const renderOverlayItems = async (
          context: CanvasRenderingContext2D
        ): Promise<void> => {
          if (insertedImage) {
            let imageElement = insertedImageElementRef.current;

            if (
              !imageElement ||
              imageElement.src !== insertedImage.src ||
              !imageElement.complete
            ) {
              imageElement = await loadImageElement(insertedImage.src);
            }

            context.save();
            context.translate(
              insertedImage.x + insertedImage.width / 2,
              insertedImage.y + insertedImage.height / 2
            );
            context.rotate((insertedImage.rotationDeg * Math.PI) / 180);
            context.drawImage(
              imageElement,
              -insertedImage.width / 2,
              -insertedImage.height / 2,
              insertedImage.width,
              insertedImage.height
            );
            context.restore();
          }

          for (const textBox of textBoxes) {
            const textValue = textBox.text.trim();

            if (!textValue) {
              continue;
            }

            const fontSize = getTextFontSize(textBox.height) * textBox.scale;
            const lineHeight = Math.round(fontSize * 1.2);

            context.fillStyle = textBox.color;
            context.font = `${fontSize}px ${getCanvasTextFontFamily(textBox.fontKey)}`;
            context.textBaseline = "top";
            context.save();
            context.translate(
              textBox.x + textBox.width / 2,
              textBox.y + textBox.height / 2
            );
            context.rotate((textBox.rotationDeg * Math.PI) / 180);

            drawWrappedText(
              context,
              textValue,
              -textBox.width / 2 + TEXT_BOX_INNER_PADDING,
              -textBox.height / 2 + TEXT_BOX_DRAG_BAR_HEIGHT,
              Math.max(10, textBox.width - TEXT_BOX_INNER_PADDING * 2),
              Math.max(
                10,
                textBox.height - TEXT_BOX_DRAG_BAR_HEIGHT - TEXT_BOX_INNER_PADDING
              ),
              lineHeight
            );
            context.restore();
          }
        };

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = canvasElement.width;
        exportCanvas.height = canvasElement.height;
        const exportContext = exportCanvas.getContext("2d");

        if (!exportContext) {
          throw new Error("Canvas context is not available.");
        }

        exportContext.fillStyle = "#ffffff";
        exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        if (toolModeRef.current === "brush") {
          await renderOverlayItems(exportContext);
          exportContext.drawImage(canvasElement, 0, 0);
        } else {
          exportContext.drawImage(canvasElement, 0, 0);
          await renderOverlayItems(exportContext);
        }

        return new Promise<Blob>((resolve, reject) => {
          exportCanvas.toBlob((blob) => {
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
    [clearCanvas, insertedImage, textBoxes]
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

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            Font
            <select
              aria-label="Text font"
              className="border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
              data-canvas-font-picker="true"
              onChange={handleTextFontChange}
              value={selectedTextFontKey}
            >
              {CANVAS_TEXT_FONT_OPTIONS.map((fontOption) => (
                <option key={fontOption.key} value={fontOption.key}>
                  {fontOption.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[210px] flex-1 items-center gap-2 text-sm font-medium text-slate-700">
            Brush size
            <input
              aria-label="Brush size"
              className="w-full accent-slate-700"
              max={20}
              min={1}
              onChange={(event) => applyBrushSize(Number(event.currentTarget.value))}
              onInput={(event) => applyBrushSize(Number(event.currentTarget.value))}
              onLostPointerCapture={handleBrushPointerEnd}
              onPointerCancel={handleBrushPointerEnd}
              onPointerDown={handleBrushPointerDown}
              onPointerMove={handleBrushPointerMove}
              onPointerUp={handleBrushPointerEnd}
              ref={brushSizeInputRef}
              style={{ touchAction: "none" }}
              type="range"
              value={brushSize}
            />
            <span className="min-w-10 text-right text-xs font-semibold text-slate-500">
              {brushSize}px
            </span>
          </label>

          <button
            className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            onClick={() => uploadImageInputRef.current?.click()}
            type="button"
          >
            Upload image
          </button>
          <input
            accept="image/*"
            aria-label="Upload image file"
            className="hidden"
            onChange={handleUploadImageChange}
            ref={uploadImageInputRef}
            type="file"
          />

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
            ? "Text mode: tap to place text, click text to edit, drag text to move, drag near the lower-right text area to resize, and paste/upload one image."
            : "Brush mode: draw freely on the canvas."}
        </p>
      </div>

      <div className="overflow-hidden border border-slate-300 bg-white p-2 shadow-inner">
        <div
          data-testid="canvas-host"
          className="relative mx-auto w-full max-w-[1040px]"
          onMouseDownCapture={handleCanvasMouseDownCapture}
          onTouchStartCapture={handleCanvasTouchStartCapture}
          onMouseDown={handleCanvasMouseDown}
          ref={canvasHostRef}
        >
          <div
            className={toolMode === "brush" ? "relative z-20" : "relative z-10"}
            data-testid="canvas-mount-layer"
            ref={canvasMountRef}
          />

          <div
            className={`pointer-events-none absolute left-0 top-0 ${
              toolMode === "brush" ? "z-10" : "z-20"
            }`}
            data-testid="canvas-overlay-layer"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
            }}
          >
            {insertedImage ? (
              <div
                className="pointer-events-none absolute"
                data-canvas-image-root="true"
                data-testid="canvas-image-item"
                style={{
                  left: `${insertedImage.x}px`,
                  top: `${insertedImage.y}px`,
                  width: `${insertedImage.width}px`,
                  height: `${insertedImage.height}px`,
                  transform: `rotate(${insertedImage.rotationDeg}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <img
                  alt="Inserted canvas image"
                  className={`h-full w-full object-fill ${
                    toolMode === "text" ? "pointer-events-auto cursor-move" : "pointer-events-none"
                  }`}
                  data-testid="canvas-image-element"
                  draggable={false}
                  onClick={() => setIsImageSelected(true)}
                  onMouseDown={startImageDrag}
                  onTouchCancel={handleImageTouchEnd}
                  onTouchEnd={handleImageTouchEnd}
                  onTouchMove={handleImageTouchMove}
                  onTouchStart={handleImageTouchStart}
                  ref={insertedImageElementRef}
                  src={insertedImage.src}
                  style={{ touchAction: "manipulation" }}
                />
                {toolMode === "text" && isImageSelected ? (
                  <button
                    aria-label="Resize inserted image"
                    className="pointer-events-auto absolute bottom-0 right-0 h-5 w-5 cursor-se-resize border border-slate-500 bg-white/95"
                    data-testid="canvas-image-resize"
                    onMouseDown={startImageResize}
                    type="button"
                  />
                ) : null}
              </div>
            ) : null}

            {textBoxes.map((textBox) => {
              const fontSize = getTextFontSize(textBox.height);
              const scaledFontSize = fontSize * textBox.scale;
              const rotationTransform = `rotate(${textBox.rotationDeg}deg)`;
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
                      onClick={(event) => handlePlacedTextClick(event, textBox.id)}
                      onMouseDown={(event) => startDrag(event, textBox.id)}
                      onTouchCancel={(event) => handlePlacedTextTouchEnd(event, textBox.id)}
                      onTouchEnd={(event) => handlePlacedTextTouchEnd(event, textBox.id)}
                      onTouchMove={(event) => handlePlacedTextTouchMove(event, textBox.id)}
                      onTouchStart={(event) => handlePlacedTextTouchStart(event, textBox.id)}
                      style={{
                        touchAction: "manipulation",
                        transform: rotationTransform,
                        transformOrigin: "center center",
                      }}
                      type="button"
                    >
                      <span
                        className="block whitespace-pre-wrap break-words px-2 py-1"
                        style={{
                          color: textBox.color,
                          fontFamily: getCanvasTextFontFamily(textBox.fontKey),
                          fontSize: `${scaledFontSize}px`,
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
                    onBlur={(event) => {
                      if (
                        event.relatedTarget instanceof Element &&
                        event.relatedTarget.closest("[data-canvas-font-picker='true']")
                      ) {
                        window.setTimeout(() => {
                          textAreaRefs.current[textBox.id]?.focus();
                        }, 0);
                        return;
                      }

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
                    onTouchCancel={(event) => endTouchTransform(event, textBox.id)}
                    onTouchEnd={(event) => endTouchTransform(event, textBox.id)}
                    onTouchMove={(event) => moveTouchTransform(event, textBox.id)}
                    onTouchStart={(event) => startTouchTransform(event, textBox.id)}
                    style={{
                      color: textBox.color,
                      fontFamily: getCanvasTextFontFamily(textBox.fontKey),
                      fontSize: `${scaledFontSize}px`,
                      lineHeight: "1.2",
                      touchAction: "manipulation",
                      transform: rotationTransform,
                      transformOrigin: "center center",
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
