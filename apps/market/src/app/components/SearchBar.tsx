export function SearchBar() {
  return (
    <form
      aria-label="Search venues"
      className="flex w-full max-w-2xl items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60"
    >
      <div className="flex flex-col flex-1">
        <label
          htmlFor="market-search"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Search
        </label>
        <input
          id="market-search"
          name="q"
          type="search"
          placeholder="Find a city, cuisine, or venue"
          className="w-full border-0 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          autoComplete="off"
          disabled
        />
      </div>
      <button
        type="submit"
        disabled
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        Coming Soon
      </button>
    </form>
  );
}
