export default function ReservationsLoading() {
  return (
    <div className="p-6 space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-24 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-9 w-28 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-9 w-28 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-7 w-16 rounded-full bg-gray-200 animate-pulse" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-56 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-9 w-40 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-9 w-24 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-3">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="space-y-2 px-4 py-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-xl border px-4 py-3 animate-pulse"
            >
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="h-3 w-32 rounded bg-gray-100" />
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-16 rounded bg-gray-100" />
                <div className="h-8 w-16 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
