import { useState } from 'react';
import api from '../../api';
import { fmtDate, fmtTime, patientFacts } from '../../lib/format';
import { toast, toastError, useToday } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, Segmented, Sheet } from '../ui';
import ConditionsPicker from './ConditionsPicker';

function EditDetailsSheet({ patient, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: patient.name,
    age: String(patient.age ?? ''),
    gender: patient.gender,
    phone: patient.phone || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim()) return setError('Enter the patient’s name.');
    if (!/^\d{1,3}$/.test(form.age)) return setError('Enter the age in years.');
    setBusy(true);
    setError('');
    try {
      const res = await api.editPatient(patient.uid, {
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        phone: form.phone.trim(),
      });
      toast(res.changes ? 'Details saved' : 'No changes to save');
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the details.'));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="form-grid two">
          <Field label="Age">
            <input
              className="input"
              inputMode="numeric"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
          </Field>
          <Field label="Phone">
            <input
              className="input"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 15) })}
            />
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Sex</span>
          <Segmented
            label="Sex"
            value={form.gender}
            onChange={(gender) => setForm({ ...form, gender })}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </div>
      <FormError>{error}</FormError>
    </Sheet>
  );
}

function ConditionsSheet({ patient, onClose, onSaved }) {
  const [selected, setSelected] = useState(patient.comorbidities || []);
  const [notes, setNotes] = useState(patient.pre_problems || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.saveConditions(patient.uid, { comorbidities: selected, pre_problems: notes });
      onSaved({ comorbidities: res.comorbidities, pre_problems: res.pre_problems });
      toast('Comorbidities saved');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Comorbidities"
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <ConditionsPicker selected={selected} onChange={setSelected} notes={notes} onNotesChange={setNotes} />
      <FormError>{error}</FormError>
    </Sheet>
  );
}

export default function PatientHeader({ patient, checkins, canEditConditions, canCheckIn, onPatientChange, onReload, onCheckedIn, onHistory }) {
  const [sheet, setSheet] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const today = useToday();
  // one visit per day, dated by the clinic (server), not by this phone
  const todaysVisit = checkins.find((c) => c.visit_date === today);
  const lastVisit = checkins.find((c) => c.visit_date && c.visit_date < today);
  const conditions = patient.comorbidities || [];

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      const res = await api.checkIn(patient.uid);
      toast(res.already ? `${patient.name} is already registered today` : `${patient.name} registered for today`);
      onCheckedIn();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not check in.'));
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="patient-hero">
      <h1>{patient.name}</h1>
      <div className="patient-facts">
        <span>{patientFacts(patient)}</span>
        <span className="uid">{patient.uid}</span>
        {patient.phone && (
          <a href={`tel:${patient.phone}`}>
            <Icon name="phone" size={16} />
            {patient.phone}
          </a>
        )}
      </div>
      <p className="small faint mt-4">
        Registered {fmtDate(patient.created_at)}
        {patient.created_by_name ? ` by ${patient.created_by_name}` : ''}
        {lastVisit ? `. Last visit ${fmtDate(lastVisit.visit_date)}` : ''}
      </p>

      <div className="section mt-12" style={{ marginBottom: 10 }}>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="field-label">Comorbidities</div>
            {conditions.length === 0 && !patient.pre_problems ? (
              <p className="small faint mt-4">None recorded</p>
            ) : (
              <>
                {conditions.length > 0 && (
                  <div className="row-wrap mt-8">
                    {conditions.map((c) => (
                      <span key={c} className="condition">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {patient.pre_problems && <p className="pre small mt-8">{patient.pre_problems}</p>}
              </>
            )}
          </div>
          {canEditConditions && (
            <button type="button" className="btn btn-sm" onClick={() => setSheet('conditions')}>
              <Icon name="pencil" size={16} />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="row-wrap">
        {todaysVisit ? (
          <span className="tag tag-green" style={{ padding: '7px 10px' }} data-testid="today-visit">
            <Icon name="check" size={14} strokeWidth={3} />
            Here today, since {fmtTime(todaysVisit.created_at)}
            {todaysVisit.reason ? ` (${todaysVisit.reason})` : ''}
          </span>
        ) : canCheckIn ? (
          <button type="button" className="btn btn-sm" onClick={checkIn} disabled={checkingIn}>
            <Icon name="checkIn" size={16} />
            {checkingIn ? 'Registering…' : 'Register today’s visit'}
          </button>
        ) : null}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSheet('details')}>
          <Icon name="pencil" size={16} />
          Edit details
        </button>
        {onHistory && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onHistory}>
            <Icon name="undo" size={16} />
            History
          </button>
        )}
      </div>

      {sheet === 'details' && <EditDetailsSheet patient={patient} onClose={() => setSheet(null)} onSaved={onReload} />}
      {sheet === 'conditions' && (
        <ConditionsSheet
          patient={patient}
          onClose={() => setSheet(null)}
          onSaved={(changes) => onPatientChange((p) => ({ ...p, ...changes }))}
        />
      )}
    </div>
  );
}
