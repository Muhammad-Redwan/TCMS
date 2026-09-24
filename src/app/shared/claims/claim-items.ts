import { Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClaimItem, PolicyFinding, Receipt } from '../../api/models';
import { MoneyPipe } from '../format/money';
import { TenantDatePipe } from '../format/tenant-date.pipe';

/** Read-only trip lines of a claim, with a marker on lines that have findings. */
@Component({
  selector: 'app-claim-items',
  imports: [TranslocoPipe, MatButton, MoneyPipe, TenantDatePipe],
  template: `
    <div class="table-scroll">
      <table class="items" data-testid="claim-items">
        <caption class="visually-hidden">
          {{
            'claims.trips.title' | transloco
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{{ 'claims.trips.date' | transloco }}</th>
            <th scope="col">{{ 'claims.trips.mode' | transloco }}</th>
            <th scope="col">{{ 'claims.trips.from' | transloco }}</th>
            <th scope="col">{{ 'claims.trips.to' | transloco }}</th>
            <th scope="col">{{ 'claims.trips.purpose' | transloco }}</th>
            <th scope="col" class="amount">{{ 'claims.trips.amount' | transloco }}</th>
            <th scope="col">{{ 'claims.trips.receipt' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (item of items(); track item.id; let i = $index) {
            <tr [class.flagged]="flagged(i)">
              <td>{{ i + 1 }}</td>
              <td>{{ item.tripDate | tenantDate: 'date' }}</td>
              <td>{{ 'modes.' + item.mode | transloco }}</td>
              <td>
                <bdi>{{ item.fromLocation }}</bdi>
              </td>
              <td>
                <bdi>{{ item.toLocation }}</bdi>
              </td>
              <td>
                <bdi>{{ item.purpose ?? '—' }}</bdi>
              </td>
              <td class="amount">
                <bdi>{{ item.amount | money: currency() }}</bdi>
              </td>
              <td>
                @if (receiptFor(item); as receipt) {
                  @if (receipt.scanStatus === 'CLEAN') {
                    <button matButton type="button" (click)="openReceipt.emit(receipt.id)">
                      <bdi>{{ receipt.fileName }}</bdi>
                    </button>
                  } @else {
                    <bdi>{{ receipt.fileName }}</bdi>
                    ({{ 'status.scan.' + receipt.scanStatus | transloco }})
                  }
                } @else {
                  —
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .items {
      width: 100%;
      border-collapse: collapse;
      th,
      td {
        padding: 0.5rem 0.75rem;
        text-align: start;
        border-block-end: 1px solid var(--mat-sys-outline-variant);
        vertical-align: middle;
      }
      th {
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.875rem;
      }
      .amount {
        text-align: end;
        font-variant-numeric: tabular-nums;
      }
      tr.flagged td:first-child {
        border-inline-start: 4px solid #b26a00;
      }
    }
  `,
})
export class ClaimItems {
  readonly items = input.required<ClaimItem[]>();
  readonly receipts = input.required<Receipt[]>();
  readonly currency = input.required<string>();
  readonly findings = input<PolicyFinding[]>([]);
  /** Emits a receipt id; the page fetches an authorized, short-lived URL and opens it. */
  readonly openReceipt = output<string>();

  protected receiptFor(item: ClaimItem): Receipt | undefined {
    return this.receipts().find((r) => r.id === item.receiptId);
  }

  protected flagged(index: number): boolean {
    return this.findings().some((f) => f.itemIndex === index);
  }
}
