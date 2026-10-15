import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { fmtClock, fmtTime, initials, patientFacts } from '../../lib/format';
import { toast, toastError } from '../../store/uiStore';
import { parseLocalDate } from '../../utils/date';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

const sameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString();

export function AppointmentStatus({ status, arrivedAt }) {
  if (status === 'arrived') {
    return (
      <span className="tag tag-green">
        <Icon name="check" size={12} strokeWidth={3} />
        Arrived{arrivedAt ? ` ${fmtTime(arrivedAt)}` : ''}
      </span>
    );
  }
  if (status === 'missed') return <span className="tag tag-danger">Missed</span>;
  if (status === 'cancelled') return <span className="tag">Cancelled</span>;
  return <span className="tag tag-berry">Expected</span>;
}

function Conditions({ list }) {
  if (!list?.length) return null;
  return (
    <span className="row-wrap mt-4">
      {list.slice(0, 3).map((c) => (
        <span key={c} className="tag tag-warn">
          {c}
        </span>
      ))}
      {list.length > 3 && <span className="tag tag-warn">+{list.length - 3}</span>}
    </span>
  );
}

/** Today's appointments. Reception can check a patient in from here. */
export function AppointmentList({ items, canCheckIn, onChanged, emptyText = 'No appointments for today.' }) {
  const [busy, setBusy] = useState(null);

  const checkIn = async (a) => {
    setBusy(a.id);
    try {
      await api.checkIn(a.patient_uid);
      toast(`${a.patient.name} checked in`);
      onChanged?.();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not check in.'));
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return <p className="empty">{emptyText}</p>;
  return (
    <div className="list">
      {items.map((a) => (
        <div key={a.id} className="day-row" data-testid="appointment-row">
          <span className="day-time">{a.time ? fmtClock(a.time) : 'Any time'}</span>
          <Link to={`/patients/${a.patient_uid}`} className="day-main">
            <span className="list-title ellipsis" style={{ display: 'block' }}>
              {a.patient.name}
            </span>
            <span className="row-wrap" style={{ gap: 6, marginTop: 2 }}>
              <AppointmentStatus status={a.status} arrivedAt={a.arrived_at} />
              {a.purpose && <span className="list-meta">{a.purpose}</span>}
            </span>
            <span className="list-meta" style={{ display: 'block' }}>
              {[patientFacts(a.patient), a.patient.phone].filter(Boolean).join(', ')}
            </span>
            <Conditions list={a.patient.comorbidities} />
          </Link>
          {canCheckIn && a.status === 'scheduled' && (
            <button type="button" className="btn btn-sm" disabled={busy === a.id} onClick={() => checkIn(a)}>
              <Icon name="checkIn" size={16} />
              Check in
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Patients registered for today (new and old), waiting or seen */
export function VisitList({ items, emptyText = 'No one registered today yet.' }) {
  if (!items.length) return <p className="empty">{emptyText}</p>;
  return (
    <div className="list">
      {items.map((v) => (
        <Link key={v.id} to={`/patients/${v.patient.uid}`} className="patient-row" data-testid="visit-row">
          <span className="avatar">{initials(v.patient.name)}</span>
          <span className="grow">
            <span className="row" style={{ gap: 8 }}>
              <span className="list-title ellipsis">{v.patient.name}</span>
              {v.seen ? <span className="tag tag-green">Seen</span> : <span className="tag tag-warn">Waiting</span>}
            </span>
            <span className="list-meta" style={{ display: 'block' }}>
              {[v.reason, patientFacts(v.patient)].filter(Boolean).join(', ')}
            </span>
            <span className="list-meta" style={{ display: 'block' }}>
              Came at {fmtTime(v.registered_at)}
              {v.with_appointment ? ', had an appointment' : ''}
              {sameDay(v.patient.created_at, v.registered_at) ? ', new patient' : ''}
            </span>
            <Conditions list={v.patient.comorbidities} />
          </span>
          <Icon name="next" className="faint" />
        </Link>
      ))}
    </div>
  );
}

/** Next few days, grouped by date */
export function UpcomingList({ items }) {
  if (!items.length) return <p className="empty">No appointments in the next 7 days.</p>;
  const days = [];
  for (const a of items) {
    const last = days[days.length - 1];
    if (last && last.date === a.date) last.items.push(a);
    else days.push({ date: a.date, items: [a] });
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      {days.map((d) => (
        <div key={d.date}>
          <div className="field-label mb-4">
            {dayFmt.format(parseLocalDate(d.date))} <span className="count">{d.items.length}</span>
          </div>
          <div className="list">
            {d.items.map((a) => (
              <Link key={a.id} to={`/patients/${a.patient_uid}`} className="day-row compact">
                <span className="day-time">{a.time ? fmtClock(a.time) : '—'}</span>
                <span className="day-main">
                  <span className="list-title ellipsis" style={{ display: 'block' }}>
                    {a.patient.name}
                  </span>
                  <span className="list-meta" style={{ display: 'block' }}>
                    {[a.purpose, a.patient.phone].filter(Boolean).join(', ') || patientFacts(a.patient)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
