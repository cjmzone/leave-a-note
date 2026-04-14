import {
  TEXT_BOX_DRAG_BAR_HEIGHT,
  TEXT_BOX_INNER_PADDING,
} from "@/components/drawing-board/constants";
import type {
  CanvasImageItem,
  CanvasTextBox,
  ToolMode,
} from "@/components/drawing-board/types";
import {
  drawWrappedText,
  getCanvasTextFontFamily,
  getTextFontSize,
  loadImageElement,
} from "@/components/drawing-board/utils";

type RenderExportCanvasOptions = {
  canvasElement: HTMLCanvasElement;
  insertedImage: CanvasImageItem | null;
  textBoxes: CanvasTextBox[];
  toolMode: ToolMode;
  cachedImageElement?: HTMLImageElement | null;
};

type RenderExportCanvasResult = {
  blob: Blob;
  imageElement: HTMLImageElement | null;
};

async function renderOverlayItems(
  context: CanvasRenderingContext2D,
  insertedImage: CanvasImageItem | null,
  textBoxes: CanvasTextBox[],
  cachedImageElement: HTMLImageElement | null
): Promise<HTMLImageElement | null> {
  let imageElement = cachedImageElement;

  if (insertedImage) {
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

  return imageElement;
}

export async function renderExportCanvas({
  canvasElement,
  insertedImage,
  textBoxes,
  toolMode,
  cachedImageElement = null,
}: RenderExportCanvasOptions): Promise<RenderExportCanvasResult> {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvasElement.width;
  exportCanvas.height = canvasElement.height;
  const exportContext = exportCanvas.getContext("2d");

  if (!exportContext) {
    throw new Error("Canvas context is not available.");
  }

  exportContext.fillStyle = "#ffffff";
  exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  const renderOverlays = () =>
    renderOverlayItems(exportContext, insertedImage, textBoxes, cachedImageElement);

  const imageElement =
    toolMode === "brush"
      ? await renderOverlays().then((element) => {
          exportContext.drawImage(canvasElement, 0, 0);
          return element;
        })
      : await (async () => {
          exportContext.drawImage(canvasElement, 0, 0);
          return renderOverlays();
        })();

  const blob = await new Promise<Blob>((resolve, reject) => {
    exportCanvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error("Could not export the canvas."));
        return;
      }

      resolve(nextBlob);
    }, "image/png");
  });

  return { blob, imageElement };
}
