import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { HistoryEntries } from '../components/HistoryList';
import Icon from '../components/Icon';
import ToothGlyph from '../components/patient/ToothGlyph';
import { Field, FormError, LoadingBlock, Segmented, Sheet, Switch } from '../components/ui';
import { useHistory } from '../hooks/useHistory';
import AppShell from '../layouts/AppShell';
import { copyText } from '../lib/clipboard';
import { fmtDateTime, fmtShort } from '../lib/format';
import { HISTORY_AREAS } from '../lib/history';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, confirmAction, toast, toastError, useSettings } from '../store/uiStore';
import { getErrorMessage } from '../utils/errors';

const ROLES = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'receptionist', label: 'Reception' },
  { value: 'master', label: 'Admin' },
];
const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || r;
const MAX_STATUSES = 10;
const PARTS = [
  { value: 'crown', label: 'Crown' },
  { value: 'root', label: 'Root' },
  { value: 'both', label: 'Both' },
];

// ── Team ────────────────────────────────────────────────────────────────────
function ResetPasswordSheet({ user, emailEnabled, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (body) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.adminResetPassword(user.id, body);
      onDone();
      if (body.mode === 'email') {
        toast(`Reset link emailed to ${user.email}`);
        onClose();
      } else {
        setResult(res.temporary_password);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset the password.', ['password']));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    toast((await copyText(result)) ? 'Copied' : 'Select the password and copy it');
  };

  if (result) {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Temporary password"
        footer={
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <p className="muted mb-12">
          Tell {user.name} this password. They will choose their own the first time they sign in, and any phone still
          signed in to their account is signed out.
        </p>
        <div className="section spread" style={{ marginBottom: 0 }}>
          <span className="display uid" style={{ fontSize: 26, userSelect: 'all' }} data-testid="temp-password">
            {result}
          </span>
          <button type="button" className="btn btn-sm" onClick={copy}>
            <Icon name="copy" size={16} />
            Copy
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Reset password" subtitle={`${user.name}, ${user.email}`}>
      <div className="stack">
        <div className="strong">Give a temporary password</div>
        <Field label="Temporary password" hint="Leave empty and one will be made for you">
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => run({ mode: 'temporary', password })}>
          <Icon name="key" size={18} />
          Set temporary password
        </button>
        <div className="divider" />
        {emailEnabled ? (
          <>
            <div className="strong">Or email a reset link</div>
            <p className="small muted">They choose a new password themselves. The link works once, for 30 minutes.</p>
            <button type="button" className="btn btn-block" disabled={busy} onClick={() => run({ mode: 'email' })}>
              Email a link to {user.email}
            </button>
          </>
        ) : (
          <p className="small faint">
            Email is not set up, so links can’t be sent. Staff can still reset their own password by email once it is
            (see “Email for password resets” in the README).
          </p>
        )}
        <FormError>{error}</FormError>
      </div>
    </Sheet>
  );
}

function UserSheet({ user, onClose, onSaved, emailEnabled }) {
  const isNew = !user;
  const me = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: '',
    password: '',
    role: user?.role || 'doctor',
    is_active: user?.is_active ?? true,
    can_view_collections: user?.can_view_collections ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const remove = async () => {
    const ok = await confirmAction({
      title: `Remove ${user.name}?`,
      message:
        'They are signed out and can no longer sign in. Their patients, notes, treatments and payments stay exactly as they are, with their name. You can restore them later from “Removed members”.',
      confirmLabel: 'Remove from team',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.removeUser(user.id);
      toast(`${user.name} removed. Their records are kept.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove this member.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        await api.createUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          can_view_collections: form.role === 'doctor' && form.can_view_collections,
        });
        toast(`${form.name.trim()} added`);
      } else {
        const body = { name: form.name.trim(), role: form.role, is_active: form.is_active };
        if (form.role === 'doctor') body.can_view_collections = form.can_view_collections;
        await api.updateUser(user.id, body);
        toast('Changes saved');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.', ['email', 'name', 'password', 'role']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Add team member' : user.name}
      subtitle={isNew ? 'They sign in with this email and password.' : user.email}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add member' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Dr. Priya Sharma" />
        </Field>
        {isNew && (
          <>
            <Field label="Email">
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
              />
            </Field>
            <Field label="Password" hint="At least 6 characters">
              <input
                className="input"
                type="text"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
              />
            </Field>
          </>
        )}
        <div className="field">
          <span className="field-label">Role</span>
          <Segmented label="Role" value={form.role} onChange={set('role')} options={ROLES} />
        </div>
        {form.role === 'doctor' && (
          <div className="spread">
            <div>
              <div className="strong">Can see collections</div>
              <div className="small faint">The money collected (cash and UPI) and the collections report.</div>
            </div>
            <Switch checked={form.can_view_collections} onChange={set('can_view_collections')} label="Can see collections" />
          </div>
        )}
        {!isNew && (
          <div className="spread">
            <div>
              <div className="strong">Can sign in</div>
              <div className="small faint">Turn off when someone leaves the clinic.</div>
            </div>
            <Switch
              checked={form.is_active}
              onChange={set('is_active')}
              label="Can sign in"
              disabled={user.id === me?.id}
            />
          </div>
        )}
        {!isNew && (
          <div className="spread">
            <div>
              <div className="strong">Password</div>
              <div className="small faint">
                {user.id === me?.id
                  ? 'Change your own password from the account menu.'
                  : user.must_change_password
                    ? 'Has a temporary password and will choose a new one at next sign in.'
                    : 'Forgotten? Give a temporary password.'}
              </div>
            </div>
            {user.id !== me?.id && (
              <button type="button" className="btn btn-sm" onClick={() => setResetting(true)}>
                Reset password
              </button>
            )}
          </div>
        )}
        {!isNew && user.id !== me?.id && (
          <div className="spread">
            <div>
              <div className="strong">Remove from the team</div>
              <div className="small faint">They can no longer sign in. Everything they recorded stays, with their name.</div>
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
              Remove
            </button>
          </div>
        )}
      </div>
      <FormError>{error}</FormError>
      {resetting && (
        <ResetPasswordSheet user={user} emailEnabled={emailEnabled} onClose={() => setResetting(false)} onDone={onSaved} />
      )}
    </Sheet>
  );
}

function TeamTab() {
  const [users, setUsers] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    api
      .passwordOptions()
      .then((r) => setEmailEnabled(Boolean(r.email_enabled)))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    api
      .listUsers(true)
      .then((r) => setUsers(r.users || []))
      .catch((err) => setError(getErrorMessage(err, 'Could not load the team.')));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const team = (users || []).filter((u) => !u.removed_at);
  const removed = (users || []).filter((u) => u.removed_at);

  const restore = async (u) => {
    setRestoring(u.id);
    try {
      await api.restoreUser(u.id);
      toast(`${u.name} is back on the team`);
      load();
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not restore.'));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>
            Team {users && <span className="count">{team.length}</span>}
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSheet({ user: null })}>
            <Icon name="plus" size={18} />
            Add
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {!users ? (
          <LoadingBlock />
        ) : (
          <div className="list">
            {team.map((u) => (
              <button key={u.id} type="button" className="list-item" onClick={() => setSheet({ user: u })} style={{ alignItems: 'center' }} data-testid="team-member">
                <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
                <span className="grow">
                  <span className="row-wrap">
                    <span className="list-title">{u.name}</span>
                    <span className="tag">{roleLabel(u.role)}</span>
                    {!u.is_active && <span className="tag tag-danger">Cannot sign in</span>}
                    {u.role === 'doctor' && u.can_view_collections && <span className="tag tag-green">Sees collections</span>}
                    {u.must_change_password && <span className="tag tag-warn">Temporary password</span>}
                  </span>
                  <span className="list-meta ellipsis" style={{ display: 'block' }}>
                    {u.email}
                  </span>
                </span>
                <Icon name="next" className="faint" />
              </button>
            ))}
          </div>
        )}
      </section>

      {removed.length > 0 && (
        <section className="section" data-testid="removed-members">
          <div className="section-head">
            <h2>
              Removed members <span className="count">{removed.length}</span>
            </h2>
          </div>
          <p className="small muted mb-8">They cannot sign in. Everything they recorded is still in the patients’ records.</p>
          <div className="list">
            {removed.map((u) => (
              <div key={u.id} className="list-item" style={{ alignItems: 'center' }}>
                <span className="avatar" style={{ opacity: 0.55 }}>
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="grow">
                  <span className="row-wrap">
                    <span className="list-title">{u.name}</span>
                    <span className="tag">{roleLabel(u.role)}</span>
                  </span>
                  <span className="list-meta" style={{ display: 'block' }}>
                    {u.email}, removed {fmtShort(u.removed_at)}
                  </span>
                </span>
                <button type="button" className="btn btn-sm" disabled={restoring === u.id} onClick={() => restore(u)}>
                  <Icon name="undo" size={16} />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sheet && (
        <UserSheet
          key={sheet.user?.id || 'new'}
          user={sheet.user}
          emailEnabled={emailEnabled}
          onClose={() => setSheet(null)}
          onSaved={load}
        />
      )}
    </>
  );
}

// ── History of every change ─────────────────────────────────────────────────
function HistoryTab() {
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [logins, setLogins] = useState(false);
  const h = useHistory({ area, q: search, from, to, hide_logins: !logins });

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="section">
      <div className="section-head">
        <h2>History</h2>
      </div>
      <p className="small muted mb-12">
        Every change made in the app: who did it and when. Deleted items keep a copy here, so nothing is lost.
      </p>
      <div className="form-grid mb-12">
        <div className="search-box">
          <Icon name="search" />
          <input
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: name, patient ID, words"
            aria-label="Search history"
          />
        </div>
        <select className="select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Show">
          {HISTORY_AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <div className="form-grid two">
          <Field label="From">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="spread">
          <span className="small">Show sign-ins</span>
          <Switch checked={logins} onChange={setLogins} label="Show sign-ins" />
        </div>
      </div>
      {h.entries === null ? (
        <LoadingBlock />
      ) : h.entries.length === 0 ? (
        <p className="empty">{h.error || 'Nothing found.'}</p>
      ) : (
        <HistoryEntries entries={h.entries} />
      )}
      {h.next && (
        <button type="button" className="btn btn-block" onClick={h.more} disabled={h.loadingMore}>
          <Icon name="down" size={18} />
          {h.loadingMore ? 'Loading…' : 'Show older'}
        </button>
      )}
    </section>
  );
}

// ── Backups ─────────────────────────────────────────────────────────────────
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function BackupsTab() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .backups()
      .then(setStatus)
      .catch((err) => setError(getErrorMessage(err, 'Could not load backups.')));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const backupNow = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.backupNow();
      toast(`Backup saved (${kb(res.backup.size)})`);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Backup failed.'));
    } finally {
      setBusy(false);
    }
  };

  const download = async (name) => {
    setDownloading(name);
    try {
      const blob = await api.downloadBackup(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not download the backup.'));
    } finally {
      setDownloading(null);
    }
  };

  const last = status?.last || status?.files?.[0];
  return (
    <section className="section">
      <div className="section-head">
        <h2>Backups</h2>
      </div>
      <p className="small muted mb-12">
        The whole database and every uploaded photo and report are backed up automatically once a day, and before any
        upgrade or restore.
      </p>
      {!status ? (
        error ? <p className="form-error">{error}</p> : <LoadingBlock />
      ) : (
        <>
          <div className="subcard mb-12">
            <div className="field-label">Last backup</div>
            <div className="strong mt-4" data-testid="last-backup">
              {last ? `${fmtDateTime(last.at || last.created_at)} (${kb(last.size)})` : 'No backup yet'}
            </div>
            {status.last_error && <p className="form-error">Last attempt failed: {status.last_error.message}</p>}
            <div className="field-label mt-12">Saved in</div>
            <div className="small mono-wrap mt-4">{status.dir}</div>
            {!status.custom_dir && (
              <p className="small callout-warn mt-8">
                Backups are on this computer only. Set <b>BACKUP_DIR</b> in backend/.env to a OneDrive or Google Drive
                folder (or a USB drive) so a copy survives if the computer fails.
              </p>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={backupNow} disabled={busy || status.running}>
            <Icon name="download" size={18} />
            {busy ? 'Backing up…' : 'Back up now'}
          </button>
          <FormError>{error}</FormError>

          <div className="field-label mt-16 mb-8">Backup files ({status.files.length})</div>
          {status.files.length === 0 ? (
            <p className="empty">No backup files yet.</p>
          ) : (
            <div className="list">
              {status.files.map((f) => (
                <div key={f.name} className="list-item" style={{ alignItems: 'center' }}>
                  <span className="grow">
                    <span className="list-title" style={{ display: 'block' }}>
                      {fmtDateTime(f.created_at)}
                    </span>
                    <span className="list-meta ellipsis" style={{ display: 'block' }}>
                      {f.name}, {kb(f.size)}
                    </span>
                  </span>
                  <button type="button" className="icon-btn sm" aria-label={`Download ${f.name}`} disabled={downloading === f.name} onClick={() => download(f.name)}>
                    <Icon name="download" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="small faint mt-12">
            To restore, stop the app and run <b>npm run restore -- &lt;backup file&gt; --yes</b> on the clinic computer (see
            the README). The current data is backed up first, so a restore can be undone.
          </p>
        </>
      )}
    </section>
  );
}

// ── Comorbidity list ───────────────────────────────────────────────────────
function ConditionsTab() {
  const settings = useSettings((s) => s.settings);
  const replace = useSettings((s) => s.replace);
  const [list, setList] = useState(settings.comorbidity_options);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(list) !== JSON.stringify(settings.comorbidity_options);

  const add = (e) => {
    e.preventDefault();
    const value = entry.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (list.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setError(`“${value}” is already in the list.`);
      return;
    }
    setError('');
    setList((l) => [...l, value]);
    setEntry('');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.saveSettings({ comorbidity_options: list });
      replace(res.settings);
      setList(res.settings.comorbidity_options);
      toast('Comorbidity list saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the list.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          Comorbidities <span className="count">{list.length}</span>
        </h2>
      </div>
      <p className="small muted mb-12">
        These appear as tick boxes when registering a patient and on the patient’s page. Removing one here does not remove
        it from patients who already have it.
      </p>
      <form className="row mb-12" onSubmit={add}>
        <input
          className="input grow"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="Add a condition, e.g. HIV"
          maxLength={60}
          aria-label="New condition"
        />
        <button type="submit" className="btn" disabled={!entry.trim()}>
          Add
        </button>
      </form>
      <div className="list">
        {list.map((c) => (
          <div key={c} className="list-item" style={{ alignItems: 'center', padding: '6px 0' }}>
            <span className="grow strong">{c}</span>
            <button
              type="button"
              className="icon-btn sm"
              aria-label={`Remove ${c}`}
              onClick={() => setList((l) => l.filter((x) => x !== c))}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
      <FormError>{error}</FormError>
      <div className="stack mt-16">
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save list'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setList(DEFAULT_SETTINGS.comorbidity_options)}>
          Use the default list
        </button>
      </div>
    </section>
  );
}

// ── Tooth status colours ────────────────────────────────────────────────────
function ColoursTab() {
  const settings = useSettings((s) => s.settings);
  const replace = useSettings((s) => s.replace);
  const [rows, setRows] = useState(settings.tooth_statuses.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(settings.tooth_statuses);

  const change = (i, key, value) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));

  const save = async () => {
    if (rows.some((r) => !r.label.trim())) {
      setError('Every colour needs a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.saveSettings({ tooth_statuses: rows.map((r) => ({ ...r, label: r.label.trim() })) });
      replace(res.settings);
      setRows(res.settings.tooth_statuses.map((s) => ({ ...s })));
      toast('Tooth colours saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the colours.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          Tooth chart colours <span className="count">{rows.length} of {MAX_STATUSES}</span>
        </h2>
      </div>
      <p className="small muted mb-12">
        Up to {MAX_STATUSES} colours. Each is used on the crown, the root, or both (like “Missing”), so a tooth’s crown and
        root can show different colours. Removing a colour clears it from the teeth that have it; which teeth had it is kept
        in the history.
      </p>
      <div className="stack">
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`} className="color-row">
            <input
              type="color"
              className="color-input"
              value={r.color}
              onChange={(e) => change(i, 'color', e.target.value)}
              aria-label={`Colour for ${r.label || 'status'}`}
            />
            <input
              className="input"
              value={r.label}
              maxLength={30}
              onChange={(e) => change(i, 'label', e.target.value)}
              placeholder="Status name"
              aria-label="Status name"
            />
            <button type="button" className="icon-btn" aria-label={`Remove ${r.label}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Icon name="trash" size={18} />
            </button>
            <div className="color-part">
              <Segmented label={`Where ${r.label || 'this colour'} is used`} value={r.part || 'both'} onChange={(v) => change(i, 'part', v)} options={PARTS} />
            </div>
          </div>
        ))}
      </div>
      {rows.length < MAX_STATUSES && (
        <button
          type="button"
          className="btn btn-sm mt-12"
          onClick={() => setRows((x) => [...x, { label: '', color: '#0ea5e9', part: 'crown' }])}
        >
          <Icon name="plus" size={18} />
          Add colour
        </button>
      )}

      {rows.length > 0 && (
        <div className="row-wrap mt-16" aria-label="Preview">
          {rows.map((r, i) => (
            <div key={r.id || `p-${i}`} style={{ textAlign: 'center', width: 64 }}>
              <div style={{ width: 26, margin: '0 auto' }}>
                <ToothGlyph
                  id="LL6"
                  crownColor={r.part === 'root' ? null : r.color}
                  rootColor={r.part === 'crown' ? null : r.color}
                  width={26}
                />
              </div>
              <div className="tiny muted ellipsis">{r.label || '—'}</div>
            </div>
          ))}
        </div>
      )}

      <FormError>{error}</FormError>
      <div className="stack mt-16">
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save colours'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            // keep the original ids so teeth already marked stay linked
            const keepId = (id) => (settings.tooth_statuses.some((s) => s.id === id) ? { id } : {});
            setRows(DEFAULT_SETTINGS.tooth_statuses.map((d) => ({ ...keepId(d.id), label: d.label, color: d.color, part: d.part })));
          }}
        >
          Use the default colours
        </button>
      </div>
    </section>
  );
}

const TABS = [
  { value: 'team', label: 'Team' },
  { value: 'history', label: 'History' },
  { value: 'backups', label: 'Backups' },
  { value: 'conditions', label: 'Comorbidities' },
  { value: 'colours', label: 'Tooth colours' },
];

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'team';
  const setTab = (v) => setParams(v === 'team' ? {} : { tab: v }, { replace: true });
  const load = useSettings((s) => s.load);
  const loaded = useSettings((s) => s.loaded);
  useEffect(() => {
    load(true);
  }, [load]);

  return (
    <AppShell title="Admin">
      <div className="page-head">
        <h1>Admin</h1>
        <p>Team, history, backups, comorbidity list and tooth chart colours.</p>
      </div>
      <div className="chip-scroll mb-12" role="tablist" aria-label="Admin section">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" className="chip" aria-selected={tab === t.value} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'team' && <TeamTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'backups' && <BackupsTab />}
      {(tab === 'conditions' || tab === 'colours') && !loaded && <LoadingBlock />}
      {tab === 'conditions' && loaded && <ConditionsTab />}
      {tab === 'colours' && loaded && <ColoursTab />}
    </AppShell>
  );
}
