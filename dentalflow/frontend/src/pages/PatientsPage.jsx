import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import { LoadingBlock } from '../components/ui';
import AppShell from '../layouts/AppShell';
import { canRegister } from '../lib/access';
import { fmtShort, initials, patientFacts } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { useToday } from '../store/uiStore';
import { parseLocalDate } from '../utils/date';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' }, // came today or has an appointment today
  { id: 'new', label: 'Not treated yet' },
  { id: 'treated', label: 'Treated' },
];

const PERIODS = [
  { id: 'any', label: 'Any time', days: Infinity },
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 30 },
  { id: 'quarter', label: 'Last 3 months', days: 90 },
  { id: 'year', label: 'Last year', days: 365 },
];

const PAGE = 40;
const TODAY_TAG = { Waiting: 'tag-warn', Seen: 'tag-green', Arrived: 'tag-green', Missed: 'tag-danger', Appointment: 'tag-berry' };

/** Patients who came today or have an appointment today (from the server's date) */
function useTodaysPatients(enabled) {
  const [uids, setUids] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    Promise.allSettled([api.appointmentsForDay(), api.todayVisits()]).then(([a, v]) => {
      if (!active) return;
      const map = new Map();
      if (a.status === 'fulfilled') for (const x of a.value.appointments || []) map.set(x.patient_uid, x.status === 'arrived' ? 'Arrived' : x.status === 'missed' ? 'Missed' : 'Appointment');
      if (v.status === 'fulfilled') for (const x of v.value.visits || []) map.set(x.patient.uid, x.seen ? 'Seen' : 'Waiting');
      setUids(map);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return uids;
}

export default function PatientsPage() {
  const user = useAuthStore((s) => s.user);
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'all';
  const [period, setPeriod] = useState('any');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const todays = useTodaysPatients(tab === 'today');

  // live search (debounced)
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      api
        .searchPatients(query.trim())
        .then((r) => {
          if (!active) return;
          setResults(r.results || []);
          setError('');
          setLimit(PAGE);
        })
        .catch(() => active && setError('Could not load patients. Check the connection and reopen this page.'));
    }, query ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    if (!results) return [];
    if (tab === 'today') return todays ? results.filter((p) => todays.has(p.uid)) : [];
    if (tab === 'new') return results.filter((p) => !p.treatment_count);
    if (tab === 'treated') {
      const days = PERIODS.find((p) => p.id === period)?.days ?? Infinity;
      const now = new Date();
      return results
        .filter((p) => p.treatment_count > 0)
        .filter((p) => days === Infinity || (now - parseLocalDate(p.last_treatment_date)) / 86400000 <= days)
        .sort((a, b) => (b.last_treatment_date || '').localeCompare(a.last_treatment_date || ''));
    }
    return results;
  }, [results, tab, period, todays]);

  return (
    <AppShell title="Patients">
      <div className="page-head" style={{ paddingBottom: 12 }}>
        <div className="spread">
          <h1>Patients</h1>
          {canRegister(user) && (
            <Link to="/patients/new" className="btn btn-primary btn-sm">
              <Icon name="plus" size={18} />
              Register
            </Link>
          )}
        </div>
      </div>

      <div className="search-box mb-12">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone number or patient ID"
          aria-label="Search patients"
          enterKeyHint="search"
        />
      </div>

      <div className="chip-scroll mb-12" role="tablist" aria-label="Filter patients">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="chip"
            aria-selected={tab === t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'treated' && (
        <div className="mb-12">
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Last treatment">
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                Last treatment: {p.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="section" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {error ? (
          <p className="empty">{error}</p>
        ) : results === null || (tab === 'today' && !todays) ? (
          <LoadingBlock />
        ) : list.length === 0 ? (
          <div className="empty-big">
            <h3>{query ? `No patients match “${query}”` : tab === 'today' ? 'No one has come or is booked today' : 'No patients here yet'}</h3>
            <p>{query ? 'Check the spelling, or search by phone number or patient ID.' : 'Registered patients will appear in this list.'}</p>
          </div>
        ) : (
          <div className="list">
            {list.slice(0, limit).map((p) => (
              <Link key={p.uid} to={`/patients/${p.uid}`} className="patient-row">
                <span className="avatar">{initials(p.name)}</span>
                <span className="grow">
                  <span className="row" style={{ gap: 8 }}>
                    <span className="list-title ellipsis">{p.name}</span>
                    {tab === 'today' && todays?.get(p.uid) && (
                      <span className={`tag ${TODAY_TAG[todays.get(p.uid)] || ''}`}>
                        {todays.get(p.uid)}
                      </span>
                    )}
                    {p.comorbidities?.length > 0 && (
                      <span className="tag tag-warn" title={p.comorbidities.join(', ')}>
                        {p.comorbidities.length === 1 ? p.comorbidities[0] : `${p.comorbidities.length} conditions`}
                      </span>
                    )}
                  </span>
                  <span className="list-meta" style={{ display: 'block' }}>
                    <span className="uid">{p.uid}</span>
                    {`  ${patientFacts(p)}`}
                    {p.phone ? `, ${p.phone}` : ''}
                  </span>
                  {tab === 'treated' && p.last_treatment_date && (
                    <span className="list-meta" style={{ display: 'block' }}>
                      {p.treatment_count} treatment{p.treatment_count === 1 ? '' : 's'}, last on {fmtShort(p.last_treatment_date)}
                    </span>
                  )}
                  {tab === 'all' && p.next_appointment && p.next_appointment >= today && (
                    <span className="list-meta" style={{ display: 'block' }}>
                      Next visit {fmtShort(p.next_appointment)}
                    </span>
                  )}
                </span>
                <Icon name="next" className="faint" />
              </Link>
            ))}
          </div>
        )}
      </section>
      {list.length > limit && (
        <button type="button" className="btn btn-block" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({list.length - limit} more)
        </button>
      )}
    </AppShell>
  );
}
