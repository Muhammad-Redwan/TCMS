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
import { FieldErrorText } from './field-error';

export interface PickerOption {
  id: string;
  label: string;
  /** Secondary text, e.g. an employee number or email. */
  detail?: string | null;
}

/** Server-side search: large lists (employees, users) are never loaded whole. */
export type PickerSearch = (query: string) => Promise<PickerOption[]>;

/**
 * Picks one item by server-side search. Renders its own <mat-form-field>, because Material needs
 * the input as a direct child. Use with formControlName / [formControl]; the value is the id or null.
 */
@Component({
  selector: 'app-search-picker',
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
        [required]="required()"
        [matAutocomplete]="auto"
        [errorStateMatcher]="errorState"
        autocomplete="off"
        dir="auto"
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
        @if (!required()) {
          <mat-option [value]="null">{{ 'common.none' | transloco }}</mat-option>
        }
        @for (option of options(); track option.id) {
          @if (option.id !== excludeId()) {
            <mat-option [value]="option">
              <bdi>{{ option.label }}</bdi>
              @if (option.detail) {
                · <bdi>{{ option.detail }}</bdi>
              }
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
export class SearchPicker implements ControlValueAccessor {
  protected readonly ngControl = inject(NgControl, { self: true, optional: true });

  readonly label = input.required<string>();
  readonly search = input.required<PickerSearch>();
  readonly hint = input<string>();
  readonly required = input(false);
  /** Hide one option, e.g. the record being edited. */
  readonly excludeId = input<string | null>(null);
  /** Label for the current value, known from the loaded record; may arrive after the value. */
  readonly initialLabel = input<string | null>(null);

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private readonly selectedId = signal<string | null>(null);
  private readonly selectedLabel = signal<string | null>(null);
  private readonly query = toSignal(toObservable(this.text).pipe(debounceTime(250)), {
    initialValue: '',
  });

  private readonly results = resource({
    params: () => ({ q: this.query(), search: this.search() }),
    loader: ({ params }) => params.search(params.q),
  });
  protected readonly options = computed(() => this.results.value() ?? []);

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
      const label = this.initialLabel();
      untracked(() => {
        if (label && this.selectedId()) {
          this.selectedLabel.set(label);
          this.text.set(label);
        }
      });
    });
  }

  writeValue(value: string | null): void {
    this.selectedId.set(value);
    const label = value ? untracked(this.initialLabel) : null;
    this.selectedLabel.set(label);
    this.text.set(label ?? '');
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
    const option = event.option.value as PickerOption | null;
    this.commit(option?.id ?? null, option?.label ?? null);
    this.text.set(option?.label ?? '');
  }

  /** Typed text that was not picked from the list reverts to the current selection. */
  protected onBlur(): void {
    this.onTouched();
    setTimeout(() => this.text.set(this.selectedLabel() ?? ''), 200);
  }

  private commit(id: string | null, label: string | null): void {
    if (id === this.selectedId()) return;
    this.selectedId.set(id);
    this.selectedLabel.set(label);
    this.onChange(id);
  }
}
