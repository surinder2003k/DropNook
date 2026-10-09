import { Suspense } from "react";
import ShareView from "./ShareView";

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Server wrapper for the public share page `/s/<slug>`.
 *
 * Next 16 (cacheComponents) requires `params` access to sit inside a
 * <Suspense> boundary during prerender — the async leaf awaits it so the
 * static shell can stream while the slug resolves. The client half gets the
 * slug as a prop, so it never needs useParams() either.
 */
export default function SharePage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center px-4">
          <p className="text-sm text-zinc-400">Loading...</p>
        </main>
      }
    >
      <ShareSlug params={params} />
    </Suspense>
  );
}

async function ShareSlug({ params }: PageProps) {
  const { slug } = await params;
  return <ShareView slug={slug} />;
}
