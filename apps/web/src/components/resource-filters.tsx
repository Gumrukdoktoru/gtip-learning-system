import { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABELS } from '@gtip/shared';
import type { ResourceCategory } from '@gtip/shared';
import { useEffect, useState } from 'react';

export interface ResourceFiltersValue {
  search: string;
  category: ResourceCategory | '';
}

export interface ResourceFiltersProps {
  value: ResourceFiltersValue;
  onChange: (value: ResourceFiltersValue) => void;
}

/** Search box and category picker; the search term is debounced. */
export function ResourceFilters({
  value,
  onChange,
}: ResourceFiltersProps): JSX.Element {
  const [searchDraft, setSearchDraft] = useState(value.search);

  useEffect(() => {
    setSearchDraft(value.search);
  }, [value.search]);

  useEffect(() => {
    if (searchDraft === value.search) {
      return;
    }

    const timer = window.setTimeout(() => {
      onChange({ ...value, search: searchDraft });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchDraft, value, onChange]);

  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="resource-search">
          Ara
        </label>
        <input
          id="resource-search"
          type="search"
          className="field"
          placeholder="Başlık, açıklama veya dosya adı"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      </div>

      <div className="sm:w-56">
        <label className="label" htmlFor="resource-category">
          Kategori
        </label>
        <select
          id="resource-category"
          className="field"
          value={value.category}
          onChange={(event) =>
            onChange({
              ...value,
              category: event.target.value as ResourceCategory | '',
            })
          }
        >
          <option value="">Tümü</option>
          {RESOURCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {RESOURCE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
