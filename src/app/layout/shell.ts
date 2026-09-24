import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatButton } from '@angular/material/button';
import { LocaleService } from '../core/i18n/locale.service';
import { NAV_ITEMS } from '../core/navigation';
import { SessionService } from '../core/session/session.service';

/** App shell (A03): tenant name, role-based navigation, language switch, profile, sign out. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe, MatButton],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly session = inject(SessionService);
  protected readonly localeService = inject(LocaleService);

  protected readonly navItems = computed(() => {
    const granted = this.session.permissions();
    return NAV_ITEMS.filter((item) => !item.permission || granted.has(item.permission));
  });

  protected signOut(): void {
    void this.session.logout();
  }

  protected switchLanguage(): void {
    void this.localeService.toggle();
  }
}
