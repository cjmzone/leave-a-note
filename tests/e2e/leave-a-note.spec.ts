import { expect, test } from "@playwright/test";

test("happy path: anonymous post appears in the public feed", async ({ page }) => {
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

      expect(body.noteText).toBe("Hello from e2e");
      expect(body.imageDataUrl).toMatch(/^data:image\/png;base64,/);

      const post = {
        id: "e2e-post-1",
        image_url: "https://cdn.example/e2e-post-1.png",
        note_text: body.noteText,
        created_at: "2026-03-25T13:00:00.000Z",
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

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("Short note").fill("Hello from e2e");
  await page.getByRole("button", { name: "Post Anonymously" }).click();

  await expect(
    page.getByText("Your note is now live in the public feed.")
  ).toBeVisible();
  await expect(page.getByText("Hello from e2e")).toBeVisible();
});

test("edge case: rate-limit error is shown to the user", async ({ page }) => {
  await page.route("**/api/posts", async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ posts: [] }),
      });
      return;
    }

    if (request.method() === "POST") {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "You can only create one post per day." }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByLabel("Short note").fill("Will be rate limited");
  await page.getByRole("button", { name: "Post Anonymously" }).click();

  await expect(
    page.getByText("Sorry, you can only make one post a day.")
  ).toBeVisible();
});
