import { useState } from 'react';
import api from '../../api';
import { fmtClock, fmtDate } from '../../lib/format';
import { confirmAction, toast, toastError, useToday } from '../../store/uiStore';
import { addDaysISO, parseLocalDate } from '../../utils/date';
import { getErrorMessage } from '../../utils/errors';
import { AppointmentStatus } from '../dashboard/DayLists';
import Icon from '../Icon';
import { Field, FormError, Sheet } from '../ui';

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const PURPOSES = ['Review', 'RCT next sitting', 'Crown fitting', 'Filling', 'Scaling', 'Extraction', 'Suture removal', 'Denture trial'];
const QUICK = [
  { label: 'Tomorrow', days: 1 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
];

/** Date + time + purpose (used to book and to move an appointment) */
function AppointmentFields({ value, onChange, today }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="form-grid">
      <div>
        <div className="field-label mb-8">When</div>
        <div className="row-wrap mb-8">
          {QUICK.map((q) => {
            const d = addDaysISO(today, q.days);
            return (
              <button key={q.label} type="button" className="chip chip-sm" aria-pressed={value.date === d} onClick={() => set('date')(d)}>
                {q.label}
              </button>
            );
          })}
        </div>
        <div className="form-grid two">
          <Field label="Date">
            <input className="input" type="date" min={today} value={value.date} onChange={(e) => set('date')(e.target.value)} />
          </Field>
          <Field label="Time (optional)">
            <input className="input" type="time" value={value.time} onChange={(e) => set('time')(e.target.value)} step={300} />
          </Field>
        </div>
        {value.date && (
          <p className="small muted mt-4" data-testid="appointment-day">
            {dayFmt.format(parseLocalDate(value.date))}
          </p>
        )}
      </div>
      <Field label="For (optional)">
        <input
          className="input"
          value={value.purpose}
          maxLength={200}
          onChange={(e) => set('purpose')(e.target.value)}
          placeholder="e.g. RCT next sitting"
          list="appointment-purposes"
        />
        <datalist id="appointment-purposes">
          {PURPOSES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}

function MoveSheet({ appointment, today, onClose, onSaved }) {
  const [value, setValue] = useState({ date: appointment.date, time: appointment.time || '', purpose: appointment.purpose || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.updateAppointment(appointment.id, value);
      toast('Appointment changed');
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the appointment.', ['date', 'time', 'purpose']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Change appointment"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !value.date}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <AppointmentFields value={value} onChange={setValue} today={today} />
      <FormError>{error}</FormError>
    </Sheet>
  );
}

function Row({ a, today, canEdit, onMove, onCancel }) {
  return (
    <div className="list-item" style={{ alignItems: 'center' }} data-testid="patient-appointment">
      <span className="date-chip" aria-hidden="true">
        <b>{parseLocalDate(a.date).getDate()}</b>
        <span>{parseLocalDate(a.date).toLocaleString('en-IN', { month: 'short' })}</span>
      </span>
      <span className="grow">
        <span className="row-wrap">
          <span className="list-title">{dayFmt.format(parseLocalDate(a.date))}</span>
          {a.date === today && a.status === 'scheduled' ? <span className="tag tag-berry">Today</span> : null}
          {a.status !== 'scheduled' && <AppointmentStatus status={a.status} arrivedAt={a.arrived_at} />}
        </span>
        <span className="list-meta" style={{ display: 'block' }}>
          {[a.time ? fmtClock(a.time) : null, a.purpose, a.created_by_name ? `by ${a.created_by_name}` : null].filter(Boolean).join(', ') ||
            'Any time'}
        </span>
      </span>
      {canEdit && a.status === 'scheduled' && (
        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="icon-btn sm" aria-label="Change appointment" onClick={() => onMove(a)}>
            <Icon name="pencil" size={17} />
          </button>
          <button type="button" className="icon-btn sm" aria-label="Cancel appointment" onClick={() => onCancel(a)}>
            <Icon name="close" size={18} />
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * Appointments: the doctor gives the next one; it then shows on everyone's dashboard on
 * that day. Reception sees them here and checks the patient in when they come.
 */
export default function AppointmentsSection({ patient, appointments, canEdit, onChanged }) {
  const today = useToday();
  const [value, setValue] = useState({ date: '', time: '', purpose: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(null);

  const upcoming = appointments.filter((a) => a.status === 'scheduled' && a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = appointments.filter((a) => !upcoming.includes(a));

  const book = async () => {
    setBusy(true);
    setError('');
    try {
      await api.addAppointment({ patient_uid: patient.uid, ...value });
      toast(`Appointment on ${fmtDate(value.date)} saved`);
      setValue({ date: '', time: '', purpose: '' });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the appointment.', ['date', 'time', 'purpose']));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (a) => {
    const ok = await confirmAction({
      title: 'Cancel this appointment?',
      message: `${dayFmt.format(parseLocalDate(a.date))}${a.time ? ` at ${fmtClock(a.time)}` : ''}. It stays in the patient’s history as cancelled.`,
      confirmLabel: 'Cancel appointment',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.cancelAppointment(a.id);
      toast('Appointment cancelled');
      onChanged();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not cancel the appointment.'));
    }
  };

  return (
    <section className="section" id="visit">
      <div className="section-head">
        <h2>
          Appointments
          {upcoming.length > 0 && <span className="count">{upcoming.length}</span>}
        </h2>
      </div>

      {upcoming.length === 0 ? (
        <p className="faint mb-8">{canEdit ? 'No upcoming appointment.' : 'No upcoming appointment. The doctor gives the next appointment.'}</p>
      ) : (
        <div className="list mb-8">
          {upcoming.map((a) => (
            <Row key={a.id} a={a} today={today} canEdit={canEdit} onMove={setMoving} onCancel={cancel} />
          ))}
        </div>
      )}

      {canEdit && (
        <div className="subcard mt-8">
          <div className="strong mb-8">Give next appointment</div>
          <AppointmentFields value={value} onChange={setValue} today={today} />
          <FormError>{error}</FormError>
          <button type="button" className="btn btn-primary btn-block mt-12" disabled={busy || !value.date} onClick={book}>
            <Icon name="calendar" size={18} />
            {busy ? 'Saving…' : value.date ? `Book for ${fmtDate(value.date)}` : 'Choose a date'}
          </button>
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-12">
          <summary className="link-btn">Earlier appointments ({past.length})</summary>
          <div className="list mt-8">
            {past.map((a) => (
              <Row key={a.id} a={a} today={today} canEdit={false} />
            ))}
          </div>
        </details>
      )}

      {moving && <MoveSheet appointment={moving} today={today} onClose={() => setMoving(null)} onSaved={onChanged} />}
    </section>
  );
}
