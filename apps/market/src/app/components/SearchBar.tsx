interface SearchBarProps {
  initialQuery?: string;
  city?: string[];
  cuisine?: string[];
  priceLevel?: number[];
  sort?: string;
}

export function SearchBar({
  initialQuery = '',
  city = [],
  cuisine = [],
  priceLevel = [],
  sort,
}: SearchBarProps) {
  return (
    <form
      method="get"
      action="/"
      aria-label="Search venues"
      className="flex w-full max-w-2xl items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60"
    >
      <div className="flex flex-1 flex-col">
        <label
          htmlFor="market-search"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Search
        </label>
        <input
          id="market-search"
          name="query"
          type="search"
          placeholder="Find a city, cuisine, or venue"
          className="w-full border-0 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          autoComplete="off"
          defaultValue={initialQuery}
        />
      </div>
      <button
        type="submit"
        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Search
      </button>

      {city.map((value) => (
        <input key={`city-${value}`} type="hidden" name="city" value={value} />
      ))}
      {cuisine.map((value) => (
        <input
          key={`cuisine-${value}`}
          type="hidden"
          name="cuisine"
          value={value}
        />
      ))}
      {priceLevel.map((value) => (
        <input
          key={`price-${value}`}
          type="hidden"
          name="priceLevel"
          value={value}
        />
      ))}
      {sort && sort !== 'rating' ? (
        <input type="hidden" name="sort" value={sort} />
      ) : null}
    </form>
  );
}
