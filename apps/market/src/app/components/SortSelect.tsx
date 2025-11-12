'use client';

import { useMemo, type ChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface SortSelectProps {
  value: string;
  searchParams: string;
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'rating', label: 'Top rated' },
  { value: 'price', label: 'Price (low to high)' },
  { value: 'name', label: 'Name (A–Z)' },
];

export function SortSelect({ value, searchParams }: SortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const baseParams = useMemo(
    () => new URLSearchParams(searchParams),
    [searchParams],
  );

  const currentValue = SORT_OPTIONS.some((option) => option.value === value)
    ? value
    : 'rating';

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    const nextParams = new URLSearchParams(baseParams.toString());
    if (!nextValue || nextValue === 'rating') {
      nextParams.delete('sort');
    } else {
      nextParams.set('sort', nextValue);
    }
    nextParams.delete('page');
    const query = nextParams.toString();
    const destination = query ? `${pathname}?${query}` : pathname;
    (router.push as (href: string) => void)(destination);
  };

  return (
    <label className="text-sm font-medium text-slate-600">
      Sort by
      <select
        className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-900"
        value={currentValue}
        onChange={handleChange}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
