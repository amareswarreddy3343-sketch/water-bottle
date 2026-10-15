import { useState } from 'react';
import api from '../../api';
import { fmtShort, money, toNumber } from '../../lib/format';
import { COMMON_PROCEDURES } from '../../lib/teeth';
import { confirmAction, toast, useToday } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, MoneyInput, Sheet } from '../ui';

function ProcedureList() {
  return (
    <datalist id="procedures">
      {COMMON_PROCEDURES.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}

/** Add a new plan item, or view / edit / complete an existing one */
function PlanItemSheet({ uid, item, onClose, onSaved, onDeleted, onCompleted, onUndone }) {
  const isNew = !item;
  const done = item?.status === 'done';
  const [procedure, setProcedure] = useState(item?.procedure || '');
  const [tooth, setTooth] = useState(item?.tooth || '');
  const [cost, setCost] = useState(item ? String(toNumber(item.cost)) : '');
  const [finishing, setFinishing] = useState(false);
  const today = useToday();
  const [doneDate, setDoneDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn, fallback) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err, fallback, ['procedure', 'cost', 'tooth', 'treatment_date']));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (procedure.trim().length < 2) {
      setError('Enter the procedure.');
      return;
    }
    run(async () => {
      const body = { procedure: procedure.trim(), tooth: tooth.trim(), cost: cost === '' ? 0 : cost };
      const res = isNew ? await api.addProposal({ patient_uid: uid, ...body }) : await api.updateProposal(item.id, body);
      onSaved(res.proposal, isNew);
      toast(isNew ? 'Added to treatment plan' : 'Plan item updated');
      onClose();
    }, 'Could not save the plan item.');
  };

  const complete = () =>
    run(async () => {
      const res = await api.completeProposal(item.id, { treatment_date: doneDate, cost: cost === '' ? 0 : cost });
      onCompleted(res.proposal, res.treatment);
      toast('Marked as done and added to treatments');
      onClose();
    }, 'Could not mark this as done.');

  const undo = async () => {
    const ok = await confirmAction({
      title: 'Move back to the plan?',
      message: 'The matching entry in treatments done will be removed, and the bill will go down.',
      confirmLabel: 'Move back',
    });
    if (!ok) return;
    run(async () => {
      const res = await api.undoProposal(item.id);
      onUndone(res.proposal);
      toast('Moved back to the treatment plan');
      onClose();
    }, 'Could not undo.');
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Remove from plan?',
      message: done ? 'The treatment already recorded as done stays in treatments.' : undefined,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await api.deleteProposal(item.id);
      onDeleted(item.id);
      toast('Removed from treatment plan');
      onClose();
    }, 'Could not remove the item.');
  };

  if (done) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={item.procedure}
        subtitle={`Done on ${fmtShort(item.completed_at)}${item.tooth ? `, tooth ${item.tooth}` : ''}`}
        footer={
          <>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
              Remove
            </button>
            <button type="button" className="btn" onClick={undo} disabled={busy}>
              <Icon name="undo" size={18} />
              Not done yet
            </button>
          </>
        }
      >
        <div className="spread">
          <span className="muted">Cost</span>
          <span className="list-amount">{money(item.cost)}</span>
        </div>
        <FormError>{error}</FormError>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Add to treatment plan' : 'Plan item'}
      footer={
        finishing ? (
          <>
            <button type="button" className="btn" onClick={() => setFinishing(false)} disabled={busy}>
              Back
            </button>
            <button type="button" className="btn btn-green" onClick={complete} disabled={busy}>
              <Icon name="check" size={18} />
              {busy ? 'Saving…' : 'Confirm done'}
            </button>
          </>
        ) : (
          <>
            {!isNew && (
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy} style={{ flex: '0 0 auto' }}>
                <Icon name="trash" size={18} />
                <span className="sr-only">Remove</span>
              </button>
            )}
            {!isNew && (
              <button type="button" className="btn" onClick={() => setFinishing(true)} disabled={busy}>
                <Icon name="check" size={18} />
                Mark done
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </button>
          </>
        )
      }
    >
      {finishing ? (
        <div className="stack">
          <p className="muted">
            “{procedure}” will be added to treatments done, and its cost added to the patient’s bill.
          </p>
          <Field label="Date done">
            <input className="input" type="date" value={doneDate} max={today} onChange={(e) => setDoneDate(e.target.value)} />
          </Field>
          <Field label="Final cost">
            <MoneyInput value={cost} onChange={setCost} />
          </Field>
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Procedure">
            <input
              className="input"
              list="procedures"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              placeholder="e.g. Root canal treatment"
              data-autofocus
              autoCapitalize="sentences"
            />
            <ProcedureList />
          </Field>
          <div className="form-grid two">
            <Field label="Tooth" hint="Optional">
              <input
                className="input"
                value={tooth}
                onChange={(e) => setTooth(e.target.value.toUpperCase())}
                placeholder="e.g. LL6"
                autoCapitalize="characters"
              />
            </Field>
            <Field label="Cost">
              <MoneyInput value={cost} onChange={setCost} />
            </Field>
          </div>
        </div>
      )}
      <FormError>{error}</FormError>
    </Sheet>
  );
}

