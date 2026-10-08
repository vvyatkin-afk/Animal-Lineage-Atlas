import { buildFocusedGenealogy, createGenealogyIndex, type GraphAnimal, type GraphRelationship } from '../../packages/genealogy/layout.ts';
import { createViewState } from '../../packages/genealogy/state.ts';
import { getLocalizedCoverage, getUiMessages, type UiMessages } from '../../packages/i18n/index.ts';
import { createLocalResolver, resolvePublicMedia, type LocalMediaManifest, type MediaReference, type MediaResult } from '../../packages/media/resolver.ts';
import { buildAtlasSearchIndex } from '../../packages/search/atlas-index.ts';
import { searchAnimals } from '../../packages/search/search.ts';
import { getProfileIdFromSearch, buildProfileModel, renderProfileDialog, type AtlasDocument } from '../../packages/ui/profile-dialog.ts';
import { renderGenealogy, renderGlobalOverview } from '../../packages/ui/genealogy-view.ts';
import { renderSearchResults } from '../../packages/ui/search-controls.ts';

type RuntimeAnimal = AtlasDocument['animals'][number] & {
  country_code: string | null;
  institution_names: string[];
  detail_chunk: string;
  population?: string;
};

type RuntimeAtlas = {
  format: 'animal-lineage-atlas-runtime-index-v1';
  animals: RuntimeAnimal[];
  relationships: AtlasDocument['relationships'];
  coverage: AtlasDocument['coverage'] & { taxon?: string; scope?: string; last_reviewed?: string; accent?: string };
  release: { data_version: string; build_date: string };
};

type DetailChunk = Pick<AtlasDocument, 'animals' | 'events' | 'claims' | 'institutions' | 'media' | 'sources'>;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required atlas element #${id} is missing`);
  return element as T;
}

function localizedCountryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function boot() {
  const atlasId = document.body.dataset.atlas ?? 'red-panda';
  const basePath = document.body.dataset.basePath ?? '/atlas.red-panda/';
  const appStorageKey = `animal-lineage-atlas:${atlasId}:v1`;
  const languageSelect = requiredElement<HTMLSelectElement>('language-select');
  const queryInput = requiredElement<HTMLInputElement>('search-input');
  const countrySelect = requiredElement<HTMLSelectElement>('country-filter');
  const taxonSelect = requiredElement<HTMLSelectElement>('taxon-filter');
  const populationSelect = requiredElement<HTMLSelectElement>('population-filter');
  const resultCount = requiredElement<HTMLElement>('result-count');
  const searchResults = requiredElement<HTMLElement>('search-results');
  const graphContainer = requiredElement<HTMLElement>('genealogy-container');
  const dialog = requiredElement<HTMLDialogElement>('profile-dialog');
  const profileContent = requiredElement<HTMLElement>('profile-dialog').querySelector<HTMLElement>('[data-profile-content]');
  if (!profileContent) throw new Error('The profile content container is missing');
  const profileContentElement = profileContent as HTMLElement;
  const response = await fetch(`${basePath}runtime.json`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load atlas data (${response.status})`);
  const atlas = await response.json() as RuntimeAtlas;
  let resolveLocalMedia: ((reference: Pick<MediaReference, 'media_id'>) => MediaResult) | null = null;
  try {
    const manifestResponse = await fetch(`${basePath}local-media-manifest.json`, { credentials: 'same-origin' });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json() as LocalMediaManifest;
      if (manifest.format === 'animal-lineage-atlas-local-media-manifest-v1' && Array.isArray(manifest.items)) {
        resolveLocalMedia = createLocalResolver(manifest);
      }
    }
  } catch {
    // A missing optional offline manifest leaves the public media resolver in use.
  }
  const mediaResolver = (reference: MediaReference): MediaResult => {
    const local = resolveLocalMedia?.(reference);
    return local?.kind === 'local' ? local : resolvePublicMedia(reference);
  };
  const speciesNameKeyByTaxon: Record<string, keyof UiMessages> = {
    'Ailurus fulgens': 'redPandaSpeciesName',
    'Ursus maritimus': 'polarBearSpeciesName',
    'Hippopotamus amphibius': 'hippopotamusSpeciesName',
  };
  const speciesNameKey = speciesNameKeyByTaxon[atlas.coverage?.taxon ?? ''];
  const localeFromStorage = (() => {
    try {
      const saved = localStorage.getItem(appStorageKey);
      return saved && ['en', 'ja', 'ru'].includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  })();
  languageSelect.value = localeFromStorage;

  const searchIndex = buildAtlasSearchIndex(atlas);
  const animalById = new Map(searchIndex.map((animal) => [animal.id, animal]));
  const graphAnimals: GraphAnimal[] = searchIndex.map((animal) => ({
    id: animal.id,
    name: { canonical: animal.name.canonical },
    country_code: animal.country_code,
  }));
  const graphRelationships: GraphRelationship[] = atlas.relationships.map((relationship) => ({
    id: relationship.id,
    subject: relationship.subject,
    object: relationship.object,
    type: relationship.type as GraphRelationship['type'],
    status: relationship.status as GraphRelationship['status'],
    source_ids: relationship.source_ids,
  }));
  const graphIndex = createGenealogyIndex(graphAnimals, graphRelationships);
  const requestedProfile = getProfileIdFromSearch(window.location.search);
  const initialFocusId = animalById.has(requestedProfile ?? '')
    ? requestedProfile
    : null;
  const state = createViewState({
    focusId: initialFocusId,
    filters: { query: '', countryCode: '', taxon: '', population: '' },
  });
  const detailCache = new Map<string, Promise<DetailChunk>>();
  let profileRequestVersion = 0;
  function labels(): UiMessages {
    const locale = languageSelect.value || 'en';
    return getUiMessages(locale);
  }

  function updateStaticLabels() {
    const copy = labels();
    document.documentElement.lang = languageSelect.value || 'en';
    document.title = copy.appTitle;
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n as keyof UiMessages | undefined;
      if (key && key in copy) node.textContent = copy[key];
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
      const key = node.dataset.i18nPlaceholder as keyof UiMessages | undefined;
      if (key && key in copy && node instanceof HTMLInputElement) node.placeholder = copy[key];
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
      const key = node.dataset.i18nAriaLabel as keyof UiMessages | undefined;
      if (key && key in copy) node.setAttribute('aria-label', copy[key]);
    }
    requiredElement<HTMLElement>('pan-left').setAttribute('aria-label', copy.panLeftLabel);
    requiredElement<HTMLElement>('pan-left').title = copy.panLeftLabel;
    requiredElement<HTMLElement>('pan-right').setAttribute('aria-label', copy.panRightLabel);
    requiredElement<HTMLElement>('pan-right').title = copy.panRightLabel;
    requiredElement<HTMLElement>('pan-up').setAttribute('aria-label', copy.panUpLabel);
    requiredElement<HTMLElement>('pan-up').title = copy.panUpLabel;
    requiredElement<HTMLElement>('pan-down').setAttribute('aria-label', copy.panDownLabel);
    requiredElement<HTMLElement>('pan-down').title = copy.panDownLabel;
    requiredElement<HTMLElement>('zoom-in').setAttribute('aria-label', copy.zoomInLabel);
    requiredElement<HTMLElement>('zoom-in').title = copy.zoomInLabel;
    requiredElement<HTMLElement>('zoom-out').setAttribute('aria-label', copy.zoomOutLabel);
    requiredElement<HTMLElement>('zoom-out').title = copy.zoomOutLabel;
  }

  const populationLabelKeys: Record<string, keyof UiMessages> = {
    wild: 'wildPopulationLabel',
    zoo_captive: 'zooPopulationLabel',
    other_managed: 'otherManagedPopulationLabel',
    unknown: 'unknownPopulationLabel',
  };

  function localizedPopulationLabel(population: string): string {
    const key = populationLabelKeys[population];
    return key ? labels()[key] : population.replaceAll('_', ' ');
  }

  function populateFacets() {
    const locale = languageSelect.value || 'en';
    const knownCountries = [...new Set(searchIndex.map((animal) => animal.country_code).filter((code): code is string => Boolean(code)))].sort();
    const knownTaxa = [...new Set(atlas.animals.map((animal) => animal.taxon))].sort();
    const knownPopulations = [...new Set(searchIndex.map((animal) => animal.population).filter((value): value is string => Boolean(value)))].sort();
    countrySelect.replaceChildren(new Option(labels().allCountries, ''));
    for (const code of knownCountries) countrySelect.add(new Option(localizedCountryName(code, locale), code));
    taxonSelect.replaceChildren(new Option(labels().allTaxa, ''));
    for (const taxon of knownTaxa) taxonSelect.add(new Option(taxon, taxon));
    populationSelect.replaceChildren(new Option(labels().allPopulations, ''));
    for (const population of knownPopulations) populationSelect.add(new Option(localizedPopulationLabel(population), population));
    countrySelect.value = String(state.get().filters.countryCode ?? '');
    taxonSelect.value = String(state.get().filters.taxon ?? '');
    populationSelect.value = String(state.get().filters.population ?? '');
  }

  function renderTree() {
    const renderStarted = performance.now();
    const current = state.get();
    const controls = requiredElement<HTMLElement>('graph-controls');
    const allFamilies = requiredElement<HTMLButtonElement>('all-families');
    if (!current.focusId) {
      controls.hidden = true;
      allFamilies.hidden = true;
      renderGlobalOverview(graphContainer, graphIndex, {
        globalIndexSummary: labels().globalIndexSummary,
        globalOverviewAriaLabel: labels().globalOverviewAriaLabel,
        largestFamiliesLabel: labels().largestFamiliesLabel,
        familyAnimalsLabel: labels().familyAnimalsLabel,
      }, (animalId) => {
        state.update({ focusId: animalId, zoom: 1, pan: { x: 0, y: 0 } });
        renderTree();
      });
      graphContainer.dataset.graphRenderMs = (performance.now() - renderStarted).toFixed(3);
      return;
    }
    controls.hidden = false;
    allFamilies.hidden = false;
    const mobile = window.matchMedia('(max-width: 560px)').matches;
    const graph = buildFocusedGenealogy(graphIndex, current.focusId, {
      depth: mobile ? 2 : 3,
      maxNodes: mobile ? 72 : 180,
    });
    renderGenealogy(graphContainer, graph, current, labels(), openProfile, (patch) => { state.update(patch); });
    graphContainer.dataset.graphRenderMs = (performance.now() - renderStarted).toFixed(3);
  }

  function renderResults() {
    const renderStarted = performance.now();
    const current = state.get();
    const copy = labels();
    const matches = searchAnimals(searchIndex, String(current.filters.query ?? ''), {
      countryCode: String(current.filters.countryCode ?? ''),
      taxon: String(current.filters.taxon ?? ''),
      population: String(current.filters.population ?? ''),
    });
    resultCount.textContent = String(matches.length);
    renderSearchResults(searchResults, matches, languageSelect.value || 'en', copy, jumpToAnimal);
    searchResults.dataset.searchRenderMs = (performance.now() - renderStarted).toFixed(3);
  }

  function jumpToAnimal(animalId: string) {
    if (!animalById.has(animalId)) return;
    state.update({ focusId: animalId, zoom: 1, pan: { x: 0, y: 0 } });
    renderTree();
    openProfile(animalId);
  }

  function profileDocument(detail: DetailChunk, animalId: string): AtlasDocument {
    const incident = graphIndex.incidentRelationshipsByAnimal.get(animalId) ?? [];
    const counterpartIds = new Set(incident.flatMap((relationship) => [relationship.subject, relationship.object]));
    const animals = detail.animals.filter((animal) => animal.id === animalId);
    for (const counterpartId of counterpartIds) {
      if (counterpartId === animalId) continue;
      const counterpart = animalById.get(counterpartId);
      if (counterpart) animals.push(counterpart as AtlasDocument['animals'][number]);
    }
    return {
      animals,
      relationships: incident,
      events: detail.events.filter((event) => event.animal_id === animalId),
      claims: detail.claims.filter((claim) => claim.subject === animalId),
      institutions: detail.institutions,
      media: detail.media.filter((item) => item.animal_id === animalId),
      sources: detail.sources,
      coverage: atlas.coverage,
    };
  }

  function loadDetailChunk(path: string): Promise<DetailChunk> {
    const cached = detailCache.get(path);
    if (cached) {
      detailCache.delete(path);
      detailCache.set(path, cached);
      return cached;
    }
    const request = fetch(`${basePath}${path}`, { credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load profile details (${response.status})`);
      return await response.json() as DetailChunk;
    });
    detailCache.set(path, request);
    while (detailCache.size > 4) {
      const oldestKey = detailCache.keys().next().value as string | undefined;
      if (oldestKey) detailCache.delete(oldestKey);
      else break;
    }
    void request.catch(() => {
      if (detailCache.get(path) === request) detailCache.delete(path);
    });
    return request;
  }

  async function syncDialog(animalId: string | null) {
    const profileOpenStarted = performance.now();
    const requestVersion = ++profileRequestVersion;
    if (!animalId) {
      state.closeProfile();
      dialog.removeAttribute('aria-label');
      if (dialog.open) dialog.close();
      return;
    }
    const summary = animalById.get(animalId);
    if (!summary) {
      profileContentElement.textContent = labels().profileNotFound;
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) dialog.showModal();
    dialog.setAttribute('aria-label', summary.name.canonical);
    state.openProfile(animalId);
    profileContentElement.textContent = summary.name.canonical;
    try {
      if (!summary.detail_chunk) throw new Error('The profile details location is missing');
      const detail = await loadDetailChunk(summary.detail_chunk);
      if (requestVersion !== profileRequestVersion) return;
      const model = buildProfileModel(profileDocument(detail, animalId), animalId, {
        locale: languageSelect.value || 'en', mediaResolver,
      });
      renderProfileDialog(dialog, model, labels(), (relatedId) => openProfile(relatedId));
      dialog.removeAttribute('aria-label');
      dialog.dataset.profileOpenMs = (performance.now() - profileOpenStarted).toFixed(3);
    } catch {
      if (requestVersion === profileRequestVersion) {
        profileContentElement.textContent = labels().profileLoadFailed;
        dialog.dataset.profileOpenMs = (performance.now() - profileOpenStarted).toFixed(3);
      }
    }
  }

  function setUrlProfile(animalId: string | null, replace = false) {
    const url = new URL(window.location.href);
    if (animalId) url.searchParams.set('animal', animalId);
    else url.searchParams.delete('animal');
    if (replace) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState({ ...(window.history.state ?? {}), atlasProfile: Boolean(animalId) }, '', url);
  }

  function openProfile(animalId: string) {
    if (!animalById.has(animalId)) return;
    if (getProfileIdFromSearch(window.location.search) !== animalId) {
      setUrlProfile(animalId);
    }
    syncDialog(animalId);
  }

  function closeProfile() {
    profileRequestVersion += 1;
    setUrlProfile(null, true);
    state.closeProfile();
    dialog.removeAttribute('aria-label');
    if (dialog.open) dialog.close();
  }

  function renderCoverage() {
    const coverage = atlas.coverage ?? {};
    const copy = labels();
    const localizedCoverage = getLocalizedCoverage(coverage, languageSelect.value || 'en');
    const speciesName = speciesNameKey ? copy[speciesNameKey] : atlas.animals[0]?.taxon ?? 'Animal';
    requiredElement<HTMLElement>('atlas-kind').textContent = copy.atlasKindTemplate.replace('{species}', speciesName);
    requiredElement<HTMLElement>('atlas-title').textContent = copy.lineageTitleTemplate.replace('{species}', speciesName);
    requiredElement<HTMLElement>('atlas-scope').textContent = localizedCoverage.scope;
    requiredElement<HTMLElement>('coverage-scope').textContent = localizedCoverage.scope;
    requiredElement<HTMLElement>('animal-count').textContent = String(atlas.animals.length);
    const limitations = requiredElement<HTMLElement>('coverage-limitations');
    limitations.replaceChildren(...localizedCoverage.limitations.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    document.body.style.setProperty('--species-accent', coverage.accent ?? '#315e50');
    document.title = `${speciesName} · ${copy.appTitle}`;
  }

  function renderAll() {
    updateStaticLabels();
    renderCoverage();
    populateFacets();
    renderResults();
    renderTree();
    const activeProfileId = state.get().activeProfileId;
    if (activeProfileId) syncDialog(activeProfileId);
  }

  requiredElement<HTMLFormElement>('search-form').addEventListener('submit', (event) => event.preventDefault());
  queryInput.addEventListener('input', () => {
    state.update({ filters: { query: queryInput.value } });
    renderResults();
  });
  countrySelect.addEventListener('change', () => {
    state.update({ filters: { countryCode: countrySelect.value } });
    renderResults();
  });
  taxonSelect.addEventListener('change', () => {
    state.update({ filters: { taxon: taxonSelect.value } });
    renderResults();
  });
  populationSelect.addEventListener('change', () => {
    state.update({ filters: { population: populationSelect.value } });
    renderResults();
  });
  languageSelect.addEventListener('change', () => {
    try { localStorage.setItem(appStorageKey, languageSelect.value); } catch { /* storage may be disabled */ }
    renderAll();
  });
  const adjustPan = (x: number, y: number) => {
    const pan = state.get().pan;
    state.update({ pan: { x: pan.x + x, y: pan.y + y } });
    renderTree();
  };
  const adjustZoom = (difference: number) => {
    const zoom = state.get().zoom;
    state.update({ zoom: Math.max(0.45, Math.min(2.5, zoom + difference)) });
    renderTree();
  };
  requiredElement('pan-left').addEventListener('click', () => adjustPan(42, 0));
  requiredElement('pan-right').addEventListener('click', () => adjustPan(-42, 0));
  requiredElement('pan-up').addEventListener('click', () => adjustPan(0, 42));
  requiredElement('pan-down').addEventListener('click', () => adjustPan(0, -42));
  requiredElement('zoom-in').addEventListener('click', () => adjustZoom(0.12));
  requiredElement('zoom-out').addEventListener('click', () => adjustZoom(-0.12));
  requiredElement('all-families').addEventListener('click', () => {
    state.update({ focusId: null, zoom: 1, pan: { x: 0, y: 0 } });
    renderTree();
  });
  requiredElement('close-profile').addEventListener('click', closeProfile);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeProfile(); });
  window.addEventListener('popstate', () => {
    void syncDialog(getProfileIdFromSearch(window.location.search));
  });
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (!state.get().focusId || resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      renderTree();
    });
  }, { passive: true });

  renderAll();
  if (requestedProfile) void syncDialog(requestedProfile);
}

void boot().catch((error: unknown) => {
  const container = document.getElementById('genealogy-container');
  if (container) {
    container.textContent = error instanceof Error ? error.message : 'The atlas could not be loaded.';
    container.setAttribute('role', 'alert');
  }
});
