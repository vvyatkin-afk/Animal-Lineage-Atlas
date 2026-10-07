export interface MediaReference {
  media_id: string;
  source_page_url: string;
  direct_remote_url?: string;
  rights_status: string;
  embedding_status: 'allowed' | 'link_only' | 'denied' | 'unknown';
}

export type MediaResult =
  | { kind: 'remote'; src: string; sourceUrl: string }
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

const EMBEDDABLE_RIGHTS = new Set([
  'cc0',
  'public_domain',
  'permission_granted',
  'license_allows_embedding',
]);

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
