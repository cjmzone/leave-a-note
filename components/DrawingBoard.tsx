"use client";

import type p5 from "p5";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type DrawingBoardHandle = {
  exportImageBlob: () => Promise<Blob>;
  clear: () => void;
};

const DEFAULT_COLOR = "#000000";
const DEFAULT_BRUSH_SIZE = 4;

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 320;

const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<p5 | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  const [brushColor, setBrushColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);

  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);

  useEffect(() => {
    brushColorRef.current = brushColor;
  }, [brushColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

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
          const canvas = p.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
          canvas.parent(containerRef.current as Element);
          p.background(255);
          p.strokeCap(p.ROUND);
          canvasElementRef.current = canvas.elt as HTMLCanvasElement;
        };

        p.draw = () => {
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

  const clearCanvas = useCallback(() => {
    p5Ref.current?.background(255);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      exportImageBlob: async () => {
        const canvasElement = canvasElementRef.current;

        if (!canvasElement) {
          throw new Error("Canvas is not ready yet.");
        }

        return new Promise<Blob>((resolve, reject) => {
          canvasElement.toBlob((blob) => {
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
    [clearCanvas]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Color
          <input
            aria-label="Brush color"
            className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white"
            onChange={(event) => setBrushColor(event.target.value)}
            type="color"
            value={brushColor}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Brush size
          <input
            aria-label="Brush size"
            className="w-40"
            max={20}
            min={1}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            type="range"
            value={brushSize}
          />
          <span>{brushSize}px</span>
        </label>

        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          onClick={clearCanvas}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-300 bg-white p-2">
        <div ref={containerRef} />
      </div>
    </div>
  );
});

export default DrawingBoard;
