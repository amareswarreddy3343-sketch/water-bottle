import { useState } from 'react';
import api from '../../api';
import { fmtDateTime, money, toNumber } from '../../lib/format';
import { confirmAction, toast, toastError } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, MoneyInput, Segmented, Sheet } from '../ui';

function AddPaymentSheet({ uid, balance, onClose, onAdded }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const value = toNumber(amount);
    if (!(value > 0)) {
      setError('Enter the amount received.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.addPayment(uid, { paid_amount: value, mode, reference: mode === 'upi' ? reference.trim() : '' });
      onAdded(res);
      toast(`${money(value)} received by ${mode === 'upi' ? 'UPI' : 'cash'}`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not record the payment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Record payment"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-green" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save payment'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Amount received">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        {balance > 0 && (
          <div className="row-wrap" style={{ marginTop: -6 }}>
            <button type="button" className="chip" onClick={() => setAmount(String(Math.round(balance * 100) / 100))}>
              Full balance {money(balance)}
            </button>
          </div>
        )}
        <div className="field">
          <span className="field-label">Paid by</span>
          <Segmented
            label="Payment mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI' },
            ]}
          />
        </div>
        {mode === 'upi' && (
          <Field label="UPI reference" hint="Optional — the transaction ID from the payment app">
            <input
              className="input"
              value={reference}
              onChange={(e) => setReference(e.target.value.slice(0, 60))}
              placeholder="e.g. 4321 8765 0912"
              autoComplete="off"
            />
          </Field>
        )}
      </div>
      <FormError>{error}</FormError>
    </Sheet>
  );
}

function TotalSheet({ uid, current, treatmentsTotal, onClose, onSaved }) {
  const [value, setValue] = useState(current != null ? String(current) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (clear = false) => {
    setBusy(true);
    setError('');
    try {
      await api.setManualTotal(uid, clear || value === '' ? '' : value);
      onSaved();
      toast(clear ? 'Bill uses the treatments total again' : 'Bill total updated');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the total.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Adjust bill total"
      subtitle={`Treatments add up to ${money(treatmentsTotal)}. Set a different total, for example after a discount.`}
      footer={
        <>
          {current != null && (
            <button type="button" className="btn" onClick={() => save(true)} disabled={busy}>
              Use treatments total
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={busy}>
            Save total
          </button>
        </>
      }
    >
      <Field label="Bill total">
        <MoneyInput value={value} onChange={setValue} autoFocus />
      </Field>
      <FormError>{error}</FormError>
    </Sheet>
  );
}

export default function PaymentsSection({ uid, payments, totals, isMaster, onPaymentsChanged, onPrintReceipt }) {
  const [adding, setAdding] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);
  const { billed, paid, balance, cash, upi, manual, treatmentsTotal } = totals;

  const remove = async (p) => {
    const ok = await confirmAction({
      title: `Delete ${money(p.amount)} payment?`,
      message: `Received ${fmtDateTime(p.created_at)} by ${p.mode === 'upi' ? 'UPI' : 'cash'}. Only delete a payment entered by mistake. It stops counting towards the bill, and a copy is kept in the history.`,
      confirmLabel: 'Delete payment',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePayment(uid, p.id);
      toast('Payment deleted');
      onPaymentsChanged();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not delete the payment.'));
    }
  };

  return (
    <section className="section" id="payments">
      <div className="section-head">
        <h2>Payments</h2>
        <button type="button" className="btn btn-green btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          Record payment
        </button>
      </div>

      <div className="money-row">
        <div>
          <div className="label">Bill</div>
          <div className="value">{money(billed)}</div>
        </div>
        <div>
          <div className="label">Paid</div>
          <div className="value money-in">{money(paid)}</div>
        </div>
        <div>
          <div className="label">{balance < 0 ? 'Advance' : 'Balance'}</div>
          <div className={`value${balance > 0 ? ' money-due' : ''}`}>{money(Math.abs(balance))}</div>
        </div>
      </div>
      <div className="row-wrap mt-8 small muted">
        <span>
          Cash <span className="strong num">{money(cash)}</span>
        </span>
        <span aria-hidden="true">/</span>
        <span>
          UPI <span className="strong num">{money(upi)}</span>
        </span>
        {manual != null && <span className="tag">Total adjusted by admin</span>}
        {isMaster && (
          <button type="button" className="link-btn small" onClick={() => setEditingTotal(true)}>
            Adjust total
          </button>
        )}
      </div>

      <div className="divider" />
      {payments.length === 0 ? (
        <p className="empty" style={{ paddingTop: 0 }}>
          No payments recorded yet.
        </p>
      ) : (
        <div className="list">
          {payments.map((p) => (
            <div key={p.id} className="list-item" style={{ alignItems: 'center' }}>
              <span className="grow">
                <span className="row-wrap">
                  <span className="list-amount money-in">{money(p.amount)}</span>
                  <span className={`tag ${p.mode === 'upi' ? 'tag-berry' : ''}`}>{p.mode === 'upi' ? 'UPI' : 'Cash'}</span>
                </span>
                <span className="list-meta" style={{ display: 'block' }}>
                  {fmtDateTime(p.created_at)}
                  {p.created_by_name ? `, received by ${p.created_by_name}` : ''}
                </span>
                {p.reference && <span className="list-meta" style={{ display: 'block' }}>Ref. {p.reference}</span>}
              </span>
              {isMaster && (
                <button type="button" className="icon-btn sm" aria-label="Delete payment" onClick={() => remove(p)}>
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="section-foot">
        <button type="button" className="btn btn-block" onClick={onPrintReceipt}>
          <Icon name="receipt" size={18} />
          Print receipt
        </button>
      </div>

      {adding && <AddPaymentSheet uid={uid} balance={balance} onClose={() => setAdding(false)} onAdded={onPaymentsChanged} />}
      {editingTotal && (
        <TotalSheet
          uid={uid}
          current={manual}
          treatmentsTotal={treatmentsTotal}
          onClose={() => setEditingTotal(false)}
          onSaved={onPaymentsChanged}
        />
      )}
    </section>
  );
}
