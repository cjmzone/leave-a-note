import { describe, expect, it, vi } from "vitest";
import {
  deleteCanvasImage,
  type StorageBucketClient,
  uploadCanvasImage,
} from "@/lib/imageUpload";

describe("image upload abstraction", () => {
  it("uploads a canvas image and returns file path + public URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://cdn.example/2026-03-25/custom-id.png" },
    });
    const remove = vi.fn().mockResolvedValue({ error: null });

    const bucketClient: StorageBucketClient = {
      upload,
      getPublicUrl,
      remove,
    };

    const result = await uploadCanvasImage({
      bucketClient,
      datePrefix: "2026-03-25",
      imageBuffer: Buffer.from("fake"),
      fileId: "custom-id",
    });

    expect(upload).toHaveBeenCalledWith(
      "2026-03-25/custom-id.png",
      expect.any(Buffer),
      {
        contentType: "image/png",
        upsert: false,
      }
    );
    expect(result).toEqual({
      filePath: "2026-03-25/custom-id.png",
      imageUrl: "https://cdn.example/2026-03-25/custom-id.png",
    });
  });

  it("throws when upload fails and can cleanup via delete helper", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ error: { message: "storage error" } });
    const getPublicUrl = vi.fn();
    const remove = vi.fn().mockResolvedValue({ error: null });

    const bucketClient: StorageBucketClient = {
      upload,
      getPublicUrl,
      remove,
    };

    await expect(
      uploadCanvasImage({
        bucketClient,
        datePrefix: "2026-03-25",
        imageBuffer: Buffer.from("fake"),
        fileId: "failing-id",
      })
    ).rejects.toThrow("Failed to upload drawing image: storage error");

    await deleteCanvasImage(bucketClient, "2026-03-25/failing-id.png");
    expect(remove).toHaveBeenCalledWith(["2026-03-25/failing-id.png"]);
  });
});
