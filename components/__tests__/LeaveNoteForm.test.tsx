/** @vitest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeaveNoteForm from "@/components/LeaveNoteForm";
import type { Post } from "@/types/post";

const drawingBoardMocks = vi.hoisted(() => ({
  exportImageBlob: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/components/DrawingBoard", () => {
  const MockDrawingBoard = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      exportImageBlob: drawingBoardMocks.exportImageBlob,
      clear: drawingBoardMocks.clear,
    }));

    return <div data-testid="drawing-board" />;
  });

  MockDrawingBoard.displayName = "MockDrawingBoard";

  return {
    default: MockDrawingBoard,
  };
});

describe("LeaveNoteForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drawingBoardMocks.exportImageBlob.mockResolvedValue(
      new Blob(["fake-png"], { type: "image/png" })
    );

    vi.stubGlobal("fetch", vi.fn());
  });

  it("submits note + exported canvas image and pushes created post to parent", async () => {
    const user = userEvent.setup();
    const onPostCreated = vi.fn();
    const createdPost: Post = {
      id: "post-1",
      image_url: "https://cdn.example/post.png",
      note_text: "Hello from test",
      created_at: "2026-03-25T13:00:00.000Z",
    };

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ post: createdPost }),
    } as Response);

    render(<LeaveNoteForm onPostCreated={onPostCreated} />);

    await user.type(screen.getByLabelText(/short note/i), "  Hello from test  ");
    await user.click(screen.getByRole("button", { name: /post anonymously/i }));

    await waitFor(() => {
      expect(onPostCreated).toHaveBeenCalledWith(createdPost);
    });

    expect(drawingBoardMocks.exportImageBlob).toHaveBeenCalledTimes(1);
    expect(drawingBoardMocks.clear).toHaveBeenCalledTimes(1);

    const fetchCall = fetchMock.mock.calls[0];
    const requestOptions = fetchCall[1] as RequestInit;
    const parsedBody = JSON.parse(requestOptions.body as string) as {
      noteText: string;
      imageDataUrl: string;
    };

    expect(parsedBody.noteText).toBe("Hello from test");
    expect(parsedBody.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText(/your note is now live/i)).toBeInTheDocument();
  });

  it("shows validation error and blocks submit when note is empty after trim", async () => {
    const user = userEvent.setup();
    const onPostCreated = vi.fn();
    const fetchMock = vi.mocked(fetch);

    render(<LeaveNoteForm onPostCreated={onPostCreated} />);

    await user.type(screen.getByLabelText(/short note/i), "   ");
    await user.click(screen.getByRole("button", { name: /post anonymously/i }));

    expect(
      screen.getByText(/please enter a short note before posting/i)
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onPostCreated).not.toHaveBeenCalled();
  });
});
