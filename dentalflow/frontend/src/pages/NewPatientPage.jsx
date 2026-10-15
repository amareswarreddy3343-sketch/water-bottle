import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import Icon from '../components/Icon';
import ConditionsPicker from '../components/patient/ConditionsPicker';
import { Field, FormError, Segmented } from '../components/ui';
import AppShell from '../layouts/AppShell';
import { fmtShort, fmtTime, initials, patientFacts } from '../lib/format';
import { confirmAction } from '../store/uiStore';
import { getErrorMessage } from '../utils/errors';

const EMPTY = { name: '', age: '', gender: 'female', phone: '' };
const REASONS = ['Tooth pain', 'Check-up', 'Follow-up', 'Cleaning', 'Swelling', 'Broken tooth'];

/** Quick reasons + free text */
function ReasonField({ value, onChange }) {
  return (
    <Field label="Reason for visit (optional)">
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 300))}
        placeholder="e.g. pain in lower left tooth"
        autoComplete="off"
      />
      <span className="row-wrap mt-8">
        {REASONS.map((r) => (
          <button key={r} type="button" className="chip chip-sm" aria-pressed={value === r} onClick={() => onChange(value === r ? '' : r)}>
            {r}
          </button>
        ))}
      </span>
    </Field>
  );
}

function PatientLine({ p, children }) {
  return (
    <div className="patient-row" style={{ cursor: 'default' }}>
      <span className="avatar">{initials(p.name)}</span>
      <span className="grow">
        <span className="list-title ellipsis" style={{ display: 'block' }}>
          {p.name}
        </span>
        <span className="list-meta" style={{ display: 'block' }}>
          <span className="uid">{p.uid}</span>
          {`  ${patientFacts(p)}`}
          {p.phone ? `, ${p.phone}` : ''}
        </span>
        <span className="list-meta" style={{ display: 'block' }}>
          Registered {fmtShort(p.created_at)}
          {p.last_treatment_date ? `, last treatment ${fmtShort(p.last_treatment_date)}` : ''}
        </span>
      </span>
      {children}
    </div>
  );
}

// ── Done screen (new or old patient) ───────────────────────────────────────
function Done({ result, onAnother }) {
  const navigate = useNavigate();
  const { patient, kind, already, at } = result;
  return (
    <>
      <div className="page-head">
        <div className="done-mark" aria-hidden="true">
          <Icon name="check" size={28} strokeWidth={3} />
        </div>
        <h1>{kind === 'new' ? `${patient.name} is registered` : already ? `${patient.name} is already here today` : `${patient.name} is registered for today`}</h1>
        <p>
          {already
            ? `Today’s visit was registered at ${fmtTime(at)}. Nothing was added twice.`
            : 'Added to today’s visits, so the doctor sees them under “Waiting today”.'}
        </p>
      </div>
      <section className="section">
        <div className="field-label">Patient ID</div>
        <div className="display uid" style={{ fontSize: 40, fontWeight: 750, marginTop: 4 }} data-testid="patient-uid">
          {patient.uid}
        </div>
        <p className="muted small mt-4">
          {kind === 'new' ? 'Write this ID on the patient’s file. ' : ''}The patient can also be found by name or phone.
        </p>
      </section>
      <div className="stack">
        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(`/patients/${patient.uid}`)}>
          Open patient
        </button>
        <button type="button" className="btn btn-block" onClick={onAnother}>
          Register another patient
        </button>
      </div>
    </>
  );
}

