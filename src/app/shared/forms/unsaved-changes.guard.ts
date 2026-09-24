import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Confirmation } from '../ui/confirm-dialog';

/** Implemented by pages with editable forms. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Asks before leaving a page whose form has unsaved edits. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return inject(Confirmation).ask({
    titleKey: 'unsaved.title',
    bodyKey: 'unsaved.body',
    confirmKey: 'unsaved.leave',
    destructive: true,
  });
};
