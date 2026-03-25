import { randomUUID } from "node:crypto";

export type StorageBucketClient = {
  upload: (
    path: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean }
  ) => Promise<{ error: { message: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
  remove: (paths: string[]) => Promise<{ error?: { message: string } | null }>;
};

type UploadCanvasImageParams = {
  bucketClient: StorageBucketClient;
  datePrefix: string;
  imageBuffer: Buffer;
  fileId?: string;
};

export async function uploadCanvasImage({
  bucketClient,
  datePrefix,
  imageBuffer,
  fileId,
}: UploadCanvasImageParams): Promise<{ filePath: string; imageUrl: string }> {
  const resolvedFileId = fileId ?? randomUUID();
  const filePath = `${datePrefix}/${resolvedFileId}.png`;

  const { error } = await bucketClient.upload(filePath, imageBuffer, {
    contentType: "image/png",
    upsert: false,
  });

  if (error) {
    throw new Error("Failed to upload drawing image.");
  }

  const { data } = bucketClient.getPublicUrl(filePath);

  return {
    filePath,
    imageUrl: data.publicUrl,
  };
}

export async function deleteCanvasImage(
  bucketClient: StorageBucketClient,
  filePath: string
): Promise<void> {
  await bucketClient.remove([filePath]);
}
