import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG, Locale } from '../config/app-config';

const STORAGE_KEY = 'tcms.locale';
const RTL_LOCALES: readonly Locale[] = ['ar'];

/**
 * Owns the active language and document direction (D15). Switching to Arabic flips
 * <html dir="rtl">, so layout mirrors through CSS logical properties, not only text alignment.
 */
@Service()
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly config = inject(APP_CONFIG);
  private readonly document = inject(DOCUMENT);

  private readonly localeState = signal<Locale>(this.config.defaultLocale);
  readonly locale = this.localeState.asReadonly();
  readonly supported = this.config.supportedLocales;

  /** Applies the viewer's saved choice, or the configured default. */
  async init(): Promise<void> {
    await this.use(this.readStored() ?? this.config.defaultLocale);
  }

  async use(locale: Locale): Promise<void> {
    if (!this.supported.includes(locale)) return;
    await firstValueFrom(this.transloco.load(locale));
    this.transloco.setActiveLang(locale);
    this.localeState.set(locale);
    const html = this.document.documentElement;
    html.lang = locale;
    html.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
    this.store(locale);
  }

  toggle(): Promise<void> {
    const next = this.supported.find((l) => l !== this.localeState()) ?? this.localeState();
    return this.use(next);
  }

  private readStored(): Locale | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY) as Locale | null;
      return value && this.supported.includes(value) ? value : null;
    } catch {
      return null;
    }
  }

  private store(locale: Locale): void {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Preference is a convenience; ignore storage failures.
    }
  }
}
