"use client";

import { FormEvent, useRef, useState } from "react";
import { MAX_NOTE_LENGTH } from "@/lib/constants";
import type { Post } from "@/types/post";
import DrawingBoard, { DrawingBoardHandle } from "@/components/DrawingBoard";

type LeaveNoteFormProps = {
  onPostCreated: (post: Post) => void;
};

function convertBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Failed to read canvas data."));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => reject(new Error("Failed to read canvas data."));
    reader.readAsDataURL(blob);
  });
}

export default function LeaveNoteForm({ onPostCreated }: LeaveNoteFormProps) {
  const boardRef = useRef<DrawingBoardHandle>(null);

  const [noteText, setNoteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedNote = noteText.trim();

    if (!trimmedNote) {
      setErrorMessage("Please enter a short note before posting.");
      setSuccessMessage(null);
      return;
    }

    if (!boardRef.current) {
      setErrorMessage("Canvas is not ready yet. Please try again.");
      setSuccessMessage(null);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const imageBlob = await boardRef.current.exportImageBlob();
      const imageDataUrl = await convertBlobToDataUrl(imageBlob);

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteText: trimmedNote,
          imageDataUrl,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create the post.");
      }

      onPostCreated(payload.post as Post);
      setNoteText("");
      boardRef.current.clear();
      setSuccessMessage("Your note is now live in the public feed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create the post.";
      setErrorMessage(message);
      setSuccessMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <DrawingBoard ref={boardRef} />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="noteText">
          Short note
        </label>
        <textarea
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-300"
          id="noteText"
          maxLength={MAX_NOTE_LENGTH}
          onChange={(event) => setNoteText(event.target.value)}
          placeholder="Write something kind, funny, or thoughtful..."
          required
          rows={4}
          value={noteText}
        />
        <p className="text-right text-xs text-slate-500">
          {noteText.length}/{MAX_NOTE_LENGTH}
        </p>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      <button
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Posting..." : "Post Anonymously"}
      </button>
    </form>
  );
}
