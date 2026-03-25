/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostFeed from "@/components/PostFeed";

describe("PostFeed", () => {
  it("renders feed items with image, note text, and timestamp", () => {
    render(
      <PostFeed
        isLoading={false}
        posts={[
          {
            id: "post-1",
            image_url: "https://cdn.example/1.png",
            note_text: "First note",
            created_at: "2026-03-25T13:00:00.000Z",
          },
          {
            id: "post-2",
            image_url: "https://cdn.example/2.png",
            note_text: "Second note",
            created_at: "2026-03-24T13:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("First note")).toBeInTheDocument();
    expect(screen.getByText("Second note")).toBeInTheDocument();
    expect(screen.getAllByAltText(/anonymous drawing/i)).toHaveLength(2);
  });

  it("shows empty-state messaging when there are no posts", () => {
    render(<PostFeed isLoading={false} posts={[]} />);

    expect(
      screen.getByText(/no posts yet\. be the first to leave a note/i)
    ).toBeInTheDocument();
  });
});
