/**
 * Shown instantly while a list page's server data loads (chain reads take a few hundred ms).
 * Only used on routes that never call notFound(): a streamed loading state would turn a 404 into a 200.
 */
export function PageLoading() {
  return (
    <div className="py-12" aria-busy="true" aria-live="polite">
      <p className="sp-label">LOADING</p>
      <div className="sp-skel mt-6 h-16 w-2/3" />
      <div className="sp-skel mt-8 h-40" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sp-skel h-28" />
        <div className="sp-skel h-28" />
      </div>
    </div>
  )
}
