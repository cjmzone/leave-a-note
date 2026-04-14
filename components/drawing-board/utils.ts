import {
  CANVAS_TEXT_FONT_FAMILIES,
} from "@/components/drawing-board/constants";
import type { CanvasFontKey, TouchPoint } from "@/components/drawing-board/types";

export function readFileAsDataUrl(file: File): Promise<string> {
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

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createTextBoxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `box-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getTextFontSize(boxHeight: number): number {
  return clamp(Math.round(boxHeight * 0.33), 16, 56);
}

export function getCanvasTextFontFamily(fontKey: CanvasFontKey): string {
  return CANVAS_TEXT_FONT_FAMILIES[fontKey] ?? CANVAS_TEXT_FONT_FAMILIES.nunito;
}

export function getTouchMetrics(
  firstTouch: TouchPoint,
  secondTouch: TouchPoint
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

export function normalizeAngleDeltaRadians(rawDelta: number): number {
  if (rawDelta > Math.PI) {
    return rawDelta - Math.PI * 2;
  }

  if (rawDelta < -Math.PI) {
    return rawDelta + Math.PI * 2;
  }

  return rawDelta;
}

export function normalizeAngleDeltaDegrees(rawDelta: number): number {
  if (rawDelta > 180) {
    return rawDelta - 360;
  }

  if (rawDelta < -180) {
    return rawDelta + 360;
  }

  return rawDelta;
}

export function drawWrappedText(
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
