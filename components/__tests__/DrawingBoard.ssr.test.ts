import { describe, expect, it } from "vitest";

describe("DrawingBoard SSR safety", () => {
  it("can be imported in a server-like context without window errors", async () => {
    const module = await import("@/components/DrawingBoard");

    expect(module.default).toBeTruthy();
  });
});
