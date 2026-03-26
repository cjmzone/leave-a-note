import type { Post } from "@/types/post";

type PostFeedProps = {
  posts: Post[];
  isLoading: boolean;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function PostFeed({ posts, isLoading }: PostFeedProps) {
  if (isLoading) {
    return (
      <div className="border border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-600">
        Loading notes...
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="border border-slate-200 bg-white/85 p-5 text-sm text-slate-600">
        No posts yet. Be the first to leave a note.
      </p>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {posts.map((post) => (
        <article
          className="space-y-3 border border-slate-200 bg-white/95 p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.6)] sm:p-5"
          key={post.id}
        >
          <img
            alt="Anonymous drawing"
            className="w-full border border-slate-200 bg-white"
            src={post.image_url}
          />
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {post.note_text}
          </p>
          <p className="text-xs font-medium tracking-wide text-slate-500">
            {formatTimestamp(post.created_at)}
          </p>
        </article>
      ))}
    </div>
  );
}
