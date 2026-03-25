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
    return <p className="text-sm text-slate-600">Loading notes...</p>;
  }

  if (posts.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No posts yet. Be the first to leave a note.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <article
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          key={post.id}
        >
          <img
            alt="Anonymous drawing"
            className="w-full rounded-md border border-slate-200 bg-white"
            src={post.image_url}
          />
          <p className="whitespace-pre-wrap text-sm text-slate-800">{post.note_text}</p>
          <p className="text-xs text-slate-500">{formatTimestamp(post.created_at)}</p>
        </article>
      ))}
    </div>
  );
}
