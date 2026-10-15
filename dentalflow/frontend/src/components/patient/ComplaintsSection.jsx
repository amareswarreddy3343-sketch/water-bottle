import { useState } from 'react';
import api from '../../api';
import { fmtShort } from '../../lib/format';
import { toast } from '../../store/uiStore';
import { getErrorMessage } from '../../utils/errors';
import Icon from '../Icon';
import { FormError, Sheet } from '../ui';

function AddComplaintSheet({ uid, onClose, onAdded }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (text.trim().length < 3) {
      setError('Write at least 3 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.addComplaint(uid, text.trim());
      onAdded(res.complaint);
      toast('Complaint saved');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the complaint.', ['complaint_text']));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Chief complaint"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save complaint'}
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What brings the patient in today? e.g. pain in lower left back tooth for 3 days"
        aria-label="Chief complaint"
        data-autofocus
      />
      <FormError>{error}</FormError>
    </Sheet>
  );
}

export default function ComplaintsSection({ uid, complaints, canAdd, onAdded }) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? complaints : complaints.slice(0, 3);

  return (
    <section className="section" id="complaints">
      <div className="section-head">
        <h2>
          Chief complaints
          {complaints.length > 0 && <span className="count">{complaints.length}</span>}
        </h2>
        {canAdd && (
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            Add
          </button>
        )}
      </div>
      {complaints.length === 0 ? (
        <p className="empty">
          No complaints recorded yet.
        </p>
      ) : (
        <div className="list">
          {shown.map((c) => (
            <div key={c.id} className="list-item">
              <span className="grow">
                <span className="pre">{c.complaint_text}</span>
                <span className="list-meta" style={{ display: 'block' }}>
                  {fmtShort(c.created_at)}
                  {c.created_by_name ? `, ${c.created_by_name}` : ''}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {complaints.length > 3 && (
        <button type="button" className="link-btn mt-4" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${complaints.length}`}
        </button>
      )}
      {adding && <AddComplaintSheet uid={uid} onClose={() => setAdding(false)} onAdded={onAdded} />}
    </section>
  );
}
