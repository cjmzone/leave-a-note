"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import PostFeed from "@/components/PostFeed";
import type { Post } from "@/types/post";

const LeaveNoteForm = dynamic(() => import("@/components/LeaveNoteForm"), {
  ssr: false,
});

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setIsLoading(true);
      setFeedError(null);

      const response = await fetch("/api/posts", {
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load posts.");
      }

      setPosts((payload?.posts as Post[]) ?? []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load posts.";
      setFeedError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  function handlePostCreated(post: Post) {
    setPosts((currentPosts) => [post, ...currentPosts]);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Leave a Note</h1>
        <p className="text-sm text-slate-600">
          Anonymous drawings and short notes. One post per IP address each UTC day.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Create a post</h2>
        <LeaveNoteForm onPostCreated={handlePostCreated} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Public feed</h2>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={loadPosts}
            type="button"
          >
            Refresh
          </button>
        </div>

        {feedError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {feedError}
          </p>
        ) : null}

        <PostFeed isLoading={isLoading} posts={posts} />
      </section>
    </main>
  );
}