// ── New patient ─────────────────────────────────────────────────────────────
function NewPatientForm({ onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [conditions, setConditions] = useState([]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState([]);

  const set = (key) => (e) => {
    const value = key === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Already registered? Look up the phone number and name while typing
  useEffect(() => {
    const phone = form.phone.length >= 10 ? form.phone : '';
    const name = form.name.trim().length >= 3 ? form.name.trim() : '';
    let active = true;
    const t = setTimeout(() => {
      if (!phone && !name) {
        setMatches([]);
        return;
      }
      api
        .findDuplicates({ phone, name })
        .then((r) => active && setMatches(r.matches || []))
        .catch(() => {});
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [form.phone, form.name]);

  const problems = {
    name: !form.name.trim() ? 'Enter the patient’s name.' : '',
    age:
      form.age === ''
        ? 'Enter the age.'
        : !/^\d{1,3}$/.test(form.age) || Number(form.age) > 130
          ? 'Enter the age in years (0–130).'
          : '',
    phone: !form.phone ? 'Enter a phone number.' : form.phone.length !== 10 ? 'Phone number must have 10 digits.' : '',
  };
  const invalid = Object.values(problems).some(Boolean);

  const visitFor = async (p) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.checkIn(p.uid, reason.trim());
      onDone({ patient: p, kind: 'old', already: Boolean(res.already), at: res.created_at });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register the visit.'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) {
      // bring the first field that needs attention into view
      setTimeout(() => {
        const el = document.querySelector('.input.invalid');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    if (matches.length) {
      const ok = await confirmAction({
        title: 'Register as a new patient?',
        message: `${matches.length === 1 ? `${matches[0].name} (${matches[0].uid}) has` : `${matches.length} patients have`} the same phone number or name. If this is the same person, use “Today’s visit” on their record instead, so their history stays in one place.`,
        confirmLabel: 'Yes, new patient',
        cancelLabel: 'Go back',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const { patient } = await api.createPatient({
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        phone: form.phone,
        comorbidities: conditions,
        pre_problems: notes.trim(),
        reason: reason.trim(),
      });
      onDone({ patient, kind: 'new' });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register the patient.', ['name', 'age', 'phone', 'gender']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <section className="section">
        <div className="form-grid">
          <Field label="Full name" error={touched && problems.name}>
            <input
              className={`input${touched && problems.name ? ' invalid' : ''}`}
              value={form.name}
              onChange={set('name')}
              autoComplete="off"
              autoCapitalize="words"
              placeholder="Patient’s name"
            />
          </Field>
          <div className="form-grid two">
            <Field label="Age" error={touched && problems.age}>
              <input
                className={`input${touched && problems.age ? ' invalid' : ''}`}
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                inputMode="numeric"
                placeholder="Years"
              />
            </Field>
            <Field label="Phone" error={touched && problems.phone}>
              <input
                className={`input${touched && problems.phone ? ' invalid' : ''}`}
                value={form.phone}
                onChange={set('phone')}
                inputMode="tel"
                autoComplete="off"
                placeholder="10 digits"
              />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Sex</span>
            <Segmented
              label="Sex"
              value={form.gender}
              onChange={(gender) => setForm((f) => ({ ...f, gender }))}
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </div>
        </div>
      </section>

      {matches.length > 0 && (
        <section className="section callout-warn" aria-live="polite" data-testid="duplicates">
          <div className="section-head">
            <h2>Already registered?</h2>
          </div>
          <p className="small muted mb-8">
            Same phone number or name. If it is the same person, register today’s visit on their record instead of a new one.
          </p>
          <div className="list">
            {matches.map((p) => (
              <PatientLine key={p.uid} p={p}>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => visitFor(p)}>
                  Today’s visit
                </button>
              </PatientLine>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Comorbidities</h2>
        </div>
        <ConditionsPicker selected={conditions} onChange={setConditions} notes={notes} onNotesChange={setNotes} />
      </section>

      <section className="section">
        <ReasonField value={reason} onChange={setReason} />
      </section>

      <FormError>{error}</FormError>
      <button type="submit" className="btn btn-primary btn-block mt-8" disabled={busy} style={{ minHeight: 50 }}>
        <Icon name="userPlus" />
        {busy ? 'Registering…' : 'Register patient'}
      </button>
    </form>
  );
}

// ── Old patient: find them and register today's visit ──────────────────────
function OldPatientVisit({ onDone }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    let active = true;
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResults(null);
        return;
      }
      api
        .searchPatients(q)
        .then((r) => active && setResults((r.results || []).slice(0, 20)))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  const register = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.checkIn(chosen.uid, reason.trim());
      onDone({ patient: chosen, kind: 'old', already: Boolean(res.already), at: res.created_at });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register the visit.'));
    } finally {
      setBusy(false);
    }
  };

  if (chosen) {
    return (
      <>
        <section className="section">
          <div className="spread mb-8">
            <div className="field-label">Patient</div>
            <button type="button" className="link-btn" onClick={() => setChosen(null)}>
              Change
            </button>
          </div>
          <div className="list">
            <PatientLine p={chosen} />
          </div>
          {chosen.comorbidities?.length > 0 && (
            <div className="row-wrap mt-8">
              {chosen.comorbidities.map((c) => (
                <span key={c} className="condition">
                  {c}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="section">
          <ReasonField value={reason} onChange={setReason} />
        </section>
        <FormError>{error}</FormError>
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 50 }} disabled={busy} onClick={register}>
          <Icon name="checkIn" />
          {busy ? 'Registering…' : 'Register today’s visit'}
        </button>
        <p className="small faint mt-8" style={{ textAlign: 'center' }}>
          Uses their existing record. Nothing is duplicated.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="search-box mb-12">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, phone number or patient ID"
          aria-label="Find the patient"
          enterKeyHint="search"
          autoFocus
        />
      </div>
      <section className="section" style={{ paddingTop: 8, paddingBottom: 8 }}>
        {results === null ? (
          <p className="empty">Find the patient by name, phone number or patient ID.</p>
        ) : results.length === 0 ? (
          <div className="empty-big">
            <h3>No patient matches “{query.trim()}”</h3>
            <p>Check the spelling or try the phone number. New to the clinic? Use “New patient”.</p>
          </div>
        ) : (
          <div className="list">
            {results.map((p) => (
              <button key={p.uid} type="button" className="patient-row" onClick={() => setChosen(p)}>
                <span className="avatar">{initials(p.name)}</span>
                <span className="grow">
                  <span className="list-title ellipsis" style={{ display: 'block' }}>
                    {p.name}
                  </span>
                  <span className="list-meta" style={{ display: 'block' }}>
                    <span className="uid">{p.uid}</span>
                    {`  ${patientFacts(p)}`}
                    {p.phone ? `, ${p.phone}` : ''}
                  </span>
                </span>
                <Icon name="next" className="faint" />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function NewPatientPage() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'old' ? 'old' : 'new';
  const [result, setResult] = useState(null);
  const [round, setRound] = useState(0); // remounts the forms for "Register another"

  const setMode = (m) => {
    setParams(m === 'old' ? { mode: 'old' } : {}, { replace: true });
  };
  const finish = (r) => {
    setResult(r);
    window.scrollTo({ top: 0 });
  };

  if (result) {
    return (
      <AppShell title="Registered" back="/dashboard">
        <Done
          result={result}
          onAnother={() => {
            setResult(null);
            setRound((r) => r + 1);
            window.scrollTo({ top: 0 });
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Register" back="/dashboard">
      <div className="page-head">
        <h1>Register</h1>
        <p>
          A new patient, or an old patient visiting again.{' '}
          <Link to="/patients" className="strong">
            All patients
          </Link>
        </p>
      </div>
      <div className="mb-12">
        <Segmented
          label="Patient"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'new', label: 'New patient' },
            { value: 'old', label: 'Old patient' },
          ]}
        />
      </div>
      {mode === 'new' ? (
        <NewPatientForm key={`new-${round}`} onDone={finish} />
      ) : (
        <OldPatientVisit key={`old-${round}`} onDone={finish} />
      )}
    </AppShell>
  );
}

