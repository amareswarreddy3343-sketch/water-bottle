import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Field, LoadingBlock } from '../components/ui';
import AppShell from '../layouts/AppShell';
import { fmtDate, fmtShort, fmtTime, money } from '../lib/format';
import { useToday } from '../store/uiStore';
import { addDaysISO, parseLocalDate } from '../utils/date';
import { getErrorMessage } from '../utils/errors';

/** Date range for a preset, counted from the clinic's today (server date) */
function rangeFor(preset, today) {
  if (preset === 'yesterday') {
    const y = addDaysISO(today, -1);
    return { from: y, to: y };
  }
  if (preset === 'week') {
    const day = (parseLocalDate(today).getDay() + 6) % 7; // Monday = 0
    return { from: addDaysISO(today, -day), to: today };
  }
  if (preset === 'month') {
    return { from: `${today.slice(0, 8)}01`, to: today };
  }
  return { from: today, to: today };
}

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Choose dates' },
];

export default function CollectionsPage() {
  const today = useToday();
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState(() => rangeFor('month', today));
  const [mode, setMode] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const range = useMemo(() => (preset === 'custom' ? custom : rangeFor(preset, today)), [preset, custom, today]);

  useEffect(() => {
    let active = true;
    api
      .collections({ ...range, mode })
      .then((r) => {
        if (!active) return;
        setData(r);
        setError('');
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Could not load collections.')));
    return () => {
      active = false;
    };
  }, [range, mode]);

  const sameDay = range.from === range.to;

  return (
    <AppShell title="Collections">
      <div className="page-head">
        <h1>Collections</h1>
        <p>{sameDay ? fmtDate(range.from) : `${fmtDate(range.from)} to ${fmtDate(range.to)}`}</p>
      </div>

      <div className="chip-scroll mb-12">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="form-grid two mb-12">
          <Field label="From">
            <input
              className="input"
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </Field>
          <Field label="To">
            <input
              className="input"
              type="date"
              value={custom.to}
              min={custom.from}
              onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </Field>
        </div>
      )}

      {error ? (
        <p className="form-error">{error}</p>
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="money-row mb-12">
            <div>
              <div className="label">Total</div>
              <div className="value money-in">{money(data.total)}</div>
            </div>
            <div>
              <div className="label">Cash</div>
              <div className="value">{money(data.cash)}</div>
            </div>
            <div>
              <div className="label">UPI</div>
              <div className="value">{money(data.upi)}</div>
            </div>
          </div>

          <section className="section">
            <div className="section-head">
              <h2>
                Payments
                <span className="count">{data.payments.length}</span>
              </h2>
              <div className="segmented" style={{ width: 190 }}>
                {[
                  ['', 'All'],
                  ['cash', 'Cash'],
                  ['upi', 'UPI'],
                ].map(([value, label]) => (
                  <button key={label} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} style={{ minHeight: 32 }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {data.payments.length === 0 ? (
              <p className="empty">No payments in this period.</p>
            ) : (
              <div className="list">
                {data.payments.map((p) => (
                  <Link key={p.id} to={`/patients/${p.patient_uid}`} className="list-item">
                    <span className="grow">
                      <span className="list-title ellipsis" style={{ display: 'block' }}>
                        {p.patient_name || p.patient_uid}
                      </span>
                      <span className="list-meta" style={{ display: 'block' }}>
                        {sameDay ? fmtTime(p.created_at) : `${fmtShort(p.created_at)}, ${fmtTime(p.created_at)}`}
                        {p.created_by_name ? `, received by ${p.created_by_name}` : ''}
                      </span>
                      {p.reference && <span className="list-meta" style={{ display: 'block' }}>Ref. {p.reference}</span>}
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span className="list-amount money-in" style={{ display: 'block' }}>
                        {money(p.amount)}
                      </span>
                      <span className={`tag mt-4 ${p.mode === 'upi' ? 'tag-berry' : ''}`}>{p.mode === 'upi' ? 'UPI' : 'Cash'}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
