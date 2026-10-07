import { buildGenealogy, type GraphAnimal, type GraphRelationship } from '../../packages/genealogy/layout.ts';
import { createViewState } from '../../packages/genealogy/state.ts';
import { getUiMessages, type UiMessages } from '../../packages/i18n/index.ts';
import { buildAtlasSearchIndex } from '../../packages/search/atlas-index.ts';
import { searchAnimals } from '../../packages/search/search.ts';
import { getProfileIdFromSearch, buildProfileModel, renderProfileDialog, type AtlasDocument } from '../../packages/ui/profile-dialog.ts';
import { renderGenealogy } from '../../packages/ui/genealogy-view.ts';
import { renderSearchResults } from '../../packages/ui/search-controls.ts';

type RuntimeAtlas = AtlasDocument & {
  release: { data_version: string; build_date: string };
  coverage: AtlasDocument['coverage'] & { taxon?: string; scope?: string; last_reviewed?: string; accent?: string };
};

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
  const resultCount = requiredElement<HTMLElement>('result-count');
  const searchResults = requiredElement<HTMLElement>('search-results');
  const graphContainer = requiredElement<HTMLElement>('genealogy-container');
  const dialog = requiredElement<HTMLDialogElement>('profile-dialog');
  const profileContent = requiredElement<HTMLElement>('profile-dialog').querySelector<HTMLElement>('[data-profile-content]');
  if (!profileContent) throw new Error('The profile content container is missing');
  const response = await fetch(`${basePath}runtime.json`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load atlas data (${response.status})`);
  const atlas = await response.json() as RuntimeAtlas;
  const speciesNameByTaxon: Record<string, string> = {
    'Ailurus fulgens': 'Red panda',
    'Ursus maritimus': 'Polar bear',
    'Hippopotamus amphibius': 'Common hippopotamus',
  };
  const speciesName = speciesNameByTaxon[atlas.coverage?.taxon ?? ''] ?? atlas.animals[0]?.taxon ?? 'Animal';
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
  const requestedProfile = getProfileIdFromSearch(window.location.search);
  const initialFocusId = atlas.animals.some((animal) => animal.id === requestedProfile)
    ? requestedProfile
    : atlas.animals[0]?.id ?? null;
  const state = createViewState({
    focusId: initialFocusId,
    filters: { query: '', countryCode: '', taxon: '' },
  });
  function labels(): UiMessages {
    const locale = languageSelect.value || 'en';
    return getUiMessages(locale);
  }

  function updateStaticLabels() {
    const copy = labels();
    document.documentElement.lang = languageSelect.value || 'en';
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

  function populateFacets() {
    const locale = languageSelect.value || 'en';
    const knownCountries = [...new Set(searchIndex.map((animal) => animal.country_code).filter((code): code is string => Boolean(code)))].sort();
    const knownTaxa = [...new Set(atlas.animals.map((animal) => animal.taxon))].sort();
    countrySelect.replaceChildren(new Option(labels().allCountries, ''));
    for (const code of knownCountries) countrySelect.add(new Option(localizedCountryName(code, locale), code));
    taxonSelect.replaceChildren(new Option(labels().allTaxa, ''));
    for (const taxon of knownTaxa) taxonSelect.add(new Option(taxon, taxon));
    countrySelect.value = String(state.get().filters.countryCode ?? '');
    taxonSelect.value = String(state.get().filters.taxon ?? '');
  }

  function renderTree() {
    const current = state.get();
    if (!current.focusId) return;
    const graph = buildGenealogy(graphAnimals, graphRelationships, current.focusId, { depth: 3, maxNodes: 180 });
    renderGenealogy(graphContainer, graph, current, labels(), openProfile, (patch) => { state.update(patch); });
  }

  function renderResults() {
    const current = state.get();
    const copy = labels();
    const matches = searchAnimals(searchIndex, String(current.filters.query ?? ''), {
      countryCode: String(current.filters.countryCode ?? ''),
      taxon: String(current.filters.taxon ?? ''),
    });
    resultCount.textContent = String(matches.length);
    renderSearchResults(searchResults, matches, languageSelect.value || 'en', copy, openProfile);
  }

  function syncDialog(animalId: string | null) {
    if (!animalId) {
      state.closeProfile();
      if (dialog.open) dialog.close();
      return;
    }
    const model = buildProfileModel(atlas, animalId, { locale: languageSelect.value || 'en' });
    if (!model) {
      dialog.querySelector<HTMLElement>('[data-profile-content]')!.textContent = labels().profileNotFound;
      if (!dialog.open) dialog.showModal();
      return;
    }
    renderProfileDialog(dialog, model, labels(), (relatedId) => openProfile(relatedId));
    if (!dialog.open) dialog.showModal();
    state.openProfile(animalId);
  }

  function setUrlProfile(animalId: string | null, replace = false) {
    const url = new URL(window.location.href);
    if (animalId) url.searchParams.set('animal', animalId);
    else url.searchParams.delete('animal');
    if (replace) window.history.replaceState(window.history.state, '', url);
    else window.history.pushState({ ...(window.history.state ?? {}), atlasProfile: Boolean(animalId) }, '', url);
  }

  function openProfile(animalId: string) {
    if (!atlas.animals.some((animal) => animal.id === animalId)) return;
    if (getProfileIdFromSearch(window.location.search) !== animalId) {
      setUrlProfile(animalId);
    }
    syncDialog(animalId);
  }

  function closeProfile() {
    setUrlProfile(null, true);
    state.closeProfile();
    if (dialog.open) dialog.close();
  }

  function renderCoverage() {
    const coverage = atlas.coverage ?? {};
    requiredElement<HTMLElement>('atlas-kind').textContent = `${speciesName} atlas`;
    requiredElement<HTMLElement>('atlas-title').textContent = `${speciesName} lineage`;
    requiredElement<HTMLElement>('atlas-scope').textContent = coverage.scope ?? '';
    requiredElement<HTMLElement>('coverage-scope').textContent = coverage.scope ?? '';
    requiredElement<HTMLElement>('animal-count').textContent = String(atlas.animals.length);
    const limitations = requiredElement<HTMLElement>('coverage-limitations');
    limitations.replaceChildren(...(coverage.limitations ?? []).map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    document.body.style.setProperty('--species-accent', coverage.accent ?? '#315e50');
    document.title = `${speciesName} · Animal Lineage Atlas`;
  }

  function renderAll() {
    updateStaticLabels();
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
  requiredElement('close-profile').addEventListener('click', closeProfile);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeProfile(); });
  window.addEventListener('popstate', () => {
    syncDialog(getProfileIdFromSearch(window.location.search));
  });

  renderCoverage();
  renderAll();
  if (requestedProfile) syncDialog(requestedProfile);
}

void boot().catch((error: unknown) => {
  const container = document.getElementById('genealogy-container');
  if (container) {
    container.textContent = error instanceof Error ? error.message : 'The atlas could not be loaded.';
    container.setAttribute('role', 'alert');
  }
});
