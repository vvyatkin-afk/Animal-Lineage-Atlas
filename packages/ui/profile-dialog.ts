import { resolvePublicMedia, type MediaReference, type MediaResult } from '../media/resolver.ts';
import { formatAtlasDate, type AtlasDate } from './date-format.ts';
import type { LocalizableCoverage } from '../i18n/index.ts';

type AtlasSource = { id: string; title: string; url: string; publisher?: string };
type AtlasAnimal = {
  id: string;
  taxon: string;
  sex?: string;
  status?: string;
  name: { canonical: string; language?: string; source_ids?: string[] };
  aliases?: Array<{ value: string; language?: string }>;
};
type AtlasRelationship = {
  id: string; subject: string; object: string; type: string; status: string; source_ids?: string[];
};
type AtlasEvent = {
  id: string; animal_id: string; type: string; date: AtlasDate; institution_id?: string;
  from_institution_id?: string; to_institution_id?: string; source_ids?: string[]; notes?: string;
};
type AtlasClaim = {
  id: string; subject: string; claim_type: string; value?: unknown; status: string;
  source_ids?: string[]; notes?: string;
};
export type AtlasDocument = {
  animals: AtlasAnimal[];
  relationships: AtlasRelationship[];
  events: AtlasEvent[];
  claims: AtlasClaim[];
  institutions?: Array<{ id: string; names: Array<{ value: string; language?: string }>; country_code?: string; location?: string }>;
  media: Array<MediaReference & { animal_id: string; credit?: string | null; source_ids?: string[] }>;
  sources: AtlasSource[];
  coverage?: LocalizableCoverage;
};

type ProfileMessages = {
  appTitle: string; noMedia: string; mediaUnavailable: string; localMediaUnavailable: string; sourceLabel: string; sourcesLabel: string;
  eventsLabel: string; relationshipsLabel: string; claimsLabel: string; dateLabel: string;
  sexLabel: string; statusLabel: string; institutionLabel: string; fromInstitutionLabel: string;
  toInstitutionLabel: string; unknownValue: string;
  livingStatus: string; deceasedStatus: string; viewProfileLabel: string;
  motherLabel: string; fatherLabel: string; childLabel: string;
  fosterLabel: string; adoptiveLabel: string; socialLabel: string; maleLabel: string; femaleLabel: string;
  birthEventLabel: string; deathEventLabel: string; transferEventLabel: string;
  releaseEventLabel: string; observationEventLabel: string;
  confirmedLabel: string; probableLabel: string; disputedLabel: string; unknownLabel: string;
};

export function getProfileIdFromSearch(search: string | URLSearchParams): string | null {
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  return params.get('animal');
}

export { formatAtlasDate };

function sourceList(atlas: AtlasDocument, sourceIds: string[] = []) {
  const wanted = new Set(sourceIds);
  return atlas.sources.filter((source) => wanted.has(source.id));
}

function relationshipText(type: string, animalIsChild: boolean, messages: ProfileMessages): string {
  if (animalIsChild && type === 'biological_mother') return messages.motherLabel;
  if (animalIsChild && type === 'biological_father') return messages.fatherLabel;
  if (!animalIsChild && (type === 'biological_mother' || type === 'biological_father')) return messages.childLabel;
  if (type === 'foster') return messages.fosterLabel;
  if (type === 'adoptive') return messages.adoptiveLabel;
  if (type === 'social') return messages.socialLabel;
  return type.replaceAll('_', ' ');
}

