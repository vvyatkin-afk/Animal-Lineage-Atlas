import { getLocalizedCoverage, getSourceCategoryLabel, getUiMessages, type UiMessages } from '../../packages/i18n/index.ts';
import type { buildHubCatalog } from './catalog.ts';

type HubCard = ReturnType<typeof buildHubCatalog>[number];

function text(key: keyof UiMessages, copy: UiMessages): string {
  return copy[key];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function renderCard(card: HubCard, copy: UiMessages, locale: string): string {
  const coverage = getLocalizedCoverage({
    scope: card.scope,
    limitations: card.limitations,
    translations: card.translations,
  }, locale);
  const categories = card.sourceCategories.map((category) => `<li>${escapeHtml(getSourceCategoryLabel(category, locale))}</li>`).join('');
  return `<article class="atlas-card" data-atlas-id="${escapeHtml(card.id)}">
    <div class="card-topline"><span class="atlas-index">${escapeHtml(card.id.replaceAll('-', ' '))}</span><span class="data-version">${escapeHtml(text('dataVersionLabel', copy))} ${escapeHtml(card.dataVersion)}</span></div>
    <h3>${escapeHtml(card.name)}</h3><p class="taxon"><span>${escapeHtml(text('taxonomyLabel', copy))}</span> <i>${escapeHtml(card.taxon)}</i></p>
    <p class="card-scope">${escapeHtml(coverage.scope)}</p>
    <dl class="atlas-counts"><div><dt>${escapeHtml(text('animalCountLabel', copy))}</dt><dd>${card.animalCount}</dd></div><div><dt>${escapeHtml(text('relationshipCountLabel', copy))}</dt><dd>${card.relationshipCount}</dd></div><div><dt>${escapeHtml(text('sourceCountLabel', copy))}</dt><dd>${card.sourceCount}</dd></div></dl>
    <div class="card-meta"><p><strong>${escapeHtml(text('sourceCategoriesLabel', copy))}</strong></p><ul class="source-categories">${categories}</ul></div>
    <p class="review-date"><strong>${escapeHtml(text('reviewedLabel', copy))}:</strong> ${escapeHtml(card.lastReviewed)}</p>
    <p class="coverage-warning"><strong>${escapeHtml(text('scopeWarningLabel', copy))}</strong> ${escapeHtml(coverage.limitations[0] ?? card.coverageWarning)}</p>
    <a class="card-link" href="${escapeHtml(card.path)}">${escapeHtml(text('openAtlasLabel', copy))}<span aria-hidden="true">↗</span></a>
  </article>`;
}

function applyStaticTranslations(locale: string, copy: UiMessages) {
  document.documentElement.lang = locale;
  document.title = text('appTitle', copy);
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as keyof UiMessages | undefined;
    if (key) element.textContent = text(key, copy);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = element.dataset.i18nAriaLabel as keyof UiMessages | undefined;
    if (key) element.setAttribute('aria-label', text(key, copy));
  }
}

async function bootHub() {
  const cardsRoot = document.getElementById('atlas-cards');
  const languageSelect = document.getElementById('language-select') as HTMLSelectElement | null;
  if (!cardsRoot || !languageSelect) throw new Error('Hub content is incomplete.');
  const response = await fetch('./catalog.json', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load atlas catalog (${response.status})`);
  const catalog = await response.json() as HubCard[];
  const storageKey = 'animal-lineage-atlas:hub:v1';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && ['en', 'ja', 'ru'].includes(saved)) languageSelect.value = saved;
  } catch { /* storage may be disabled */ }

  const render = () => {
    const locale = languageSelect.value || 'en';
    const copy = getUiMessages(locale);
    applyStaticTranslations(locale, copy);
    cardsRoot.innerHTML = catalog.map((card) => renderCard(card, copy, locale)).join('');
  };
  languageSelect.addEventListener('change', () => {
    try { localStorage.setItem(storageKey, languageSelect.value); } catch { /* storage may be disabled */ }
    render();
  });
  render();
}

void bootHub().catch((error: unknown) => {
  const cardsRoot = document.getElementById('atlas-cards');
  if (cardsRoot) {
    cardsRoot.textContent = error instanceof Error ? error.message : 'The atlas catalog could not be loaded.';
    cardsRoot.setAttribute('role', 'alert');
  }
});
