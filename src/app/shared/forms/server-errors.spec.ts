import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ApiError } from '../../core/errors/api-error';
import { applyServerErrors, findControl, SERVER_ERROR } from './server-errors';

function claimForm() {
  return new FormGroup({
    tripDate: new FormControl('2026-09-01'),
    receipts: new FormArray([
      new FormGroup({ amount: new FormControl('1.500', Validators.required) }),
      new FormGroup({ amount: new FormControl('-2') }),
    ]),
  });
}

const error = (fieldErrors: ApiError['fieldErrors']): ApiError => ({
  status: 422,
  code: 'VALIDATION_FAILED',
  fieldErrors,
  outcomeUnknown: false,
});

describe('server field errors (FE-013)', () => {
  it('resolves nested and array paths', () => {
    const form = claimForm();
    expect(findControl(form, 'receipts[1].amount')).toBe(
      form.controls.receipts.at(1).controls.amount,
    );
    expect(findControl(form, 'tripDate')).toBe(form.controls.tripDate);
    expect(findControl(form, 'receipts[5].amount')).toBeNull();
    expect(findControl(form, 'unknown')).toBeNull();
  });

  it('marks the matching array row and keeps what the user typed', () => {
    const form = claimForm();
    const unmatched = applyServerErrors(
      form,
      error([
        { field: 'receipts[1].amount', code: 'POSITIVE' },
        { field: 'currency', code: 'REQUIRED' },
      ]),
    );

    const amount = form.controls.receipts.at(1).controls.amount;
    expect(amount.errors).toEqual({ [SERVER_ERROR]: 'POSITIVE' });
    expect(amount.touched).toBe(true);
    expect(amount.value).toBe('-2');
    expect(form.controls.receipts.at(0).controls.amount.errors).toBeNull();
    expect(unmatched).toEqual([{ field: 'currency', code: 'REQUIRED' }]);
  });

  it('clears the server error once the user edits the field', () => {
    const form = claimForm();
    applyServerErrors(form, error([{ field: 'tripDate', code: 'FUTURE_DATE' }]));
    form.controls.tripDate.setValue('2026-08-01');
    expect(form.controls.tripDate.errors).toBeNull();
  });
});
