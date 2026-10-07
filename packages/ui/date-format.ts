export type AtlasDate =
  | { precision: 'exact' | 'approximate' | 'unknown'; value?: string }
  | { precision: 'range'; start?: string; end?: string };

export function formatAtlasDate(date: AtlasDate | undefined, locale = 'en'): string {
  if (!date || date.precision === 'unknown') {
    return locale === 'ja' ? '日付不明' : locale === 'ru' ? 'дата неизвестна' : 'Date unknown';
  }
  if (date.precision === 'range') {
    const start = date.start ?? '?';
    const end = date.end ?? '?';
    return `${start}–${end}`;
  }
  if (!date.value) return locale === 'ja' ? '日付不明' : locale === 'ru' ? 'дата неизвестна' : 'Date unknown';
  if (date.precision === 'approximate') {
    const prefix = locale === 'ja' ? '約' : locale === 'ru' ? 'ок.' : 'about ';
    return `${prefix}${date.value}`;
  }
  return date.value;
}
