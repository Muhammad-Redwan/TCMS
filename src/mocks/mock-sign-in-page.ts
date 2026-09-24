import { Component, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { resetDb } from './db';
import { PERSONA_STORAGE_KEY, PERSONAS } from './personas';

/** Stands in for the Keycloak login page in mock mode: pick a persona, then return to the app. */
@Component({
  selector: 'app-mock-sign-in-page',
  imports: [MatButton],
  template: `
    <main class="mock" id="main">
      <h1>Mock sign-in</h1>
      <p>Mock mode only. Choose a fabricated persona.</p>
      <ul>
        @for (entry of personas; track entry[0]) {
          <li>
            <button
              matButton="outlined"
              type="button"
              (click)="signIn(entry[0])"
              [attr.data-testid]="'persona-' + entry[0]"
            >
              {{ entry[1].displayName }}
            </button>
          </li>
        }
      </ul>
      <p>
        <button matButton type="button" (click)="reset()" data-testid="reset-mock-data">
          Reset mock data
        </button>
        @if (resetDone()) {
          <span role="status">Mock data reset.</span>
        }
      </p>
    </main>
  `,
  styles: `
    .mock {
      max-width: 32rem;
      margin: 3rem auto;
      padding-inline: 1rem;
    }
    ul {
      list-style: none;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }
  `,
})
export class MockSignInPage {
  protected readonly personas = Object.entries(PERSONAS);
  protected readonly resetDone = signal(false);

  protected reset(): void {
    resetDb();
    this.resetDone.set(true);
  }

  protected signIn(key: string): void {
    localStorage.setItem(PERSONA_STORAGE_KEY, key);
    // Full reload, like the real gateway redirect back to the app.
    window.location.assign('/');
  }
}
