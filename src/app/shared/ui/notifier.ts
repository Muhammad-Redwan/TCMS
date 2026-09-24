import { inject, Service } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';

/** Short success feedback. Errors belong inline next to what failed, not in a toast. */
@Service()
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  success(key: string, params?: Record<string, unknown>): void {
    this.snackBar.open(this.transloco.translate(key, params), undefined, {
      duration: 4000,
      politeness: 'polite',
    });
  }
}
