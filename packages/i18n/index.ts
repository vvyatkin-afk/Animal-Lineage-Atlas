import messages from './messages.json' with { type: 'json' };

export type InterfaceLocale = 'en' | 'ja' | 'ru';
export type UiMessages = (typeof messages)['en'];
export type CoverageTranslation = { scope: string; limitations: string[] };
export type LocalizableCoverage = {
  scope?: string;
  limitations?: string[];
  translations?: Partial<Record<Exclude<InterfaceLocale, 'en'>, CoverageTranslation>>;
};

const SOURCE_CATEGORY_MESSAGE_KEYS = {
  animal_profile: 'sourceCategoryAnimalProfile',
  keeper_interview: 'sourceCategoryKeeperInterview',
  media_page: 'sourceCategoryMediaPage',
  media_rights_source: 'sourceCategoryMediaRightsSource',
  news_report: 'sourceCategoryNewsReport',
  official_source: 'sourceCategoryOfficialSource',
  official_zoo_profile: 'sourceCategoryOfficialZooProfile',
  secondary_database: 'sourceCategorySecondaryDatabase',
  secondary_profile: 'sourceCategorySecondaryProfile',
  secondary_source: 'sourceCategorySecondarySource',
  specialist_article: 'sourceCategorySpecialistArticle',
  'official zoo histories': 'sourceCategoryOfficialZooHistories',
  'official zoo genetic announcement': 'sourceCategoryOfficialZooGeneticAnnouncement',
  'official zoo announcements': 'sourceCategoryOfficialZooAnnouncements',
  'official zoo profile': 'sourceCategoryOfficialZooProfile',
  'official zoo updates': 'sourceCategoryOfficialZooUpdates',
  'official zoo care blog': 'sourceCategoryOfficialZooCareBlog',
  'official zoo roster': 'sourceCategoryOfficialZooRoster',
  'official zoo annual report': 'sourceCategoryOfficialZooAnnualReport',
} as const satisfies Record<string, keyof UiMessages>;

export function getUiMessages(locale: string): UiMessages {
  const selected = locale in messages ? locale as InterfaceLocale : 'en';
  return messages[selected] as UiMessages;
}

export function getLocalizedCoverage(coverage: LocalizableCoverage, locale: string): CoverageTranslation {
  const selected = locale in messages ? locale as InterfaceLocale : 'en';
  const translated = selected === 'en' ? undefined : coverage.translations?.[selected];
  return {
    scope: translated?.scope ?? coverage.scope ?? '',
    limitations: translated?.limitations ?? coverage.limitations ?? [],
  };
}

export function getSourceCategoryLabel(value: string, locale: string): string {
  const key = SOURCE_CATEGORY_MESSAGE_KEYS[value as keyof typeof SOURCE_CATEGORY_MESSAGE_KEYS];
  if (key) return getUiMessages(locale)[key];
  const title = value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
  return title;
}

export function applyLocalizedLabels(root: ParentNode, locale: string): UiMessages {
  const selected = getUiMessages(locale);
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as keyof UiMessages | undefined;
    if (key && key in selected) element.textContent = selected[key];
  }
  return selected;
}
