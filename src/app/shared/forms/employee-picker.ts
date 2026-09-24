import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime } from 'rxjs';
import { Api } from '../../api/api';
import { listEmployees } from '../../api/functions';
import { FieldErrorText } from './field-error';

/**
 * Picks one ACTIVE employee by server-side search (tenants may have thousands, so no full list).
 * Renders its own <mat-form-field>, because Material needs the input as a direct child.
 * Use with formControlName / [formControl]; the value is the employee id or null.
 */
@Component({
  selector: 'app-employee-picker',
  imports: [
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatOption,
    TranslocoPipe,
    FieldErrorText,
  ],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        type="text"
        [value]="text()"
        (input)="onType($any($event.target).value)"
        (blur)="onBlur()"
        [disabled]="disabled()"
        [matAutocomplete]="auto"
        [errorStateMatcher]="errorState"
        autocomplete="off"
      />
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      @if (ngControl?.control; as control) {
        <mat-error><app-field-error [control]="control" [errors]="control.errors" /></mat-error>
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        (optionSelected)="onSelect($event)"
        [hideSingleSelectionIndicator]="true"
      >
        <mat-option [value]="null">{{ 'common.none' | transloco }}</mat-option>
        @for (employee of options(); track employee.id) {
          @if (employee.id !== excludeId()) {
            <mat-option [value]="employee">
              <bdi>{{ employee.fullName }}</bdi> · <bdi>{{ employee.employeeNumber }}</bdi>
            </mat-option>
          }
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class EmployeePicker implements ControlValueAccessor {
  private readonly api = inject(Api);
  protected readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly hint = input<string>();
  /** Hide one employee from the options, e.g. the employee being edited. */
  readonly excludeId = input<string | null>(null);
  /** Name for the current value, known from the loaded record; may arrive after the value. */
  readonly initialName = input<string | null>(null);

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private readonly selectedId = signal<string | null>(null);
  private readonly selectedName = signal<string | null>(null);
  private readonly query = toSignal(toObservable(this.text).pipe(debounceTime(250)), {
    initialValue: '',
  });

  private readonly results = resource({
    params: () => ({ q: this.query() }),
    loader: ({ params }) =>
      this.api.invoke(listEmployees, {
        q: params.q || undefined,
        status: 'ACTIVE',
        size: 10,
        sort: 'fullName,asc',
      }),
  });
  protected readonly options = computed(() => this.results.value()?.content ?? []);

  /** Shows the error styling from the outer form control, not the inner input. */
  protected readonly errorState: ErrorStateMatcher = {
    isErrorState: () =>
      !!(this.ngControl?.invalid && (this.ngControl.touched || this.ngControl.dirty)),
  };

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) this.ngControl.valueAccessor = this;
    effect(() => {
      const name = this.initialName();
      untracked(() => {
        if (name && this.selectedId()) {
          this.selectedName.set(name);
          this.text.set(name);
        }
      });
    });
  }

  writeValue(value: string | null): void {
    this.selectedId.set(value);
    const name = value ? untracked(this.initialName) : null;
    this.selectedName.set(name);
    this.text.set(name ?? '');
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onType(value: string): void {
    this.text.set(value);
    if (!value) this.commit(null, null);
  }

  protected onSelect(event: MatAutocompleteSelectedEvent): void {
    const employee = event.option.value as { id: string; fullName: string } | null;
    this.commit(employee?.id ?? null, employee?.fullName ?? null);
    this.text.set(employee?.fullName ?? '');
  }

  /** Typed text that was not picked from the list reverts to the current selection. */
  protected onBlur(): void {
    this.onTouched();
    setTimeout(() => this.text.set(this.selectedName() ?? ''), 200);
  }

  private commit(id: string | null, name: string | null): void {
    if (id === this.selectedId()) return;
    this.selectedId.set(id);
    this.selectedName.set(name);
    this.onChange(id);
  }
}