export default function PlanSection({ uid, proposals, canEdit, onChange, onBillChanged, onPrintQuote }) {
  const [sheet, setSheet] = useState(null); // { item } | { item: null } for new
  const pending = proposals.filter((p) => p.status === 'proposed');
  const done = proposals.filter((p) => p.status === 'done');
  const estimate = pending.reduce((s, p) => s + toNumber(p.cost), 0);

  const replace = (item) => onChange((list) => list.map((p) => (p.id === item.id ? item : p)));

  return (
    <section className="section" id="plan">
      <div className="section-head">
        <h2>
          Treatment plan
          {pending.length > 0 && <span className="count">{pending.length}</span>}
        </h2>
        {canEdit && (
          <button type="button" className="btn btn-sm" onClick={() => setSheet({ item: null })}>
            <Icon name="plus" size={18} />
            Add
          </button>
        )}
      </div>

      {proposals.length === 0 ? (
        <p className="empty">
          {canEdit ? 'Add the procedures you propose, with their cost, to give the patient a quotation.' : 'No treatment proposed yet.'}
        </p>
      ) : (
        <div className="list">
          {[...pending, ...done].map((p) => {
            const isDone = p.status === 'done';
            const Row = canEdit ? 'button' : 'div';
            return (
              <Row
                key={p.id}
                type={canEdit ? 'button' : undefined}
                className="list-item"
                onClick={canEdit ? () => setSheet({ item: p }) : undefined}
                style={isDone ? { opacity: 0.62 } : undefined}
              >
                <span className="grow">
                  <span className="list-title" style={isDone ? { textDecoration: 'line-through' } : undefined}>
                    {p.procedure}
                  </span>
                  <span className="list-meta row-wrap">
                    {p.tooth && <span className="tag">{p.tooth}</span>}
                    {isDone && <span className="tag tag-green">Done {fmtShort(p.completed_at)}</span>}
                  </span>
                </span>
                <span className="list-amount">{money(p.cost)}</span>
              </Row>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <>
          <div className="divider" />
          <div className="spread">
            <span className="strong">Estimate</span>
            <span className="display strong num" style={{ fontSize: 20 }}>
              {money(estimate)}
            </span>
          </div>
        </>
      )}
      {pending.length > 0 && (
        <div className="section-foot">
          <button type="button" className="btn btn-block" onClick={onPrintQuote}>
            <Icon name="printer" size={18} />
            Print quotation
          </button>
        </div>
      )}

      {sheet && (
        <PlanItemSheet
          key={sheet.item?.id || 'new'}
          uid={uid}
          item={sheet.item}
          onClose={() => setSheet(null)}
          onSaved={(item, isNew) => (isNew ? onChange((list) => [...list, item]) : replace(item))}
          onDeleted={(id) => onChange((list) => list.filter((p) => p.id !== id))}
          onCompleted={(item) => {
            replace(item);
            onBillChanged();
          }}
          onUndone={(item) => {
            replace(item);
            onBillChanged();
          }}
        />
      )}
    </section>
  );
}
