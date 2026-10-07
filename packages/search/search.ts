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
  name: SearchName;
  aliases?: SearchAlias[];
  external_ids?: Array<{ namespace: string; value: string }>;
  country_code?: string | null;
  institution_names?: string[];
}

export interface SearchFacets {
  countryCode?: string;
  taxon?: string;
}

/** Normalize only the search key; the source display string is never rewritten. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/gu, ' ');
}

function searchableValues(animal: AnimalSummary): string[] {
  return [
    animal.id,
    animal.taxon,
    animal.name?.canonical ?? '',
    ...(animal.name?.localized ?? []).map((name) => name.value),
    ...(animal.aliases ?? []).map((alias) => alias.value),
    ...(animal.external_ids ?? []).flatMap((item) => [item.namespace, item.value, `${item.namespace}:${item.value}`]),
    ...(animal.institution_names ?? []),
  ];
}

export function searchAnimals<T extends AnimalSummary>(
  index: T[],
  query: string,
  facets: SearchFacets = {},
): T[] {
  const normalizedQuery = normalizeSearchKey(query);
  const country = normalizeSearchKey(facets.countryCode ?? '');
  const taxon = normalizeSearchKey(facets.taxon ?? '');

  return index.filter((animal) => {
    if (country && normalizeSearchKey(animal.country_code ?? '') !== country) return false;
    if (taxon && normalizeSearchKey(animal.taxon) !== taxon) return false;
    if (!normalizedQuery) return true;
    return searchableValues(animal).some((value) => normalizeSearchKey(value).includes(normalizedQuery));
  });
}
