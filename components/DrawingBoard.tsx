"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { DEFAULT_COLOR } from "@/components/drawing-board/constants";
import type { ToolMode } from "@/components/drawing-board/types";
import { DrawingBoardCanvas } from "@/components/drawing-board/DrawingBoardCanvas";
import { DrawingBoardToolbar } from "@/components/drawing-board/DrawingBoardToolbar";
import { renderExportCanvas } from "@/components/drawing-board/renderExportCanvas";
import { useImageLayer } from "@/components/drawing-board/useImageLayer";
import { useP5Canvas } from "@/components/drawing-board/useP5Canvas";
import { useTextLayer } from "@/components/drawing-board/useTextLayer";

export type DrawingBoardHandle = {
  exportImageBlob: () => Promise<Blob>;
  clear: () => void;
};

const DrawingBoard = forwardRef<DrawingBoardHandle>(function DrawingBoard(_, ref) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushColor, setBrushColor] = useState(DEFAULT_COLOR);

  const toolModeRef = useRef<ToolMode>(toolMode);
  const previousCanvasSizeRef = useRef<{ width: number; height: number } | null>(null);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const brushTouchDrawingRef = useRef(false);

  const {
    applyBrushColor,
    applyBrushSize,
    brushSize,
    brushSizeInputRef,
    canvasElementRef,
    canvasSize,
    clearBrushLayer,
    handleBrushPointerDown,
    handleBrushPointerEnd,
    handleBrushPointerMove,
  } = useP5Canvas({
    canvasHostRef,
    canvasMountRef,
    brushTouchDrawingRef,
    toolModeRef,
  });
  const {
    activeTextBoxId,
    activeTextTouchElementRef,
    cleanupEmptyTextBoxes,
    endTouchTransform,
    handleCanvasMouseDown,
    handleEditingTextBlur,
    handleEditingTextChange,
    handlePlacedTextClick,
    handlePlacedTextTouchEnd,
    handlePlacedTextTouchMove,
    handlePlacedTextTouchStart,
    handleTextFontChange,
    moveTouchTransform,
    resetTextLayer,
    resetTextTouchState,
    resizeTextLayer,
    selectedTextFontKey,
    setActiveTextBoxId,
    startDrag,
    startResize,
    startTouchTransform,
    textAreaRefs,
    textBoxes,
    textTouchInteractionModeRef,
  } = useTextLayer({
    brushColor,
    canvasElementRef,
    canvasSize,
    setToolMode,
    toolMode,
  });
  const {
    activeImageTouchElementRef,
    handleCanvasMouseDownCapture,
    handleCanvasTouchStartCapture,
    handleImageTouchEnd,
    handleImageTouchMove,
    handleImageTouchStart,
    handleUploadImageChange,
    imageTouchDragRef,
    imageTouchInteractionModeRef,
    imageTouchTransformRef,
    insertedImage,
    insertedImageElementRef,
    isImageSelected,
    resetImageLayer,
    resetImageTouchState,
    setInsertedImage,
    setIsImageSelected,
    startImageDrag,
    startImageResize,
  } = useImageLayer({
    canvasSize,
    toolMode,
  });

  useEffect(() => {
    applyBrushColor(brushColor);
  }, [applyBrushColor, brushColor]);

  useEffect(() => {
    toolModeRef.current = toolMode;
  }, [toolMode]);

  useEffect(() => {
    const previousCanvasSize = previousCanvasSizeRef.current;
    previousCanvasSizeRef.current = canvasSize;

    if (
      !previousCanvasSize ||
      (previousCanvasSize.width === canvasSize.width &&
        previousCanvasSize.height === canvasSize.height)
    ) {
      return;
    }

    resizeTextLayer(canvasSize, previousCanvasSize);

    const scaleX = canvasSize.width / previousCanvasSize.width;
    const scaleY = canvasSize.height / previousCanvasSize.height;
    const uniformScale = Math.min(scaleX, scaleY);

    setInsertedImage((currentImage) => {
      if (!currentImage) {
        return currentImage;
      }

      return {
        ...currentImage,
        x: currentImage.x * scaleX,
        y: currentImage.y * scaleY,
        width: currentImage.width * scaleX,
        height: currentImage.height * scaleY,
        scale: currentImage.scale * uniformScale,
      };
    });
  }, [canvasSize, resizeTextLayer, setInsertedImage]);

  useEffect(() => {
    let resetTimeout: number | null = null;

    const clearTouchOwnership = () => {
      resetTextTouchState();
      resetImageTouchState();
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

  const clearCanvas = useCallback(() => {
    clearBrushLayer();
    brushTouchDrawingRef.current = false;
    resetTextLayer();
    resetImageLayer();
  }, [clearBrushLayer, resetImageLayer, resetTextLayer]);

  const handleToolModeChange = useCallback(
    (nextMode: ToolMode) => {
      if (nextMode === "brush") {
        cleanupEmptyTextBoxes();
        setActiveTextBoxId(null);
        resetTextTouchState();
        setIsImageSelected(false);
        resetImageTouchState();
      }

      if (nextMode !== "brush") {
        brushTouchDrawingRef.current = false;
      }

      setToolMode(nextMode);
    },
    [cleanupEmptyTextBoxes, resetImageTouchState, resetTextTouchState, setIsImageSelected]
  );

  useImperativeHandle(
    ref,
    () => ({
      exportImageBlob: async () => {
        const canvasElement = canvasElementRef.current;

        if (!canvasElement) {
          throw new Error("Canvas is not ready yet.");
        }
        const { blob, imageElement } = await renderExportCanvas({
          canvasElement,
          insertedImage,
          textBoxes,
          toolMode: toolModeRef.current,
          cachedImageElement: insertedImageElementRef.current,
        });
        insertedImageElementRef.current = imageElement;
        return blob;
      },
      clear: clearCanvas,
    }),
    [clearCanvas, insertedImage, textBoxes]
  );

  return (
    <div className="space-y-4">
      <DrawingBoardToolbar
        brushColor={brushColor}
        brushSize={brushSize}
        brushSizeInputRef={brushSizeInputRef}
        onBrushColorChange={setBrushColor}
        onBrushPointerDown={handleBrushPointerDown}
        onBrushPointerEnd={handleBrushPointerEnd}
        onBrushPointerMove={handleBrushPointerMove}
        onBrushSizeChange={applyBrushSize}
        onClear={clearCanvas}
        onTextFontChange={handleTextFontChange}
        onToolModeChange={handleToolModeChange}
        onUploadImageChange={handleUploadImageChange}
        selectedTextFontKey={selectedTextFontKey}
        toolMode={toolMode}
        uploadImageInputRef={uploadImageInputRef}
      />

      <DrawingBoardCanvas
        activeTextBoxId={activeTextBoxId}
        canvasHostRef={canvasHostRef}
        canvasMountRef={canvasMountRef}
        canvasSize={canvasSize}
        insertedImage={insertedImage}
        insertedImageElementRef={insertedImageElementRef}
        isImageSelected={isImageSelected}
        onCanvasMouseDown={handleCanvasMouseDown}
        onCanvasMouseDownCapture={handleCanvasMouseDownCapture}
        onCanvasTouchStartCapture={handleCanvasTouchStartCapture}
        onEditingTextBlur={handleEditingTextBlur}
        onEditingTextChange={handleEditingTextChange}
        onEditingTextTouchEnd={endTouchTransform}
        onEditingTextTouchMove={moveTouchTransform}
        onEditingTextTouchStart={startTouchTransform}
        onImageMouseDown={startImageDrag}
        onImageResizeMouseDown={startImageResize}
        onImageSelect={() => setIsImageSelected(true)}
        onImageTouchEnd={handleImageTouchEnd}
        onImageTouchMove={handleImageTouchMove}
        onImageTouchStart={handleImageTouchStart}
        onPlacedTextClick={handlePlacedTextClick}
        onPlacedTextTouchEnd={handlePlacedTextTouchEnd}
        onPlacedTextTouchMove={handlePlacedTextTouchMove}
        onPlacedTextTouchStart={handlePlacedTextTouchStart}
        onTextMouseDown={startDrag}
        onTextResizeMouseDown={startResize}
        textAreaRefs={textAreaRefs}
        textBoxes={textBoxes}
        toolMode={toolMode}
      />
    </div>
  );
});

export default DrawingBoard;
