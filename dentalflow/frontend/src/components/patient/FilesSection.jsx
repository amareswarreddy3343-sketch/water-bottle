import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api';
import { fmtShort } from '../../lib/format';
import { isImageUrl, isPdfUrl, prepareUpload } from '../../lib/image';
import { confirmAction, toast, toastError } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { Field, FormError, Sheet, useScrollLock } from '../ui';

const REPORT_TYPES = [
  { value: 'photo', label: 'Photo' },
  { value: 'xray', label: 'X-ray' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'other', label: 'Other' },
];
const typeLabel = (t) => REPORT_TYPES.find((r) => r.value === t)?.label || (t === 'referral' ? 'Referral' : 'File');

const MAX_MB = 10;

function UploadSheet({ uid, files, initialType, onClose, onUploaded }) {
  const [type, setType] = useState(initialType);
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(null); // { index, fraction }
  const [error, setError] = useState('');
  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const upload = async () => {
    setError('');
    const done = [];
    for (let i = 0; i < files.length; i += 1) {
      setProgress({ index: i, fraction: 0 });
      try {
        const file = await prepareUpload(files[i]);
        if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${files[i].name} is larger than ${MAX_MB} MB.`);
        const res = await api.uploadReport(uid, file, type, description.trim(), (fraction) => setProgress({ index: i, fraction }));
        done.push(res.report);
      } catch (err) {
        setError(err.response ? getErrorMessage(err, 'Upload failed.') : err.message || 'Upload failed. Check the connection.');
        break;
      }
    }
    setProgress(null);
    if (done.length) {
      onUploaded(done);
      toast(done.length === 1 ? 'Uploaded' : `${done.length} files uploaded`);
    }
    if (done.length === files.length) onClose();
  };

  const busy = progress !== null;
  const overall = busy ? ((progress.index + progress.fraction) / files.length) * 100 : 0;

  return (
    <Sheet
      open
      onClose={busy ? undefined : onClose}
      title={files.length === 1 ? 'Upload file' : `Upload ${files.length} files`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={upload} disabled={busy}>
            <Icon name="upload" size={18} />
            {busy ? `Uploading ${progress.index + 1} of ${files.length}…` : 'Upload'}
          </button>
        </>
      }
    >
      <div className="upload-previews mb-12">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`}>
            {previews[i] ? <img src={previews[i]} alt="" /> : <span>{f.name}</span>}
          </div>
        ))}
      </div>
      <div className="field-label mb-8">Type</div>
      <div className="row-wrap mb-12">
        {REPORT_TYPES.map((t) => (
          <button key={t.value} type="button" className="chip" aria-pressed={type === t.value} onClick={() => setType(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <Field label="Description" hint="Optional">
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. OPG before treatment"
        />
      </Field>
      {busy && (
        <div className="progress mt-12" role="progressbar" aria-valuenow={Math.round(overall)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${overall}%` }} />
        </div>
      )}
      <FormError>{error}</FormError>
    </Sheet>
  );
}

function Viewer({ reports, index, onIndex, onClose, canDelete, onDeleted }) {
  const report = reports[index];
  const [zoomed, setZoomed] = useState(false);
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < reports.length - 1) onIndex(index + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, reports.length, onIndex, onClose]);

  // swipe left / right between files
  const touch = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length === 1) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current || zoomed) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && index < reports.length - 1) onIndex(index + 1);
      if (dx > 0 && index > 0) onIndex(index - 1);
    }
  };

  if (!report) return null;
  const image = isImageUrl(report.file_url);

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Delete this file?',
      message: 'It is hidden from the patient’s record and moved to the trash. The admin can restore it from “Deleted files”.',
      confirmLabel: 'Delete file',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteReport(report.id);
      toast('File deleted');
      onDeleted(report.id);
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not delete the file.'));
    }
  };

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${typeLabel(report.report_type)} file`}>
      <div className="viewer-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={22} />
        </button>
        <div className="grow">
          <div className="strong">{typeLabel(report.report_type)}</div>
          <div className="tiny" style={{ opacity: 0.7 }}>
            {index + 1} of {reports.length}
          </div>
        </div>
        <a className="icon-btn" href={report.file_url} target="_blank" rel="noreferrer" aria-label="Open original">
          <Icon name="external" />
        </a>
        <a className="icon-btn" href={report.file_url} download aria-label="Download">
          <Icon name="download" />
        </a>
        {canDelete && (
          <button type="button" className="icon-btn" onClick={remove} aria-label="Delete file">
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className={`viewer-stage${zoomed ? ' zoomed' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {image ? (
          <img
            src={report.file_url}
            alt={report.description || typeLabel(report.report_type)}
            onClick={() => setZoomed((z) => !z)}
            style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Icon name="file" size={56} strokeWidth={1.5} />
            <p className="mt-12">{isPdfUrl(report.file_url) ? 'PDF document' : 'This file opens in another app.'}</p>
            <a className="btn btn-primary mt-16" href={report.file_url} target="_blank" rel="noreferrer">
              Open file
            </a>
          </div>
        )}
      </div>
      <div className="viewer-info">
        {report.description && <p style={{ color: '#fff', marginBottom: 4 }}>{report.description}</p>}
        <p>
          {fmtShort(report.uploaded_at)}
          {report.uploaded_by_name ? `, uploaded by ${report.uploaded_by_name}` : ''}
        </p>
        {reports.length > 1 && (
          <div className="spread mt-12">
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <Icon name="back" size={18} /> Previous
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}
              disabled={index === reports.length - 1}
              onClick={() => onIndex(index + 1)}
            >
              Next <Icon name="next" size={18} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Admin: files deleted from this record (kept in the trash) with Restore */
function DeletedFilesSheet({ uid, onClose, onRestored }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .deletedReports(uid)
      .then((r) => active && setList(r.reports || []))
      .catch((err) => {
        if (!active) return;
        setList([]);
        setError(getErrorMessage(err, 'Could not load deleted files.'));
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const restore = async (r) => {
    setBusy(r.id);
    try {
      const res = await api.restoreReport(r.id);
      setList((l) => l.filter((x) => x.id !== r.id));
      onRestored(res.report);
      toast('File restored');
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not restore the file.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Deleted files" subtitle="Deleted files are kept and can be put back.">
      {list === null ? (
        <p className="empty">Loading…</p>
      ) : list.length === 0 ? (
        <p className="empty">{error || 'No deleted files for this patient.'}</p>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="list-item" style={{ alignItems: 'center' }}>
              {isImageUrl(r.file_url) ? (
                <img src={r.file_url} alt="" className="thumb" loading="lazy" />
              ) : (
                <span className="thumb file-icon">
                  <Icon name="file" size={22} />
                </span>
              )}
              <span className="grow">
                <span className="list-title" style={{ display: 'block' }}>
                  {typeLabel(r.report_type)}
                  {r.description ? `: ${r.description}` : ''}
                </span>
                <span className="list-meta" style={{ display: 'block' }}>
                  Deleted {fmtShort(r.deleted_at)}
                  {r.deleted_by_name ? ` by ${r.deleted_by_name}` : ''}
                </span>
              </span>
              <button type="button" className="btn btn-sm" disabled={busy === r.id} onClick={() => restore(r)}>
                <Icon name="undo" size={16} />
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export default function FilesSection({ uid, reports, isMaster, onChange }) {
  const canDelete = isMaster;
  const [showDeleted, setShowDeleted] = useState(false);
  const cameraRef = useRef(null);
  const filesRef = useRef(null);
  const [pending, setPending] = useState(null); // { files, type }
  const [viewing, setViewing] = useState(null);
  const [filter, setFilter] = useState('all');

  const pick = (e, type) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > 25 * 1024 * 1024);
    if (tooBig) {
      toastError(`${tooBig.name} is too large (over 25 MB).`);
      return;
    }
    setPending({ files: files.slice(0, 10), type: type || (files.every((f) => f.type.startsWith('image/')) ? 'photo' : 'other') });
  };

  const shown = filter === 'all' ? reports : reports.filter((r) => r.report_type === filter);
  const typesPresent = REPORT_TYPES.filter((t) => reports.some((r) => r.report_type === t.value));

  return (
    <section className="section" id="files">
      <div className="section-head">
        <h2>
          Reports and photos
          {reports.length > 0 && <span className="count">{reports.length}</span>}
        </h2>
        {isMaster && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDeleted(true)}>
            <Icon name="trash" size={16} />
            Deleted
          </button>
        )}
      </div>

      <div className="row mb-12">
        <button type="button" className="btn grow" onClick={() => cameraRef.current?.click()}>
          <Icon name="camera" size={18} />
          Take photo
        </button>
        <button type="button" className="btn grow" onClick={() => filesRef.current?.click()}>
          <Icon name="upload" size={18} />
          Upload file
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e, 'photo')} />
        <input ref={filesRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => pick(e)} />
      </div>

      {typesPresent.length > 1 && (
        <div className="chip-scroll mb-12">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          {typesPresent.map((t) => (
            <button key={t.value} type="button" className="chip" aria-pressed={filter === t.value} onClick={() => setFilter(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="empty" style={{ paddingTop: 0 }}>
          No reports or photos yet. Take a photo or upload an X-ray, prescription or lab report.
        </p>
      ) : (
        <div className="file-grid">
          {shown.map((r) => {
            const image = isImageUrl(r.file_url);
            return (
              <button
                key={r.id}
                type="button"
                className={`file-tile${image ? '' : ' doc'}`}
                onClick={() => setViewing(shown.indexOf(r))}
                aria-label={`${typeLabel(r.report_type)}, ${fmtShort(r.uploaded_at)}${r.description ? `, ${r.description}` : ''}`}
              >
                {image ? (
                  <img src={r.file_url} alt="" loading="lazy" />
                ) : (
                  <span className="file-icon">
                    <Icon name="file" size={30} strokeWidth={1.6} />
                  </span>
                )}
                <span className="file-cap">
                  {typeLabel(r.report_type)}
                  <br />
                  <span style={{ fontWeight: 500, opacity: 0.85 }}>{fmtShort(r.uploaded_at)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pending && (
        <UploadSheet
          uid={uid}
          files={pending.files}
          initialType={pending.type}
          onClose={() => setPending(null)}
          onUploaded={(list) => onChange((prev) => [...[...list].reverse(), ...prev])}
        />
      )}
      {showDeleted && (
        <DeletedFilesSheet
          uid={uid}
          onClose={() => setShowDeleted(false)}
          onRestored={(report) => onChange((prev) => [report, ...prev.filter((r) => r.id !== report.id)])}
        />
      )}
      {viewing !== null && shown[viewing] && (
        <Viewer
          reports={shown}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          canDelete={canDelete}
          onDeleted={(id) => {
            setViewing(null);
            onChange((prev) => prev.filter((r) => r.id !== id));
          }}
        />
      )}
    </section>
  );
}
