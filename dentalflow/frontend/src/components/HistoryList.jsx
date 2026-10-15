import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHistory } from '../hooks/useHistory';
import { fmtTime } from '../lib/format';
import { HISTORY_AREAS, areaLabel } from '../lib/history';
import Icon from './Icon';
import { LoadingBlock, Sheet } from './ui';

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const ROLE = { master: 'admin', doctor: 'doctor', receptionist: 'reception' };

function EntrySheet({ entry, onClose }) {
  const details = entry.details && Object.keys(entry.details).length ? entry.details : null;
  return (
    <Sheet open onClose={onClose} title={areaLabel(entry.area)} subtitle={`${dayFmt.format(new Date(entry.at))}, ${fmtTime(entry.at)}`}>
      <p className="strong pre">{entry.summary}</p>
      <p className="small muted mt-4">
        By {entry.actor_name || 'someone'}
        {entry.actor_role ? ` (${ROLE[entry.actor_role] || entry.actor_role})` : ''}
      </p>
      {entry.patient_uid && (
        <Link to={`/patients/${entry.patient_uid}`} className="btn btn-sm mt-12" onClick={onClose}>
          Open patient {entry.patient_uid}
        </Link>
      )}
      {details && (
        <>
          <div className="field-label mt-16 mb-8">Saved details (kept so nothing is lost)</div>
          <pre className="history-json">{JSON.stringify(details, null, 2)}</pre>
        </>
      )}
    </Sheet>
  );
}

/** History entries grouped by day; tap one for the full details */
export function HistoryEntries({ entries, showPatient = true }) {
  const [open, setOpen] = useState(null);
  const groups = [];
  for (const e of entries) {
    const day = new Date(e.at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, at: e.at, items: [e] });
  }
  return (
    <>
      {groups.map((g) => (
        <div key={g.day} className="mb-12">
          <div className="field-label mb-4">{dayFmt.format(new Date(g.at))}</div>
          <div className="list">
            {g.items.map((e) => (
              <button key={e.id} type="button" className="list-item history-item" onClick={() => setOpen(e)} data-testid="history-entry">
                <span className="history-time">{fmtTime(e.at)}</span>
                <span className="grow">
                  <span className="history-summary">{e.summary}</span>
                  <span className="list-meta" style={{ display: 'block' }}>
                    {e.actor_name || 'Someone'}
                    {e.actor_role ? ` (${ROLE[e.actor_role] || e.actor_role})` : ''}
                    {showPatient && e.patient_uid ? `, patient ${e.patient_uid}` : ''}
                  </span>
                </span>
                <span className="tag">{areaLabel(e.area)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {open && <EntrySheet entry={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** A patient's full history (admin), from the patient's page */
export function PatientHistorySheet({ uid, name, onClose }) {
  const [area, setArea] = useState('');
  const h = useHistory({ patient_uid: uid, area });
  return (
    <Sheet open wide onClose={onClose} title="History" subtitle={`Everything changed on ${name}’s record, newest first.`}>
      <select className="select mb-12" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Show">
        {HISTORY_AREAS.filter((a) => !['team', 'settings', 'auth', 'backup'].includes(a.value)).map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {h.entries === null ? (
        <LoadingBlock />
      ) : h.entries.length === 0 ? (
        <p className="empty">{h.error || 'Nothing recorded yet.'}</p>
      ) : (
        <HistoryEntries entries={h.entries} showPatient={false} />
      )}
      {h.next && (
        <button type="button" className="btn btn-block" onClick={h.more} disabled={h.loadingMore}>
          <Icon name="down" size={18} />
          {h.loadingMore ? 'Loading…' : 'Show older'}
        </button>
      )}
    </Sheet>
  );
}
