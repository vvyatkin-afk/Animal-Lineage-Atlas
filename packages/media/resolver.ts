export interface MediaReference {
  media_id: string;
  animal_id?: string;
  source_page_url: string;
  direct_remote_url?: string;
  direct_thumbnail_url?: string;
  rights_status: string;
  embedding_status: 'allowed' | 'link_only' | 'denied' | 'unknown';
}

export type MediaResult =
  | { kind: 'remote'; src: string; sourceUrl: string }
  | {
    kind: 'licensed'; src: string; thumbnailSrc: string; fallbackSrc: string; sourceUrl: string;
    creator: string; credit: string; licenseName: string; licenseVersion: string; licenseUrl: string; changes: string;
  }
  | {
    kind: 'relay'; src: string; sourceUrl: string; credit: string;
    licenseName: string; licenseVersion: string; licenseUrl: string; changes: string;
  }
  | { kind: 'local'; src: string; sourceUrl: string; credit: string; rightsStatus: string; checksum: string; archiveStatus: string }
  | { kind: 'placeholder'; description: string; sourceUrl?: string };

export interface LocalMediaManifest {
  format: string;
  items: Array<{
    media_id: string;
    relative_path: string;
    original_source_url: string;
    credit: string;
    rights_status: string;
    checksum: string;
    archive_status: string;
  }>;
}

export interface ResolverOptions {
  remoteFailed?: boolean;
}

export interface ApprovedMediaPublicItem {
  id: string;
  animal_id: string;
  identity_confidence: string;
  source_page_url: string;
  creator: string;
  credit: string;
  rights_status: string;
  embedding_status: 'allowed';
  license: { name: string; version: string; url: string };
  original_url: string;
  thumbnail_url: string;
  variants: Array<'thumb' | 'profile'>;
  changes?: string;
}

export interface ApprovedMediaPublicManifest {
  format: 'animal-lineage-atlas-public-media-v1';
  items: ApprovedMediaPublicItem[];
}

const EMBEDDABLE_RIGHTS = new Set([
  'cc0',
  'public_domain',
  'permission_granted',
  'license_allows_embedding',
  'cc-by-4.0',
  'cc-by-sa-3.0',
  'cc-by-sa-4.0',
]);

const APPROVED_LICENSES: Record<string, { name: string; version: string; url: string }> = {
  'cc0': { name: 'CC0 1.0', version: '1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'cc-by-4.0': { name: 'CC BY 4.0', version: '4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'cc-by-sa-3.0': { name: 'CC BY-SA 3.0', version: '3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  'cc-by-sa-4.0': { name: 'CC BY-SA 4.0', version: '4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
};

function isApprovedCommonsImageUrl(value: unknown, host: string, pathPrefix: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.port && !url.username && !url.password
      && !url.search && !url.hash && url.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

function placeholder(description: string, sourceUrl?: string): MediaResult {
  return sourceUrl ? { kind: 'placeholder', description, sourceUrl } : { kind: 'placeholder', description };
}

export function resolvePublicMedia(reference: MediaReference, options: ResolverOptions = {}): MediaResult {
  if (options.remoteFailed) {
    return placeholder('The remote image is unavailable. Visit the source page for details.', reference.source_page_url);
  }
  const canEmbed = reference.embedding_status === 'allowed'
    && EMBEDDABLE_RIGHTS.has(reference.rights_status.toLocaleLowerCase());
  if (canEmbed && reference.direct_remote_url) {
    return { kind: 'remote', src: reference.direct_remote_url, sourceUrl: reference.source_page_url };
  }
  return placeholder('No public image is available under the recorded media terms.', reference.source_page_url);
}

export function createApprovedMediaResolver(
  manifest: ApprovedMediaPublicManifest,
  basePath: string,
): (reference: MediaReference, variant?: 'thumb' | 'profile') => MediaResult {
  const safeBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const validBasePath = /^\/(?:[A-Za-z0-9._-]+\/)*$/.test(safeBasePath) && !safeBasePath.includes('..');
  const items = new Map((manifest?.format === 'animal-lineage-atlas-public-media-v1' && Array.isArray(manifest.items)
    ? manifest.items
    : [])
    .filter((item) => /^[a-f0-9]{32}$/.test(item.id)
      && item.identity_confidence === 'confirmed'
      && item.embedding_status === 'allowed'
      && APPROVED_LICENSES[item.rights_status]?.url === item.license?.url
      && APPROVED_LICENSES[item.rights_status]?.name === item.license?.name
      && APPROVED_LICENSES[item.rights_status]?.version === item.license?.version
      && isApprovedCommonsImageUrl(item.original_url, 'upload.wikimedia.org', '/wikipedia/commons/')
      && isApprovedCommonsImageUrl(item.thumbnail_url, 'thumb.wikimedia.org', '/wikipedia/commons/thumb/')
      && isApprovedCommonsImageUrl(item.source_page_url, 'commons.wikimedia.org', '/wiki/File:')
      && Array.isArray(item.variants))
    .map((item) => [item.id, item]));

  return (reference, variant = 'profile') => {
    const item = items.get(reference.media_id);
    if (!validBasePath || !item || !['thumb', 'profile'].includes(variant)
      || !item.variants.includes(variant)
      || (reference.animal_id && item.animal_id !== reference.animal_id)
      || item.source_page_url !== reference.source_page_url
      || item.rights_status !== reference.rights_status
      || reference.embedding_status !== 'allowed') {
      return placeholder('No public image is available under the recorded media terms.', reference.source_page_url);
    }
    const thumbnail = variant === 'thumb';
    return {
      kind: 'licensed',
      src: thumbnail ? item.thumbnail_url : item.original_url,
      thumbnailSrc: item.thumbnail_url,
      fallbackSrc: `${safeBasePath}media/${item.id}/${variant}`,
      sourceUrl: item.source_page_url,
      creator: item.creator,
      credit: item.credit || item.creator,
      licenseName: item.license.name,
      licenseVersion: item.license.version,
      licenseUrl: item.license.url,
      changes: item.changes ?? 'No changes made.',
    };
  };
}

export function createLocalResolver(manifest: LocalMediaManifest): (reference: Pick<MediaReference, 'media_id'>) => MediaResult {
  const items = new Map((manifest.items ?? []).map((item) => [item.media_id, item]));
  return (reference) => {
    const item = items.get(reference.media_id);
    const path = item?.relative_path.replaceAll('\\', '/');
    if (!item || !path || path.startsWith('/') || path.split('/').includes('..')) {
      return placeholder('No local media is present in this archive.');
    }
    return {
      kind: 'local',
      src: `./${path}`,
      sourceUrl: item.original_source_url,
      credit: item.credit,
      rightsStatus: item.rights_status,
      checksum: item.checksum,
      archiveStatus: item.archive_status,
    };
  };
}
