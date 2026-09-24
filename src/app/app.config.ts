import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideApiConfiguration } from './api/api-configuration';
import { routes } from './app.routes';
import { APP_CONFIG, AppConfig } from './core/config/app-config';
import { apiInterceptor } from './core/http/api.interceptor';
import { LocaleService } from './core/i18n/locale.service';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';

export function appConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: APP_CONFIG, useValue: config },
      provideRouter(routes, withComponentInputBinding()),
      // Angular's XSRF support is on by default: it copies the XSRF-TOKEN cookie into the
      // X-XSRF-TOKEN header on same-origin mutating requests (Spring Security defaults).
      provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
      provideApiConfiguration(config.apiBasePath),
      provideTransloco({
        config: {
          availableLangs: config.supportedLocales,
          defaultLang: config.defaultLocale,
          fallbackLang: 'en',
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
          missingHandler: { useFallbackTranslation: true },
        },
        loader: TranslocoHttpLoader,
      }),
      provideAppInitializer(() => inject(LocaleService).init()),
    ],
  };
}
