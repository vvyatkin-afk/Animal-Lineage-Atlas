import type { LocalizableCoverage } from '../../packages/i18n/index.ts';

interface HubAtlasDocument {
  release: { data_version: string; build_date?: string };
  coverage: {
    taxon?: string;
    scope?: string;
    limitations?: string[];
    last_reviewed?: string;
    source_categories?: string[];
    translations?: LocalizableCoverage['translations'];
  };
  animals: unknown[];
  relationships: Array<{ type?: string; status?: string }>;
  sources: Array<{ source_type?: string }>;
  media?: Array<{ embedding_status?: string }>;
}

export const ATLAS_PATHS = {
  'red-panda': { path: '/atlas.red-panda/', name: 'Red panda' },
  'polar-bear': { path: '/atlas.polar-bear/', name: 'Polar bear' },
  hippopotamus: { path: '/atlas.hippopotamus/', name: 'Common hippopotamus' },
} as const;

export type HubAtlasInput = { id: keyof typeof ATLAS_PATHS; document: HubAtlasDocument };

function summarizeTranslations(translations: LocalizableCoverage['translations']) {
  if (!translations) return undefined;
  return Object.fromEntries(Object.entries(translations).map(([locale, content]) => [locale, {
    scope: content.scope,
    limitations: content.limitations.slice(0, 1),
  }])) as LocalizableCoverage['translations'];
}

export function buildHubCatalog(atlases: HubAtlasInput[]) {
  return atlases.map(({ id, document }) => {
    const sourceCategories = document.coverage.source_categories?.length
      ? [...document.coverage.source_categories]
      : [...new Set(document.sources.map((source) => source.source_type).filter((value): value is string => Boolean(value)))].sort();
    const relationshipTypes = [...new Set(document.relationships.map((relationship) => relationship.type).filter((value): value is string => Boolean(value)))].sort();
    const relationshipStatuses = [...new Set(document.relationships.map((relationship) => relationship.status).filter((value): value is string => Boolean(value)))].sort();
    return {
      id,
      name: ATLAS_PATHS[id].name,
      path: ATLAS_PATHS[id].path,
      taxon: document.coverage.taxon ?? '',
      scope: document.coverage.scope ?? '',
      coverageWarning: document.coverage.limitations?.[0] ?? 'Coverage is limited to the cited public records.',
      limitations: document.coverage.limitations ?? [],
      translations: summarizeTranslations(document.coverage.translations),
      animalCount: document.animals.length,
      relationshipCount: document.relationships.length,
      sourceCount: document.sources.length,
      linkOnlyMediaCount: document.media?.filter((item) => item.embedding_status !== 'allowed').length ?? 0,
      relationshipTypes,
      relationshipStatuses,
      sourceCategories,
      dataVersion: document.release.data_version,
      lastReviewed: document.coverage.last_reviewed ?? document.release.build_date ?? '',
    };
  });
}
