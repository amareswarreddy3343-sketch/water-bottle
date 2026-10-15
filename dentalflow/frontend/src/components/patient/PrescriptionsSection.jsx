import { useState } from 'react';
import api from '../../api';
import { fmtDate, fmtShort } from '../../lib/format';
import { COMMON_MEDICINES, FREQUENCIES, describeMedicine } from '../../lib/medicines';
import { confirmAction, toast, toastError, useToday } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, Segmented, Sheet } from '../ui';

const blankRow = () => ({ name: '', dose: '', frequency: '', days: '', timing: 'After food', notes: '' });

function MedicineRow({ row, index, onChange, onRemove, canRemove }) {
  const set = (k) => (v) => onChange({ ...row, [k]: v });
  return (
    <div className="med-row" data-testid="medicine-row">
      <div className="spread mb-8">
        <span className="strong">Medicine {index + 1}</span>
        {canRemove && (
          <button type="button" className="icon-btn sm" aria-label={`Remove medicine ${index + 1}`} onClick={onRemove}>
            <Icon name="trash" size={17} />
          </button>
        )}
      </div>
      <div className="form-grid">
        <input
          className="input"
          value={row.name}
          onChange={(e) => set('name')(e.target.value)}
          placeholder="Medicine name and strength, e.g. Amoxicillin 500 mg"
          aria-label={`Medicine ${index + 1} name`}
          list="medicine-names"
          maxLength={120}
        />
        <div className="form-grid two">
          <Field label="Dose">
            <input className="input" value={row.dose} onChange={(e) => set('dose')(e.target.value)} placeholder="1 tab" maxLength={40} />
          </Field>
          <Field label="Days">
            <input
              className="input"
              value={row.days}
              inputMode="numeric"
              onChange={(e) => set('days')(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="5"
            />
          </Field>
        </div>
        <div>
          <div className="field-label mb-8">How often</div>
          <div className="row-wrap">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                className="chip chip-sm"
                aria-pressed={row.frequency === f.value}
                title={f.hint}
                onClick={() => set('frequency')(row.frequency === f.value ? '' : f.value)}
              >
                {f.value}
              </button>
            ))}
          </div>
        </div>
        <Segmented
          label="Food"
          value={row.timing}
          onChange={set('timing')}
          options={[
            { value: 'Before food', label: 'Before food' },
            { value: 'After food', label: 'After food' },
            { value: '', label: 'Any time' },
          ]}
        />
        <input
          className="input"
          value={row.notes}
          onChange={(e) => set('notes')(e.target.value)}
          placeholder="Note (optional), e.g. for pain only"
          aria-label={`Medicine ${index + 1} note`}
          maxLength={200}
        />
      </div>
    </div>
  );
}

function PrescriptionSheet({ uid, prescription, onClose, onSaved }) {
  const today = useToday();
  const [date, setDate] = useState(prescription?.date || today);
  const [rows, setRows] = useState(() =>
    prescription?.items?.length
      ? prescription.items.map((m) => ({ ...blankRow(), ...m, days: m.days == null ? '' : String(m.days) }))
      : [blankRow()],
  );
  const [advice, setAdvice] = useState(prescription?.advice || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const items = rows.filter((r) => r.name.trim());
    if (!items.length) {
      setError('Add at least one medicine.');
      return;
    }
    setBusy(true);
    setError('');
    const body = { date, items, advice: advice.trim() };
    try {
      if (prescription) await api.updatePrescription(prescription.id, body);
      else await api.addPrescription({ patient_uid: uid, ...body });
      toast(prescription ? 'Prescription updated' : 'Prescription saved');
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the prescription.', ['items', 'date', 'advice']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={prescription ? 'Edit prescription' : 'Write prescription'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save prescription'}
          </button>
        </>
      }
    >
      <datalist id="medicine-names">
        {COMMON_MEDICINES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <Field label="Date">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="stack mt-12">
        {rows.map((r, i) => (
          <MedicineRow
            key={i}
            row={r}
            index={i}
            canRemove={rows.length > 1}
            onChange={(next) => setRows((list) => list.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setRows((list) => list.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      {rows.length < 30 && (
        <button type="button" className="btn btn-sm mt-12" onClick={() => setRows((list) => [...list, blankRow()])}>
          <Icon name="plus" size={18} />
          Add medicine
        </button>
      )}
      <Field label="Advice (optional)">
        <textarea
          className="textarea mt-4"
          rows={2}
          value={advice}
          maxLength={1000}
          onChange={(e) => setAdvice(e.target.value)}
          placeholder="e.g. warm salt-water rinses, soft diet for 2 days"
        />
      </Field>
      <FormError>{error}</FormError>
    </Sheet>
  );
}

/** Medicines prescribed, with their date — at the end of the patient's page */
export default function PrescriptionsSection({ uid, prescriptions, canEdit, onChanged, onPrint }) {
  const [editing, setEditing] = useState(null); // { prescription } | { prescription: null }
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? prescriptions : prescriptions.slice(0, 3);

  const remove = async (rx) => {
    const ok = await confirmAction({
      title: 'Remove this prescription?',
      message: `Prescription of ${fmtDate(rx.date)}. It is hidden from the record but kept in the admin’s history.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePrescription(rx.id);
      toast('Prescription removed');
      onChanged();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not remove the prescription.'));
    }
  };

  return (
    <section className="section" id="medicines">
      <div className="section-head">
        <h2>
          Medicines
          {prescriptions.length > 0 && <span className="count">{prescriptions.length}</span>}
        </h2>
        {canEdit && (
          <button type="button" className="btn btn-sm" onClick={() => setEditing({ prescription: null })}>
            <Icon name="plus" size={18} />
            Prescribe
          </button>
        )}
      </div>

      {prescriptions.length === 0 ? (
        <p className="empty">No medicines prescribed yet.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {shown.map((rx) => (
            <article key={rx.id} className="rx-card" data-testid="prescription">
              <div className="spread">
                <div>
                  <div className="strong">{fmtDate(rx.date)}</div>
                  <div className="list-meta">
                    {rx.created_by_name ? `By ${rx.created_by_name}` : ''}
                    {rx.updated_by_name ? `, edited ${fmtShort(rx.updated_at)}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn sm" aria-label="Print prescription" onClick={() => onPrint(rx)}>
                    <Icon name="printer" size={18} />
                  </button>
                  {canEdit && (
                    <>
                      <button type="button" className="icon-btn sm" aria-label="Edit prescription" onClick={() => setEditing({ prescription: rx })}>
                        <Icon name="pencil" size={17} />
                      </button>
                      <button type="button" className="icon-btn sm" aria-label="Remove prescription" onClick={() => remove(rx)}>
                        <Icon name="trash" size={17} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <ol className="rx-list">
                {rx.items.map((m, i) => (
                  <li key={i}>
                    <span className="strong">{m.name}</span>
                    {describeMedicine(m) && <span className="muted"> — {describeMedicine(m)}</span>}
                    {m.notes && <span className="faint">. {m.notes}</span>}
                  </li>
                ))}
              </ol>
              {rx.advice && <p className="small pre mt-4">Advice: {rx.advice}</p>}
            </article>
          ))}
        </div>
      )}
      {prescriptions.length > 3 && (
        <button type="button" className="link-btn mt-8" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${prescriptions.length}`}
        </button>
      )}

      {editing && (
        <PrescriptionSheet uid={uid} prescription={editing.prescription} onClose={() => setEditing(null)} onSaved={onChanged} />
      )}
    </section>
  );
}
