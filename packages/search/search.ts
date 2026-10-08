export interface SearchName {
  canonical: string;
  localized?: Array<{ value: string; language: string }>;
}

export interface SearchAlias {
  value: string;
  language?: string;
}

export interface AnimalSummary {
  id: string;
  taxon: string;
  population?: string;
  name: SearchName;
  aliases?: SearchAlias[];
  external_ids?: Array<{ namespace: string; value: string }>;
  country_code?: string | null;
  institution_names?: string[];
  /** A pre-normalized concatenation generated once when the compact index loads. */
  search_key?: string;
  /** Relative URL for the full canonical details, present in the runtime index only. */
  detail_chunk?: string;
}

export interface SearchFacets {
  countryCode?: string;
  taxon?: string;
  population?: string;
}

/** Normalize only the search key; the source display string is never rewritten. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ');
}

function searchableValues(animal: AnimalSummary): string[] {
  return [
    animal.id,
    animal.taxon,
    animal.population ?? '',
    animal.name?.canonical ?? '',
    ...(animal.name?.localized ?? []).map((name) => name.value),
    ...(animal.aliases ?? []).map((alias) => alias.value),
    ...(animal.external_ids ?? []).flatMap((item) => [item.namespace, item.value, `${item.namespace}:${item.value}`]),
    ...(animal.institution_names ?? []),
  ];
}

export function createAnimalSearchKey(animal: AnimalSummary): string {
  return searchableValues(animal).map(normalizeSearchKey).filter(Boolean).join('\u0000');
}

export function searchAnimals<T extends AnimalSummary>(
  index: T[],
  query: string,
  facets: SearchFacets = {},
): T[] {
  const normalizedQuery = normalizeSearchKey(query);
  const country = normalizeSearchKey(facets.countryCode ?? '');
  const taxon = normalizeSearchKey(facets.taxon ?? '');
  const population = normalizeSearchKey(facets.population ?? '');

  return index.filter((animal) => {
    if (country && normalizeSearchKey(animal.country_code ?? '') !== country) return false;
    if (taxon && normalizeSearchKey(animal.taxon) !== taxon) return false;
    if (population && normalizeSearchKey(animal.population ?? '') !== population) return false;
    if (!normalizedQuery) return true;
    return (animal.search_key ?? createAnimalSearchKey(animal)).includes(normalizedQuery);
  });
}
