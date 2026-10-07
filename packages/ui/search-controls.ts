export interface SearchResultAnimal {
  id: string;
  name: { canonical: string; localized?: Array<{ value: string; language: string }> };
  aliases?: Array<{ value: string }>;
  taxon: string;
  country_code?: string | null;
  institution_names?: string[];
}

export interface SearchResultMessages {
  viewProfileLabel: string;
  noResults: string;
  currentDataLabel?: string;
}

export function localizedAnimalName(animal: SearchResultAnimal, locale: string): string {
  return animal.name.localized?.find((name) => name.language === locale)?.value ?? animal.name.canonical;
}

export function renderSearchResults(
  container: HTMLElement,
  animals: SearchResultAnimal[],
  locale: string,
  messages: SearchResultMessages,
  onSelect: (id: string) => void,
) {
  container.replaceChildren();
  if (animals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = messages.noResults;
    container.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const animal of animals.slice(0, 60)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-card';
    button.setAttribute('aria-label', `${messages.viewProfileLabel}: ${localizedAnimalName(animal, locale)}`);
    const name = document.createElement('strong');
    name.textContent = localizedAnimalName(animal, locale);
    const subtitle = document.createElement('span');
    subtitle.textContent = [animal.taxon, animal.country_code].filter(Boolean).join(' · ');
    const alias = animal.aliases?.[0]?.value;
    const aliasNode = document.createElement('small');
    aliasNode.textContent = alias ?? animal.institution_names?.[0] ?? '';
    button.append(name, subtitle, aliasNode);
    button.addEventListener('click', () => onSelect(animal.id));
    fragment.append(button);
  }
  if (animals.length > 60) {
    const more = document.createElement('p');
    more.className = 'result-count-note';
    more.textContent = `${animals.length - 60}+ more records; refine the search.`;
    fragment.append(more);
  }
  container.append(fragment);
}
