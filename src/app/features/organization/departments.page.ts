import { Component, computed, inject, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api/api';
import { listDepartments } from '../../api/functions';
import { Department } from '../../api/models';
import { SessionService } from '../../core/session/session.service';
import { ErrorAlert } from '../../shared/ui/error-alert';
import { Notifier } from '../../shared/ui/notifier';
import { DepartmentDialog, DepartmentDialogData } from './department-dialog';

/** Departments (O02): list with manager assignment; add/edit in a dialog. */
@Component({
  selector: 'app-departments-page',
  imports: [TranslocoPipe, MatButton, MatTableModule, MatProgressBar, ErrorAlert],
  template: `
    <div class="page-header">
      <h2>{{ 'departments.title' | transloco }}</h2>
      @if (canEdit()) {
        <button matButton="filled" type="button" (click)="open()" data-testid="add-department">
          {{ 'departments.add' | transloco }}
        </button>
      }
    </div>

    @if (departments.isLoading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | transloco" />
    }

    @if (departments.error(); as error) {
      <app-error-alert [error]="error" [retryable]="true" (retry)="departments.reload()" />
    } @else if (departments.value(); as rows) {
      @if (rows.length === 0) {
        <p class="empty">{{ 'departments.empty' | transloco }}</p>
      } @else {
        <div class="table-scroll">
          <table mat-table [dataSource]="rows" data-testid="departments-table">
            <caption class="visually-hidden">
              {{
                'departments.title' | transloco
              }}
            </caption>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'departments.fields.name' | transloco }}</th>
              <td mat-cell *matCellDef="let d">
                <bdi>{{ d.name }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="manager">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'departments.fields.manager' | transloco }}
              </th>
              <td mat-cell *matCellDef="let d">
                <bdi>{{ d.managerName ?? '—' }}</bdi>
              </td>
            </ng-container>
            <ng-container matColumnDef="employeeCount">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'departments.fields.employeeCount' | transloco }}
              </th>
              <td mat-cell *matCellDef="let d">{{ d.employeeCount }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>
                <span class="visually-hidden">{{ 'common.edit' | transloco }}</span>
              </th>
              <td mat-cell *matCellDef="let d">
                @if (canEdit()) {
                  <button
                    matButton
                    type="button"
                    (click)="open(d)"
                    [attr.aria-label]="('common.edit' | transloco) + ' ' + d.name"
                  >
                    {{ 'common.edit' | transloco }}
                  </button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      }
    }
  `,
  styles: `
    h2 {
      font-size: 1.25rem;
      margin: 0;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DepartmentsPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);

  protected readonly columns = ['name', 'manager', 'employeeCount', 'actions'];
  protected readonly canEdit = computed(() => this.session.permissions().has('org.settings.write'));
  protected readonly departments = resource({ loader: () => this.api.invoke(listDepartments) });

  protected async open(department?: Department): Promise<void> {
    const ref = this.dialog.open<DepartmentDialog, DepartmentDialogData, Department>(
      DepartmentDialog,
      {
        data: { department },
        width: 'min(32rem, 95vw)',
        autoFocus: 'first-tabbable',
      },
    );
    const saved = await firstValueFrom(ref.afterClosed());
    if (!saved) return;
    this.notifier.success(department ? 'departments.saved' : 'departments.created');
    this.departments.reload();
  }
}
