import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/** Loads i18n/{lang}.json from the public folder, relative to <base href>. */
@Service()
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`i18n/${lang}.json`);
  }
}
