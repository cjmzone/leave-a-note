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
        throw new Error(
          payload?.error ??
            `Could not load posts (HTTP ${response.status}). Check server logs for details.`
        );
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
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:pb-20">
      <header className="space-y-3 text-center sm:text-left">
        <p className="inline-flex border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold tracking-wide text-sky-700">
          Anonymous Public Canvas
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Leave a Note
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-slate-600 sm:mx-0 sm:text-base">
          Anonymous drawings and short notes. One post per IP address each UTC day.
        </p>
      </header>

      <section className="border border-sky-200/70 bg-white/90 p-4 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.6)] backdrop-blur sm:p-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Draw and post
          </h2>
          <p className="text-sm text-slate-600">
            Make your sketch, add a short note, and publish instantly.
          </p>
        </div>
        <LeaveNoteForm onPostCreated={handlePostCreated} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Public feed
          </h2>
          <button
            className="border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            onClick={loadPosts}
            type="button"
          >
            Refresh
          </button>
        </div>

        {feedError ? (
          <p className="border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {feedError}
          </p>
        ) : null}

        <PostFeed isLoading={isLoading} posts={posts} />
      </section>
    </main>
  );
}
