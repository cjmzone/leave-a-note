import type {
  FocusEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
} from "react";
import { TEXT_BOX_DRAG_BAR_HEIGHT } from "@/components/drawing-board/constants";
import type {
  CanvasImageItem,
  CanvasTextBox,
  ToolMode,
} from "@/components/drawing-board/types";
import {
  getCanvasTextFontFamily,
  getTextFontSize,
} from "@/components/drawing-board/utils";

type DrawingBoardCanvasProps = {
  toolMode: ToolMode;
  canvasSize: { width: number; height: number };
  textBoxes: CanvasTextBox[];
  activeTextBoxId: string | null;
  insertedImage: CanvasImageItem | null;
  isImageSelected: boolean;
  canvasHostRef: RefObject<HTMLDivElement | null>;
  canvasMountRef: RefObject<HTMLDivElement | null>;
  insertedImageElementRef: RefObject<HTMLImageElement | null>;
  textAreaRefs: RefObject<Record<string, HTMLTextAreaElement | null>>;
  onCanvasMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onCanvasTouchStartCapture: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onCanvasMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onImageSelect: () => void;
  onImageMouseDown: (event: ReactMouseEvent) => void;
  onImageTouchStart: (event: ReactTouchEvent) => void;
  onImageTouchMove: (event: ReactTouchEvent) => void;
  onImageTouchEnd: (event: ReactTouchEvent) => void;
  onImageResizeMouseDown: (event: ReactMouseEvent) => void;
  onPlacedTextClick: (event: ReactMouseEvent<HTMLButtonElement>, boxId: string) => void;
  onTextMouseDown: (event: ReactMouseEvent, boxId: string) => void;
  onTextResizeMouseDown: (event: ReactMouseEvent, boxId: string) => void;
  onPlacedTextTouchStart: (event: ReactTouchEvent, boxId: string) => void;
  onPlacedTextTouchMove: (event: ReactTouchEvent, boxId: string) => void;
  onPlacedTextTouchEnd: (event: ReactTouchEvent, boxId: string) => void;
  onEditingTextChange: (boxId: string, value: string) => void;
  onEditingTextBlur: (
    event: FocusEvent<HTMLTextAreaElement>,
    boxId: string
  ) => void;
  onEditingTextTouchStart: (event: ReactTouchEvent, boxId: string) => void;
  onEditingTextTouchMove: (event: ReactTouchEvent, boxId: string) => void;
  onEditingTextTouchEnd: (event: ReactTouchEvent, boxId: string) => void;
};

export function DrawingBoardCanvas({
  toolMode,
  canvasSize,
  textBoxes,
  activeTextBoxId,
  insertedImage,
  isImageSelected,
  canvasHostRef,
  canvasMountRef,
  insertedImageElementRef,
  textAreaRefs,
  onCanvasMouseDownCapture,
  onCanvasTouchStartCapture,
  onCanvasMouseDown,
  onImageSelect,
  onImageMouseDown,
  onImageTouchStart,
  onImageTouchMove,
  onImageTouchEnd,
  onImageResizeMouseDown,
  onPlacedTextClick,
  onTextMouseDown,
  onTextResizeMouseDown,
  onPlacedTextTouchStart,
  onPlacedTextTouchMove,
  onPlacedTextTouchEnd,
  onEditingTextChange,
  onEditingTextBlur,
  onEditingTextTouchStart,
  onEditingTextTouchMove,
  onEditingTextTouchEnd,
}: DrawingBoardCanvasProps) {
  return (
    <div className="overflow-hidden border border-slate-300 bg-white p-2 shadow-inner">
      <div
        className="relative mx-auto w-full max-w-[1040px]"
        data-testid="canvas-host"
        onMouseDown={onCanvasMouseDown}
        onMouseDownCapture={onCanvasMouseDownCapture}
        onTouchStartCapture={onCanvasTouchStartCapture}
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
                  toolMode === "text"
                    ? "pointer-events-auto cursor-move"
                    : "pointer-events-none"
                }`}
                data-testid="canvas-image-element"
                draggable={false}
                onClick={onImageSelect}
                onMouseDown={onImageMouseDown}
                onTouchCancel={onImageTouchEnd}
                onTouchEnd={onImageTouchEnd}
                onTouchMove={onImageTouchMove}
                onTouchStart={onImageTouchStart}
                ref={insertedImageElementRef}
                src={insertedImage.src}
                style={{ touchAction: "manipulation" }}
              />
              {toolMode === "text" && isImageSelected ? (
                <button
                  aria-label="Resize inserted image"
                  className="pointer-events-auto absolute bottom-0 right-0 h-5 w-5 cursor-se-resize border border-slate-500 bg-white/95"
                  data-testid="canvas-image-resize"
                  onMouseDown={onImageResizeMouseDown}
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
                    onClick={(event) => onPlacedTextClick(event, textBox.id)}
                    onMouseDown={(event) => onTextMouseDown(event, textBox.id)}
                    onTouchCancel={(event) => onPlacedTextTouchEnd(event, textBox.id)}
                    onTouchEnd={(event) => onPlacedTextTouchEnd(event, textBox.id)}
                    onTouchMove={(event) => onPlacedTextTouchMove(event, textBox.id)}
                    onTouchStart={(event) => onPlacedTextTouchStart(event, textBox.id)}
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
                      onMouseDown={(event) => onTextResizeMouseDown(event, textBox.id)}
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
                  onBlur={(event) => onEditingTextBlur(event, textBox.id)}
                  onChange={(event) => onEditingTextChange(textBox.id, event.target.value)}
                  onTouchCancel={(event) => onEditingTextTouchEnd(event, textBox.id)}
                  onTouchEnd={(event) => onEditingTextTouchEnd(event, textBox.id)}
                  onTouchMove={(event) => onEditingTextTouchMove(event, textBox.id)}
                  onTouchStart={(event) => onEditingTextTouchStart(event, textBox.id)}
                  ref={(element) => {
                    textAreaRefs.current[textBox.id] = element;
                  }}
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
                  onMouseDown={(event) => onTextResizeMouseDown(event, textBox.id)}
                  type="button"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
