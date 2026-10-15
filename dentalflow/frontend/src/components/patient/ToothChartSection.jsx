import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import {
  ALL_TEETH,
  CROWN_SURFACES,
  contrastInk,
  coloursOf,
  LOWER,
  UPPER,
  hasCrownNote,
  hasRootNote,
  isUpper,
  parseNotes,
  partName,
  serializeNotes,
  statusesFor,
  toothName,
  toothNumber,
} from '../../lib/teeth';
import { confirmAction, toast, useSettings } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { FormError, Segmented, Sheet } from '../ui';
import ToothGlyph from './ToothGlyph';

const statusById = (statuses, id) => (id ? statuses.find((s) => s.id === id) || null : null);
const DOUBLE_TAP_MS = 350;

/**
 * Which part was tapped: the crown or root outline itself, or — when the tap lands
 * between the roots of a molar or just beside the outline — by its height on the tooth.
 */
function partFromTap(e, upper) {
  const hit = e.target.closest?.('[data-part]');
  if (hit) return hit.getAttribute('data-part');
  const svg = e.currentTarget.querySelector('svg');
  if (!svg || !e.detail) return 'crown'; // keyboard: Enter / Space
  const r = svg.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height; // 0 = top of the drawing, 1 = bottom
  if (y < 0 || y > 1) return 'crown'; // the tooth number
  const fromBiteLine = upper ? 1 - y : y; // crowns face the middle of the chart
  return fromBiteLine > 0.4 ? 'root' : 'crown';
}

// ── One arch row of 16 teeth ────────────────────────────────────────────────
function Arch({ teeth, byId, statuses, selected, selecting, peek, onTap }) {
  const upper = teeth[0].startsWith('U');
  return (
    <div className="arch" role="group" aria-label={upper ? 'Upper teeth' : 'Lower teeth'}>
      {teeth.map((id, i) => {
        const rec = byId[id];
        const notes = rec ? parseNotes(rec.notes) : {};
        const { crown, root } = coloursOf(rec);
        const crownStatus = statusById(statuses, crown);
        const rootStatus = statusById(statuses, root);
        const crownNote = hasCrownNote(notes);
        const rootNote = hasRootNote(notes);
        const isSel = selected.has(id);
        const label = [
          `${id}, ${toothName(id)}`,
          crownStatus ? `crown ${crownStatus.label}` : null,
          rootStatus ? `root ${rootStatus.label}` : null,
          crownNote ? 'crown note' : null,
          rootNote ? 'root note' : null,
        ]
          .filter(Boolean)
          .join(', ');
        const cell = (
          <button
            key={id}
            type="button"
            className={`tooth${isSel ? ' selected' : ''}${peek?.id === id ? ' peeked' : ''}`}
            onClick={(e) => onTap(id, partFromTap(e, upper))}
            aria-label={label}
            aria-pressed={selecting ? isSel : undefined}
            title={label}
            data-tooth={id}
          >
            {upper && <span className="tooth-no">{toothNumber(id)}</span>}
            <ToothGlyph
              id={id}
              crownColor={crownStatus?.color || null}
              rootColor={rootStatus?.color || null}
              crownNote={crownNote}
              rootNote={rootNote}
              highlight={peek?.id === id ? peek.part : undefined}
            />
            {!upper && <span className="tooth-no">{toothNumber(id)}</span>}
          </button>
        );
        return i === 8 ? [<span key="mid" className="midline" aria-hidden="true" />, cell] : cell;
      })}
    </div>
  );
}

// ── Single tap: the note of the part that was tapped ───────────────────────
function NotePeek({ toothId, part, record, statuses, onEdit, onClose }) {
  const notes = parseNotes(record?.notes);
  const { crown, root } = coloursOf(record);
  const status = statusById(statuses, part === 'root' ? root : crown);
  const parts = part === 'root' ? ['R'] : ['G', ...CROWN_SURFACES];
  const lines = parts.filter((p) => notes[p]);
  const otherHasNote = part === 'root' ? hasCrownNote(notes) : hasRootNote(notes);

  return (
    <div className="tooth-peek" role="status" aria-live="polite" data-testid="tooth-peek">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="strong">
            {toothId} {part === 'root' ? 'root' : 'crown'}
          </div>
          <div className="tiny muted">{toothName(toothId)}</div>
        </div>
        <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close note">
          <Icon name="close" size={18} />
        </button>
      </div>
      {status && (
        <span className="tag mt-8" style={{ background: status.color, color: contrastInk(status.color) }}>
          {status.label}
        </span>
      )}
      {lines.length ? (
        <div className="note-lines mt-8">
          {lines.map((p) => (
            <span key={p} className="pre">
              {parts.length > 1 && <b>{partName(p, toothId)}: </b>}
              {notes[p]}
            </span>
          ))}
        </div>
      ) : (
        <p className="small faint mt-8">
          No {part === 'root' ? 'root' : 'crown'} note{otherHasNote ? ` (the ${part === 'root' ? 'crown' : 'root'} has one)` : ''}.
        </p>
      )}
      <button type="button" className="btn btn-sm mt-8" onClick={onEdit}>
        <Icon name="pencil" size={16} />
        {lines.length ? 'Edit note' : 'Add note'}
      </button>
    </div>
  );
}