export function buildProfileModel(
  atlas: AtlasDocument,
  animalId: string | null,
  mediaOptions: { remoteFailed?: boolean; locale?: string; mediaResolver?: (item: MediaReference) => MediaResult } = {},
) {
  const animal = atlas.animals.find((candidate) => candidate.id === animalId);
  if (!animal) return null;
  const animalById = new Map(atlas.animals.map((candidate) => [candidate.id, candidate]));
  const institutionById = new Map((atlas.institutions ?? []).map((institution) => [institution.id, institution]));
  const relationships = atlas.relationships.flatMap((relationship) => {
    if (relationship.subject !== animal.id && relationship.object !== animal.id) return [];
    const counterpartId = relationship.subject === animal.id ? relationship.object : relationship.subject;
    const counterpart = animalById.get(counterpartId);
    if (!counterpart) return [];
    return [{
      relationship,
      counterpart,
      animalIsChild: relationship.object === animal.id,
      sources: sourceList(atlas, relationship.source_ids),
    }];
  });
  const events = atlas.events.filter((event) => event.animal_id === animal.id).map((event) => ({
    event,
    dateLabel: formatAtlasDate(event.date, mediaOptions.locale ?? 'en'),
    fromInstitution: institutionById.get(event.from_institution_id ?? ''),
    toInstitution: institutionById.get(event.to_institution_id ?? event.institution_id ?? ''),
    sources: sourceList(atlas, event.source_ids),
  }));
  const claims = atlas.claims.filter((claim) => claim.subject === animal.id).map((claim) => ({
    claim,
    sources: sourceList(atlas, claim.source_ids),
  }));
  const media = atlas.media.filter((item) => item.animal_id === animal.id).map((item) => ({
    item,
    presentation: mediaOptions.mediaResolver?.(item) ?? resolvePublicMedia(item, mediaOptions),
    sources: sourceList(atlas, item.source_ids),
  }));
  const nameSources = sourceList(atlas, animal.name.source_ids);
  return { animal, relationships, events, claims, media, nameSources };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function sourceLinks(sources: AtlasSource[], label: string): string {
  if (!sources.length) return '';
  return `<ul class="source-links">${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a><span>${escapeHtml(source.publisher ?? label)}</span></li>`).join('')}</ul>`;
}

function statusText(status: string | undefined, messages: ProfileMessages): string {
  if (status === 'living') return messages.livingStatus;
  if (status === 'deceased') return messages.deceasedStatus;
  return status?.replaceAll('_', ' ') || messages.unknownValue;
}

function sexText(sex: string | undefined, messages: ProfileMessages): string {
  if (sex === 'male') return messages.maleLabel;
  if (sex === 'female') return messages.femaleLabel;
  return sex?.replaceAll('_', ' ') || messages.unknownValue;
}

function eventText(type: string, messages: ProfileMessages): string {
  const labels: Record<string, string> = {
    birth: messages.birthEventLabel,
    death: messages.deathEventLabel,
    move: messages.transferEventLabel,
    transfer: messages.transferEventLabel,
    release: messages.releaseEventLabel,
    observation: messages.observationEventLabel,
  };
  return labels[type] ?? type.replaceAll('_', ' ');
}

function evidenceText(status: string, messages: ProfileMessages): string {
  const labels: Record<string, string> = {
    confirmed: messages.confirmedLabel,
    probable: messages.probableLabel,
    disputed: messages.disputedLabel,
    unknown: messages.unknownLabel,
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function mediaMarkup(
  media: Array<{ item: AtlasDocument['media'][number]; presentation: MediaResult; sources: AtlasSource[] }>,
  name: string,
  messages: ProfileMessages,
): string {
  if (!media.length) return `<div class="media-placeholder" role="img" aria-label="${escapeHtml(messages.noMedia)}">${escapeHtml(messages.noMedia)}</div>`;
  return media.map(({ item, presentation, sources }) => {
    const image = presentation.kind === 'remote' || presentation.kind === 'local'
      ? `<img class="profile-image" src="${escapeHtml(presentation.src)}" alt="${escapeHtml(name)}" data-image-fallback="${escapeHtml(presentation.kind === 'local' ? messages.localMediaUnavailable : messages.mediaUnavailable)}">`
      : `<div class="media-placeholder" role="img" aria-label="${escapeHtml(presentation.description)}">${escapeHtml(presentation.description)}</div>`;
    const sourceUrl = presentation.sourceUrl;
    const link = sourceUrl ? `<p><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(messages.sourceLabel)}</a></p>` : '';
    const creditText = item.credit ?? (presentation.kind === 'local' ? presentation.credit : null);
    const credit = creditText ? `<p class="media-credit">${escapeHtml(creditText)}</p>` : '';
    return `<figure class="profile-media">${image}${credit}${link}${sourceLinks(sources, messages.sourceLabel)}</figure>`;
  }).join('');
}

export function renderProfileDialog(
  dialog: HTMLDialogElement,
  model: NonNullable<ReturnType<typeof buildProfileModel>> | null,
  messages: ProfileMessages,
  onRelatedAnimal: (id: string) => void,
) {
  const content = dialog.querySelector<HTMLElement>('[data-profile-content]');
  if (!content) return;
  if (!model) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(messages.unknownValue)}</p>`;
    return;
  }
  const { animal } = model;
  const relationshipSection = model.relationships.length ? `<section><h3>${escapeHtml(messages.relationshipsLabel)}</h3><ul>${model.relationships.map(({ relationship, counterpart, animalIsChild, sources }) => `<li><button class="text-button" type="button" data-related-animal="${escapeHtml(counterpart.id)}">${escapeHtml(relationshipText(relationship.type, animalIsChild, messages))}: ${escapeHtml(counterpart.name.canonical)}</button><span class="evidence-status">${escapeHtml(evidenceText(relationship.status, messages))}</span>${sourceLinks(sources, messages.sourceLabel)}</li>`).join('')}</ul></section>` : '';
  const eventSection = model.events.length ? `<section><h3>${escapeHtml(messages.eventsLabel)}</h3><ul class="event-list">${model.events.map(({ event, dateLabel, fromInstitution, toInstitution, sources }) => {
    const transfer = event.type === 'move' || event.type === 'transfer';
    const institutionLabel = (institution: NonNullable<typeof toInstitution>, label: string) => `<span>${escapeHtml(label)}: ${escapeHtml(institution.names[0]?.value ?? institution.id)}${institution.location ? ` · ${escapeHtml(institution.location)}` : ''}</span>`;
    const locations = transfer
      ? `${fromInstitution ? institutionLabel(fromInstitution, messages.fromInstitutionLabel) : ''}${toInstitution ? institutionLabel(toInstitution, messages.toInstitutionLabel) : ''}`
      : toInstitution ? institutionLabel(toInstitution, messages.institutionLabel) : '';
    return `<li><strong>${escapeHtml(eventText(event.type, messages))}</strong><span>${escapeHtml(dateLabel)}</span>${locations}${event.notes ? `<p>${escapeHtml(event.notes)}</p>` : ''}${sourceLinks(sources, messages.sourceLabel)}</li>`;
  }).join('')}</ul></section>` : '';
  const claimSection = model.claims.length ? `<section><h3>${escapeHtml(messages.claimsLabel)}</h3><ul>${model.claims.map(({ claim, sources }) => `<li><strong>${escapeHtml(claim.claim_type.replaceAll('_', ' '))}</strong><span>${escapeHtml(evidenceText(claim.status, messages))}${valueText(claim.value) ? ` · ${escapeHtml(valueText(claim.value))}` : ''}</span>${claim.notes ? `<p>${escapeHtml(claim.notes)}</p>` : ''}${sourceLinks(sources, messages.sourceLabel)}</li>`).join('')}</ul></section>` : '';
  content.innerHTML = `<div class="profile-heading">${mediaMarkup(model.media, animal.name.canonical, messages)}<div><p class="eyebrow">${escapeHtml(animal.taxon)}</p><h2 id="profile-title" data-profile-title tabindex="-1">${escapeHtml(animal.name.canonical)}</h2>${animal.aliases?.length ? `<p class="profile-aliases">${animal.aliases.map((alias) => escapeHtml(alias.value)).join(' · ')}</p>` : ''}<dl class="profile-facts"><div><dt>${escapeHtml(messages.sexLabel)}</dt><dd>${escapeHtml(sexText(animal.sex, messages))}</dd></div><div><dt>${escapeHtml(messages.statusLabel)}</dt><dd>${escapeHtml(statusText(animal.status, messages))}</dd></div><div><dt>ID</dt><dd><code>${escapeHtml(animal.id)}</code></dd></div></dl>${sourceLinks(model.nameSources, messages.sourceLabel)}</div></div>${relationshipSection}${eventSection}${claimSection}${model.nameSources.length ? `<section><h3>${escapeHtml(messages.sourcesLabel)}</h3>${sourceLinks(model.nameSources, messages.sourceLabel)}</section>` : ''}`;
  for (const button of content.querySelectorAll<HTMLButtonElement>('[data-related-animal]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.relatedAnimal;
      if (id) onRelatedAnimal(id);
    });
  }
  for (const image of content.querySelectorAll<HTMLImageElement>('[data-image-fallback]')) {
    image.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'media-placeholder';
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', image.dataset.imageFallback ?? messages.noMedia);
      fallback.textContent = image.dataset.imageFallback ?? messages.noMedia;
      image.replaceWith(fallback);
    }, { once: true });
  }
  const profileTitle = content.querySelector<HTMLElement>('[data-profile-title]');
  if (dialog.open) profileTitle?.focus({ preventScroll: true });
}
