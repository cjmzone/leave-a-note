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

  it("opens a dismissible modal for the one-post-per-day rate-limit case", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "You can only create one post per day." }),
    } as Response);

    render(<LeaveNoteForm onPostCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/short note/i), "Rate limit test");
    await user.click(screen.getByRole("button", { name: /post anonymously/i }));

    expect(
      await screen.findByText("Sorry, you can only make one post a day.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(
      screen.queryByText("Sorry, you can only make one post a day.")
    ).not.toBeInTheDocument();
  });

  it("keeps non-rate-limit errors as inline messages", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Failed to save post." }),
    } as Response);

    render(<LeaveNoteForm onPostCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/short note/i), "Server error test");
    await user.click(screen.getByRole("button", { name: /post anonymously/i }));

    expect(await screen.findByText("Failed to save post.")).toBeInTheDocument();
    expect(
      screen.queryByText("Sorry, you can only make one post a day.")
    ).not.toBeInTheDocument();
  });

  it("does not open the rate-limit modal for infra-style 429 responses", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: "Failed to verify rate limit. code=7500 | internal error; reference=abc123",
      }),
    } as Response);

    render(<LeaveNoteForm onPostCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/short note/i), "Infra 429 test");
    await user.click(screen.getByRole("button", { name: /post anonymously/i }));

    expect(
      await screen.findByText(/failed to verify rate limit/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sorry, you can only make one post a day.")
    ).not.toBeInTheDocument();
  });
});