function ColourChips({ label, statuses, value, onChange, allowKeep, testid }) {
  return (
    <>
      <div className="field-label mb-8">{label}</div>
      <div className="row-wrap mb-12" data-testid={testid}>
        {allowKeep && (
          <button type="button" className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>
            Keep as is
          </button>
        )}
        <button type="button" className="chip" aria-pressed={value === ''} onClick={() => onChange('')}>
          <span className="swatch" style={{ background: 'var(--tooth-crown)' }} />
          None
        </button>
        {statuses.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={value === s.id} onClick={() => onChange(s.id)}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Editor for one tooth: crown + root colours, notes per part ─────────────
function ToothEditor({ uid, toothId, startPart, focusNote, record, statuses, onClose, onSaved, onDeleted, onNavigate }) {
  const initialNotes = useMemo(() => parseNotes(record?.notes), [record]);
  const initial = coloursOf(record);
  const [crown, setCrown] = useState(initial.crown);
  const [root, setRoot] = useState(initial.root);
  const [notes, setNotes] = useState(initialNotes);
  const [part, setPart] = useState(() =>
    startPart === 'root' ? 'R' : ['G', ...CROWN_SURFACES].find((p) => initialNotes[p]) || 'G',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef(null);

  useEffect(() => {
    if (!focusNote) return undefined;
    // double-tap means "write a note": put the cursor in the note box
    const t = setTimeout(() => textRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(t);
  }, [focusNote]);

  const dirty = crown !== initial.crown || root !== initial.root || serializeNotes(notes) !== serializeNotes(initialNotes);
  const upper = isUpper(toothId);
  const rightSide = toothId[1] === 'R';
  const index = ALL_TEETH.indexOf(toothId);
  const prev = index > 0 ? ALL_TEETH[index - 1] : null;
  const next = index < ALL_TEETH.length - 1 ? ALL_TEETH[index + 1] : null;

  // a status meant for the whole tooth (e.g. Missing) colours crown and root together
  const pickCrown = (id) => {
    setCrown(id);
    if (statusById(statuses, id)?.part === 'both') setRoot(id);
  };
  const pickRoot = (id) => {
    setRoot(id);
    if (statusById(statuses, id)?.part === 'both') setCrown(id);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { patient_uid: uid, tooth_id: toothId, notes: serializeNotes(notes) };
      // only colours that were changed are sent
      if (crown !== initial.crown) body.crown_status = crown;
      if (root !== initial.root) body.root_status = root;
      const res = await api.saveTooth(body);
      onSaved(res.record);
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this tooth.', ['crown_status', 'root_status', 'notes']));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const go = async (target) => {
    if (dirty && !(await save())) return;
    onNavigate(target);
  };

  const clearTooth = async () => {
    const ok = await confirmAction({
      title: `Clear ${toothId}?`,
      message: 'Its colours and all its notes are removed from the chart. A copy is kept in the history.',
      confirmLabel: 'Clear tooth',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteTooth(uid, toothId);
      onDeleted(toothId);
      toast(`${toothId} cleared`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not clear this tooth.'));
    } finally {
      setBusy(false);
    }
  };

  // Surface diagram as seen on the chart: outer surface away from the bite line,
  // mesial towards the midline.
  const top = upper ? 'B' : 'L';
  const bottom = upper ? 'L' : 'B';
  const left = rightSide ? 'D' : 'M';
  const right = rightSide ? 'M' : 'D';
  const cell = (p) => (
    <button
      type="button"
      aria-pressed={part === p}
      className={notes[p] ? 'has-note' : undefined}
      onClick={() => setPart(p)}
      title={partName(p, toothId)}
    >
      {p}
    </button>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Tooth ${toothId}`}
      subtitle={toothName(toothId)}
      footer={
        <>
          {record && (
            <button type="button" className="btn btn-danger" onClick={clearTooth} disabled={busy} style={{ flex: '0 0 auto' }}>
              <Icon name="trash" size={18} />
              <span className="sr-only">Clear tooth</span>
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !dirty}
            onClick={async () => {
              if (await save()) {
                toast(`${toothId} saved`);
                onClose();
              }
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="spread mb-12">
        <button type="button" className="btn btn-ghost btn-sm" disabled={!prev || busy} onClick={() => go(prev)}>
          <Icon name="back" size={18} />
          {prev}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!next || busy} onClick={() => go(next)}>
          {next}
          <Icon name="next" size={18} />
        </button>
      </div>

      <div className="part-picker mb-12">
        <div className="tooth-figure">
          <ToothGlyph
            id={toothId}
            width={84}
            crownColor={statusById(statuses, crown)?.color || null}
            rootColor={statusById(statuses, root)?.color || null}
            crownNote={hasCrownNote(notes)}
            rootNote={hasRootNote(notes)}
            highlight={part === 'R' ? 'root' : 'crown'}
            onPart={(p) => setPart(p === 'root' ? 'R' : 'G')}
          />
        </div>
        <div>
          <div className="part-row">
            <button
              type="button"
              className={`part-btn${notes.G ? ' has-note' : ''}`}
              aria-pressed={part === 'G'}
              onClick={() => setPart('G')}
            >
              Whole tooth
            </button>
            <button
              type="button"
              className={`part-btn${notes.R ? ' has-note' : ''}`}
              aria-pressed={part === 'R'}
              onClick={() => setPart('R')}
            >
              Root
            </button>
          </div>
          <div className="tiny faint mb-8" style={{ marginTop: 8 }}>
            Crown surfaces
          </div>
          <div className="surface-map" role="group" aria-label="Crown surfaces">
            <span />
            {cell(top)}
            <span />
            {cell(left)}
            {cell('O')}
            {cell(right)}
            <span />
            {cell(bottom)}
            <span />
          </div>
        </div>
      </div>

      <label className="field">
        <span>{partName(part, toothId)} note</span>
        <textarea
          ref={textRef}
          className="textarea"
          rows={3}
          value={notes[part] || ''}
          onChange={(e) => setNotes((n) => ({ ...n, [part]: e.target.value }))}
          placeholder={part === 'R' ? 'e.g. periapical lesion, RCT planned' : 'Write a note'}
        />
      </label>
      {Object.keys(notes).filter((p) => p !== part && notes[p]?.trim()).length > 0 && (
        <div className="note-lines mt-12">
          {['G', 'R', ...CROWN_SURFACES]
            .filter((p) => p !== part && notes[p]?.trim())
            .map((p) => (
              <button key={p} type="button" className="link-btn" style={{ textAlign: 'left', color: 'inherit', fontWeight: 400 }} onClick={() => setPart(p)}>
                <b>{partName(p, toothId)}:</b> {notes[p]}
              </button>
            ))}
        </div>
      )}

      <div className="divider" />
      <ColourChips label="Crown colour" statuses={statusesFor(statuses, 'crown')} value={crown} onChange={pickCrown} testid="crown-colours" />
      <ColourChips label="Root colour" statuses={statusesFor(statuses, 'root')} value={root} onChange={pickRoot} testid="root-colours" />
      <FormError>{error}</FormError>
    </Sheet>
  );
}

// ── Apply colours / a note to many teeth at once ────────────────────────────
function BulkEditor({ uid, teeth, statuses, onClose, onApplied }) {
  const [crown, setCrown] = useState(null); // null = don't change
  const [root, setRoot] = useState(null);
  const [part, setPart] = useState('G');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('append');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const describe =
    teeth.length === 32
      ? 'All 32 teeth'
      : teeth.length === 16 && teeth.every((t) => t.startsWith('U'))
        ? 'All upper teeth'
        : teeth.length === 16 && teeth.every((t) => t.startsWith('L'))
          ? 'All lower teeth'
          : teeth.join(', ');

  const apply = async () => {
    const body = { patient_uid: uid, tooth_ids: teeth };
    if (crown !== null) body.crown_status = crown;
    if (root !== null) body.root_status = root;
    if (text.trim() || mode === 'replace') body.note = { part, text: text.trim(), mode };
    if (body.crown_status === undefined && body.root_status === undefined && !body.note) {
      setError('Choose a colour or write a note.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.bulkTeeth(body);
      onApplied(res.records);
      toast(`Updated ${res.records.length} teeth`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update the teeth.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Update ${teeth.length} ${teeth.length === 1 ? 'tooth' : 'teeth'}`}
      subtitle={describe}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </>
      }
    >
      <ColourChips label="Crown colour" statuses={statusesFor(statuses, 'crown')} value={crown} onChange={setCrown} allowKeep />
      <ColourChips label="Root colour" statuses={statusesFor(statuses, 'root')} value={root} onChange={setRoot} allowKeep />
      <div className="divider" />
      <div className="field-label mb-8">Note</div>
      <div className="row-wrap mb-12">
        {['G', 'R', ...CROWN_SURFACES].map((p) => (
          <button key={p} type="button" className="chip" aria-pressed={part === p} onClick={() => setPart(p)}>
            {partName(p)}
          </button>
        ))}
      </div>
      <textarea
        className="textarea mb-12"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. scaling done"
        aria-label="Note text"
      />
      <Segmented
        label="How to save the note"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'append', label: 'Add to existing notes' },
          { value: 'replace', label: 'Replace' },
        ]}
      />
      {mode === 'replace' && !text.trim() && (
        <p className="small faint mt-8">With an empty note, “Replace” clears this part’s note on the selected teeth.</p>
      )}
      <FormError>{error}</FormError>
    </Sheet>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
export default function ToothChartSection({ uid, records, onChange }) {
  const statuses = useSettings((s) => s.settings.tooth_statuses);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // { id, part }
  const [peek, setPeek] = useState(null); // { id, part }
  const [bulkOpen, setBulkOpen] = useState(false);
  const lastTap = useRef({ id: null, part: null, at: 0 });

  const byId = useMemo(() => Object.fromEntries(records.map((r) => [r.tooth_id, r])), [records]);
  const charted = useMemo(
    () =>
      ALL_TEETH.map((id) => byId[id]).filter((r) => {
        if (!r) return false;
        const { crown, root } = coloursOf(r);
        return crown || root || Object.keys(parseNotes(r.notes)).length;
      }),
    [byId],
  );

  const startSelect = (ids) => {
    setPeek(null);
    setSelecting(true);
    setSelected(new Set(ids));
  };
  const stopSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // tap = show the note of the tapped part; double-tap = open the note editor
  const tap = (id, part) => {
    if (selecting) {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    if (prev.id === id && now - prev.at < DOUBLE_TAP_MS) {
      lastTap.current = { id: null, part: null, at: 0 };
      setPeek(null);
      setEditing({ id, part: prev.part || part, focus: true });
      return;
    }
    lastTap.current = { id, part, at: now };
    setPeek({ id, part });
  };

  const upsert = (list) =>
    onChange((prev) => {
      const map = Object.fromEntries(prev.map((r) => [r.tooth_id, r]));
      for (const r of list) map[r.tooth_id] = r;
      return Object.values(map);
    });

  const used = new Set(records.flatMap((r) => Object.values(coloursOf(r))).filter(Boolean));

  return (
    <section className="section" id="chart">
      <div className="section-head">
        <h2>Tooth chart</h2>
      </div>

      <div className="chart-tools" role="group" aria-label="Select teeth">
        <span className="small muted strong" style={{ marginRight: 2 }}>
          Select
        </span>
        <button type="button" className="chip" onClick={() => startSelect(ALL_TEETH)}>
          <Icon name="selectAll" size={15} />
          All
        </button>
        <button type="button" className="chip" onClick={() => startSelect(UPPER)}>
          Upper
        </button>
        <button type="button" className="chip" onClick={() => startSelect(LOWER)}>
          Lower
        </button>
        {!selecting ? (
          <button type="button" className="chip" onClick={() => startSelect([])}>
            Pick
          </button>
        ) : (
          <button type="button" className="chip" onClick={() => setSelected(new Set())}>
            None
          </button>
        )}
      </div>
      <p className="small muted mb-8">
        {selecting ? 'Tap teeth to add or remove them, then choose Update.' : 'Tap a crown or root to see its note. Double-tap to add or edit.'}
      </p>

      <div className={`chart${selecting ? ' selecting' : ''}`}>
        <div className="chart-side-labels">
          <span>Upper right</span>
          <span>Upper left</span>
        </div>
        <Arch teeth={UPPER} byId={byId} statuses={statuses} selected={selected} selecting={selecting} peek={peek} onTap={tap} />
        <div className="arch-gap" />
        <Arch teeth={LOWER} byId={byId} statuses={statuses} selected={selected} selecting={selecting} peek={peek} onTap={tap} />
        <div className="chart-side-labels">
          <span>Lower right</span>
          <span>Lower left</span>
        </div>
      </div>

      {peek && !selecting && (
        <NotePeek
          key={`${peek.id}-${peek.part}`}
          toothId={peek.id}
          part={peek.part}
          record={byId[peek.id]}
          statuses={statuses}
          onClose={() => setPeek(null)}
          onEdit={() => {
            setEditing({ ...peek, focus: true });
            setPeek(null);
          }}
        />
      )}

      <div className="legend" aria-label="Legend">
        {statuses.map((s) => (
          <span key={s.id} style={{ opacity: used.has(s.id) || !records.length ? 1 : 0.6 }}>
            <i className={`part-${s.part || 'both'}`} style={{ background: s.color }} />
            {s.label}
            {s.part && s.part !== 'both' ? <span className="faint"> ({s.part})</span> : null}
          </span>
        ))}
        <span>
          <i className="note-dot" />
          Has a note
        </span>
      </div>

      <div className="divider" />
      <div className="field-label mb-8">Tooth notes</div>
      {charted.length === 0 ? (
        <p className="empty" style={{ paddingTop: 4 }}>
          Nothing charted yet. Double-tap a tooth to add its colour or a note.
        </p>
      ) : (
        <div className="list tooth-notes-list">
          {charted.map((r) => {
            const notes = parseNotes(r.notes);
            const { crown, root } = coloursOf(r);
            const crownStatus = statusById(statuses, crown);
            const rootStatus = statusById(statuses, root);
            const badge = crownStatus || rootStatus;
            return (
              <button key={r.tooth_id} type="button" className="list-item" onClick={() => setEditing({ id: r.tooth_id, part: 'crown' })}>
                <span
                  className="tooth-badge"
                  style={badge ? { background: badge.color, color: contrastInk(badge.color), borderColor: 'transparent' } : undefined}
                >
                  {r.tooth_id}
                </span>
                <span className="grow">
                  <span className="row-wrap">
                    <span className="list-title">{toothName(r.tooth_id)}</span>
                    {crownStatus && crownStatus === rootStatus ? (
                      <span className="tag">{crownStatus.label}</span>
                    ) : (
                      <>
                        {crownStatus && <span className="tag">Crown: {crownStatus.label}</span>}
                        {rootStatus && <span className="tag">Root: {rootStatus.label}</span>}
                      </>
                    )}
                  </span>
                  {Object.keys(notes).length > 0 && (
                    <span className="note-lines">
                      {['G', 'R', ...CROWN_SURFACES]
                        .filter((p) => notes[p])
                        .map((p) => (
                          <span key={p} className="pre">
                            <b>{partName(p, r.tooth_id)}:</b> {notes[p]}
                          </span>
                        ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selecting && (
        <div className="select-bar" role="region" aria-label="Selected teeth">
          <span className="grow strong">
            {selected.size} {selected.size === 1 ? 'tooth' : 'teeth'} selected
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={stopSelect}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={selected.size === 0}
            onClick={() => setBulkOpen(true)}
          >
            Update
          </button>
        </div>
      )}

      {editing && (
        <ToothEditor
          key={editing.id}
          uid={uid}
          toothId={editing.id}
          startPart={editing.part}
          focusNote={Boolean(editing.focus)}
          record={byId[editing.id]}
          statuses={statuses}
          onClose={() => setEditing(null)}
          onSaved={(rec) => upsert([rec])}
          onDeleted={(id) => onChange((prev) => prev.filter((r) => r.tooth_id !== id))}
          onNavigate={(id) => setEditing({ id, part: 'crown' })}
        />
      )}
      {bulkOpen && (
        <BulkEditor
          uid={uid}
          teeth={ALL_TEETH.filter((t) => selected.has(t))}
          statuses={statuses}
          onClose={() => setBulkOpen(false)}
          onApplied={(list) => {
            upsert(list);
            stopSelect();
          }}
        />
      )}
    </section>
  );
}
