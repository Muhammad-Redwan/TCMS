import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadAppConfig } from './app/core/config/app-config';
import { enableMocks } from './mocks/enable-mocks';

async function start(): Promise<void> {
  await enableMocks();
  const config = await loadAppConfig();
  await bootstrapApplication(App, appConfig(config));
}

start().catch((error: unknown) => {
  console.error(error);
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent =
    'TCMS could not start. Please reload the page. / تعذر تشغيل TCMS. يرجى إعادة تحميل الصفحة.';
  document.body.replaceChildren(message);
});
