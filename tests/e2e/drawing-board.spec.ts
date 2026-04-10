import { expect, test, type Page } from "@playwright/test";

async function mockPostsApi(page: Page) {
  const posts: Array<{
    id: string;
    image_url: string;
    note_text: string;
    created_at: string;
  }> = [];

  await page.route("**/api/posts", async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ posts }),
      });
      return;
    }

    if (request.method() === "POST") {
      const body = request.postDataJSON() as {
        noteText: string;
        imageDataUrl: string;
      };

      expect(body.imageDataUrl).toMatch(/^data:image\/png;base64,/);

      const post = {
        id: `e2e-post-${posts.length + 1}`,
        image_url: "https://cdn.example/drawing-board.png",
        note_text: body.noteText,
        created_at: "2026-04-10T18:00:00.000Z",
      };

      posts.unshift(post);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ post }),
      });
      return;
    }

    await route.fallback();
  });
}

async function dispatchSyntheticTouch(
  page: Page,
  selector: string,
  type: "touchstart" | "touchmove" | "touchend",
  touches: Array<{ identifier: number; clientX: number; clientY: number }>
) {
  await page.evaluate(
    ({ selector: nextSelector, type: nextType, touches: nextTouches }) => {
      const element = document.querySelector(nextSelector);

      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing element for selector: ${nextSelector}`);
      }

      const event = new Event(nextType, {
        bubbles: true,
        cancelable: true,
      });

      Object.defineProperty(event, "touches", { value: nextTouches });
      Object.defineProperty(event, "targetTouches", { value: nextTouches });
      Object.defineProperty(event, "changedTouches", { value: nextTouches });

      element.dispatchEvent(event);
    },
    { selector, type, touches }
  );
}

test("drawing board desktop flow supports draw, text, image, and submit", async ({
  page,
}) => {
  await mockPostsApi(page);
  await page.goto("/");

  const canvas = page.getByTestId("canvas-host").locator("canvas");
  await expect(canvas).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).toBeTruthy();

  await page.mouse.move((canvasBox?.x ?? 0) + 40, (canvasBox?.y ?? 0) + 40);
  await page.mouse.down();
  await page.mouse.move((canvasBox?.x ?? 0) + 180, (canvasBox?.y ?? 0) + 120, {
    steps: 12,
  });
  await page.mouse.up();

  const brushChanged = await canvas.evaluate((element) => {
    const context = element.getContext("2d");
    const data = context?.getImageData(0, 0, element.width, element.height).data;
    if (!data) {
      return false;
    }

    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) {
        return true;
      }
    }

    return false;
  });
  expect(brushChanged).toBe(true);

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click((canvasBox?.x ?? 0) + 120, (canvasBox?.y ?? 0) + 90);
  await page.getByLabel("Canvas text").fill("Desktop text");
  await page.getByLabel("Canvas text").blur();
  await expect(page.getByText("Desktop text")).toBeVisible();

  await page.getByLabel("Upload image file").setInputFiles({
    name: "desktop.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2PumoAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByTestId("canvas-image-item")).toBeVisible();

  const textItem = page.getByTestId("canvas-text-item").first();
  const imageItem = page.getByTestId("canvas-image-item");
  const textBefore = await textItem.boundingBox();
  const imageBefore = await imageItem.boundingBox();

  const textPlaced = page.getByTestId("canvas-text-placed");
  const imageElement = page.getByTestId("canvas-image-element");
  const textResize = page.getByTestId("canvas-text-resize");
  const imageResize = page.getByTestId("canvas-image-resize");

  const textBox = await textPlaced.boundingBox();
  await page.mouse.move((textBox?.x ?? 0) + 20, (textBox?.y ?? 0) + 20);
  await page.mouse.down();
  await page.mouse.move((textBox?.x ?? 0) + 90, (textBox?.y ?? 0) + 80, { steps: 8 });
  await page.mouse.up();

  const imageBox = await imageElement.boundingBox();
  await page.mouse.move((imageBox?.x ?? 0) + 30, (imageBox?.y ?? 0) + 30);
  await page.mouse.down();
  await page.mouse.move((imageBox?.x ?? 0) + 110, (imageBox?.y ?? 0) + 90, { steps: 8 });
  await page.mouse.up();

  const textResizeBox = await textResize.boundingBox();
  await page.mouse.move((textResizeBox?.x ?? 0) + 4, (textResizeBox?.y ?? 0) + 4);
  await page.mouse.down();
  await page.mouse.move((textResizeBox?.x ?? 0) + 64, (textResizeBox?.y ?? 0) + 54, {
    steps: 8,
  });
  await page.mouse.up();

  const imageResizeBox = await imageResize.boundingBox();
  await page.mouse.move((imageResizeBox?.x ?? 0) + 4, (imageResizeBox?.y ?? 0) + 4);
  await page.mouse.down();
  await page.mouse.move((imageResizeBox?.x ?? 0) + 44, (imageResizeBox?.y ?? 0) + 34, {
    steps: 8,
  });
  await page.mouse.up();

  const textAfter = await textItem.boundingBox();
  const imageAfter = await imageItem.boundingBox();
  expect(textAfter?.x).toBeGreaterThan(textBefore?.x ?? 0);
  expect(imageAfter?.x).toBeGreaterThan(imageBefore?.x ?? 0);
  expect(textAfter?.width).toBeGreaterThan(textBefore?.width ?? 0);
  expect(imageAfter?.width).toBeGreaterThan(imageBefore?.width ?? 0);

  await page.getByLabel("Short note").fill("Drawing board desktop e2e");
  await page.getByRole("button", { name: "Post Anonymously" }).click();

  await expect(
    page.getByText("Your note is now live in the public feed.")
  ).toBeVisible();
  await expect(page.getByText("Drawing board desktop e2e")).toBeVisible();
});

test("drawing board mobile-width flow keeps touch-sensitive paths working", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPostsApi(page);

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon.ico")) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("canvas-host").locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Brush" })).toBeVisible();
  await expect(page.getByLabel("Short note")).toBeVisible();

  const canvas = page.getByTestId("canvas-host").locator("canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).toBeTruthy();

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click((canvasBox?.x ?? 0) + 120, (canvasBox?.y ?? 0) + 90);
  await page.getByLabel("Canvas text").fill("Touch text");
  await page.getByLabel("Canvas text").blur();

  await page.getByLabel("Upload image file").setInputFiles({
    name: "touch.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2PumoAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByTestId("canvas-image-item")).toBeVisible();

  const textBefore = await page.getByTestId("canvas-text-item").boundingBox();
  const imageBefore = await page.getByTestId("canvas-image-item").boundingBox();

  await dispatchSyntheticTouch(page, "[data-testid='canvas-text-placed']", "touchstart", [
    { identifier: 1, clientX: 140, clientY: 100 },
  ]);
  await dispatchSyntheticTouch(page, "[data-testid='canvas-text-placed']", "touchmove", [
    { identifier: 1, clientX: 220, clientY: 170 },
  ]);
  await dispatchSyntheticTouch(page, "[data-testid='canvas-text-placed']", "touchend", []);

  await dispatchSyntheticTouch(page, "[data-testid='canvas-image-element']", "touchstart", [
    { identifier: 11, clientX: 120, clientY: 120 },
    { identifier: 12, clientX: 210, clientY: 120 },
  ]);
  await dispatchSyntheticTouch(page, "[data-testid='canvas-image-element']", "touchmove", [
    { identifier: 11, clientX: 110, clientY: 110 },
    { identifier: 12, clientX: 250, clientY: 200 },
  ]);
  await dispatchSyntheticTouch(page, "[data-testid='canvas-image-element']", "touchend", []);

  const textAfter = await page.getByTestId("canvas-text-item").boundingBox();
  const imageAfter = await page.getByTestId("canvas-image-item").boundingBox();
  expect(textAfter?.x).toBeGreaterThan(textBefore?.x ?? 0);
  expect(textAfter?.y).toBeGreaterThan(textBefore?.y ?? 0);
  expect(imageAfter?.width).toBeGreaterThan(imageBefore?.width ?? 0);

  expect(consoleErrors).toEqual([]);
});
