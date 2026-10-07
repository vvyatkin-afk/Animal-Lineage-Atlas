import type { AnimalSummary } from './search.ts';

interface IndexedAnimal extends AnimalSummary {
  country_code: string | null;
  institution_names: string[];
}

interface AtlasSearchDocument {
  animals: AnimalSummary[];
  institutions?: Array<{
    id: string;
    names: Array<{ value: string }>;
    country_code?: string;
  }>;
  events: Array<{
    animal_id: string;
    date?: { precision?: string; value?: string; start?: string; end?: string };
    institution_id?: string;
    from_institution_id?: string;
    to_institution_id?: string;
  }>;
}

function sortKey(event: AtlasSearchDocument['events'][number]): string {
  return event.date?.value ?? event.date?.end ?? event.date?.start ?? '';
}

/** Add searchable facility history and a last documented destination facet to each animal. */
export function buildAtlasSearchIndex(atlas: AtlasSearchDocument): IndexedAnimal[] {
  const institutions = new Map((atlas.institutions ?? []).map((institution) => [institution.id, institution]));
  const countryByAnimal = new Map<string, string>();
  const institutionNamesByAnimal = new Map<string, Set<string>>();
  for (const event of [...atlas.events].sort((left, right) => sortKey(left).localeCompare(sortKey(right)))) {
    const allInstitutionIds = [event.from_institution_id, event.to_institution_id, event.institution_id]
      .filter((id): id is string => Boolean(id));
    const searchNames = institutionNamesByAnimal.get(event.animal_id) ?? new Set<string>();
    for (const id of allInstitutionIds) {
      const institution = institutions.get(id);
      for (const name of institution?.names ?? []) searchNames.add(name.value);
    }
    institutionNamesByAnimal.set(event.animal_id, searchNames);

    const documentedDestination = event.to_institution_id ?? event.institution_id;
    const destination = documentedDestination ? institutions.get(documentedDestination) : undefined;
    if (destination?.country_code) countryByAnimal.set(event.animal_id, destination.country_code);
  }
  return atlas.animals.map((animal) => ({
    ...animal,
    country_code: countryByAnimal.get(animal.id) ?? null,
    institution_names: [...(institutionNamesByAnimal.get(animal.id) ?? [])],
  }));
}
