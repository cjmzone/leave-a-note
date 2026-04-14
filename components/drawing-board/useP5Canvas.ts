import type p5 from "p5";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  CANVAS_HEIGHT_RATIO,
  CANVAS_MAX_WIDTH,
  CANVAS_MIN_WIDTH,
  DEFAULT_BRUSH_SIZE,
} from "@/components/drawing-board/constants";
import type { ToolMode } from "@/components/drawing-board/types";
import { clamp } from "@/components/drawing-board/utils";

type UseP5CanvasOptions = {
  canvasHostRef: RefObject<HTMLDivElement | null>;
  canvasMountRef: RefObject<HTMLDivElement | null>;
  toolModeRef: RefObject<ToolMode>;
  brushTouchDrawingRef: RefObject<boolean>;
};

export function useP5Canvas({
  canvasHostRef,
  canvasMountRef,
  toolModeRef,
  brushTouchDrawingRef,
}: UseP5CanvasOptions) {
  const p5Ref = useRef<p5 | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const brushColorRef = useRef("#000000");
  const brushSizeRef = useRef(DEFAULT_BRUSH_SIZE);
  const brushSizeInputRef = useRef<HTMLInputElement | null>(null);
  const activeBrushPointerIdRef = useRef<number | null>(null);

  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [canvasSize, setCanvasSize] = useState({
    width: CANVAS_MIN_WIDTH,
    height: Math.round(CANVAS_MIN_WIDTH * CANVAS_HEIGHT_RATIO),
  });

  const measureCanvasSize = useCallback(() => {
    const hostWidth = canvasHostRef.current?.clientWidth ?? CANVAS_MAX_WIDTH;
    const width = clamp(Math.floor(hostWidth), CANVAS_MIN_WIDTH, CANVAS_MAX_WIDTH);
    const height = Math.round(width * CANVAS_HEIGHT_RATIO);

    return { width, height };
  }, [canvasHostRef]);

  const resizeCanvasSurface = useCallback(
    (nextSize: { width: number; height: number }) => {
      const instance = p5Ref.current;
      const canvasElement = canvasElementRef.current;

      if (!instance || !canvasElement) {
        setCanvasSize(nextSize);
        return;
      }

      if (
        canvasElement.width === nextSize.width &&
        canvasElement.height === nextSize.height
      ) {
        setCanvasSize(nextSize);
        return;
      }

      const snapshot = document.createElement("canvas");
      snapshot.width = canvasElement.width;
      snapshot.height = canvasElement.height;
      snapshot.getContext("2d")?.drawImage(canvasElement, 0, 0);

      instance.resizeCanvas(nextSize.width, nextSize.height, true);

      canvasElementRef.current
        ?.getContext("2d")
        ?.drawImage(
          snapshot,
          0,
          0,
          snapshot.width,
          snapshot.height,
          0,
          0,
          nextSize.width,
          nextSize.height
        );

      setCanvasSize(nextSize);
    },
    []
  );

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
          const { width: canvasWidth, height: canvasHeight } = measureCanvasSize();

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
  }, [canvasHostRef, canvasMountRef, measureCanvasSize, toolModeRef]);

  useEffect(() => {
    const host = canvasHostRef.current;

    if (!host || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      resizeCanvasSurface(measureCanvasSize());
    });

    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, [canvasHostRef, measureCanvasSize, resizeCanvasSurface]);

  const applyBrushColor = useCallback((nextColor: string) => {
    brushColorRef.current = nextColor;
  }, []);

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

  const clearBrushLayer = useCallback(() => {
    p5Ref.current?.clear();
    brushTouchDrawingRef.current = false;
  }, [brushTouchDrawingRef]);

  return {
    applyBrushColor,
    applyBrushSize,
    brushColorRef,
    brushSize,
    brushSizeInputRef,
    brushSizeRef,
    canvasElementRef,
    canvasSize,
    clearBrushLayer,
    handleBrushPointerDown,
    handleBrushPointerEnd,
    handleBrushPointerMove,
  };
}
