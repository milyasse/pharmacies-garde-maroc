// Squelette de chargement des résultats (même gabarit que les fiches) : l'écran ne « saute » pas à l'arrivée des données.
export function ResultsSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" aria-label={label} className="space-y-3 p-4 lg:px-6">
      <p className="sr-only" role="status">{label}</p>
      <div className="h-5 w-48 animate-pulse rounded bg-line" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-line" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((j) => <div key={j} className="h-12 animate-pulse rounded-lg bg-bg" />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((j) => <div key={j} className="h-10 animate-pulse rounded-xl bg-bg" />)}
          </div>
        </div>
      ))}
    </section>
  );
}
