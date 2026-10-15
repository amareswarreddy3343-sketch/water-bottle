import { useState } from 'react';
import api from '../../api';
import { fmtShort, money, toNumber } from '../../lib/format';
import { COMMON_PROCEDURES } from '../../lib/teeth';
import { toast, useToday } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, MoneyInput, Sheet } from '../ui';

function AddTreatmentSheet({ uid, onClose, onAdded }) {
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const today = useToday();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (description.trim().length < 3) {
      setError('Describe the treatment (at least 3 characters).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.addTreatment({
        patient_uid: uid,
        description: description.trim(),
        cost: cost === '' ? 0 : cost,
        treatment_date: date || null,
      });
      onAdded(res.treatment);
      toast('Treatment added');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add the treatment.', ['description', 'cost', 'treatment_date']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add treatment done"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Add treatment'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Treatment">
          <input
            className="input"
            list="treatment-names"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Composite filling LL6"
            data-autofocus
            autoCapitalize="sentences"
          />
          <datalist id="treatment-names">
            {COMMON_PROCEDURES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <div className="form-grid two">
          <Field label="Cost">
            <MoneyInput value={cost} onChange={setCost} />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
      <FormError>{error}</FormError>
    </Sheet>
  );
}

export default function TreatmentsSection({ uid, treatments, canAdd, onAdded }) {
  const [adding, setAdding] = useState(false);
  const total = treatments.reduce((s, t) => s + toNumber(t.cost), 0);
  const sorted = [...treatments].sort(
    (a, b) => (b.treatment_date || '').localeCompare(a.treatment_date || '') || (b.created_at || '').localeCompare(a.created_at || ''),
  );

  return (
    <section className="section" id="treatments">
      <div className="section-head">
        <h2>
          Treatments done
          {treatments.length > 0 && <span className="count">{treatments.length}</span>}
        </h2>
        {canAdd && (
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            Add
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="empty">No treatments recorded yet.</p>
      ) : (
        <div className="list">
          {sorted.map((t) => (
            <div key={t.id} className="list-item">
              <span className="grow">
                <span className="list-title">{t.description}</span>
                <span className="list-meta" style={{ display: 'block' }}>
                  {fmtShort(t.treatment_date)}
                  {t.performed_by_name ? `, by ${t.performed_by_name}` : ''}
                </span>
              </span>
              <span className="list-amount">{money(t.cost)}</span>
            </div>
          ))}
        </div>
      )}
      {sorted.length > 0 && (
        <>
          <div className="divider" />
          <div className="spread">
            <span className="strong">Total</span>
            <span className="display strong num" style={{ fontSize: 20 }}>
              {money(total)}
            </span>
          </div>
        </>
      )}
      {adding && <AddTreatmentSheet uid={uid} onClose={() => setAdding(false)} onAdded={onAdded} />}
    </section>
  );
}
