import messages from './messages.json' with { type: 'json' };

export type InterfaceLocale = 'en' | 'ja' | 'ru';
export type UiMessages = (typeof messages)['en'];

export function getUiMessages(locale: string): UiMessages {
  const selected = locale in messages ? locale as InterfaceLocale : 'en';
  return messages[selected] as UiMessages;
}

export function applyLocalizedLabels(root: ParentNode, locale: string): UiMessages {
  const selected = getUiMessages(locale);
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as keyof UiMessages | undefined;
    if (key && key in selected) element.textContent = selected[key];
  }
  return selected;
}
