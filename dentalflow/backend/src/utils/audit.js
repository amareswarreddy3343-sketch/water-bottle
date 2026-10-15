/**
 * Record an entry in the change history. Never throws: a history problem must not
 * stop the actual work (it is reported in the server console instead).
 */
import { AuditLog } from '../models/AuditLog.js';

/** Plain copy of a document for the history (no internal fields, no password) */
export function snapshot(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject({ depopulate: true }) : { ...doc };
  delete obj.__v;
  delete obj.password;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * @param req     Express request (for the signed-in user and IP) or null for system actions
 * @param entry   { action, summary, patient_uid?, details? }
 */
export async function audit(req, { action, summary, patient_uid = null, details = null }) {
  try {
    const user = req?.user;
    await AuditLog.create({
      actor: user?._id ?? null,
      actor_name: user?.name ?? 'System',
      actor_role: user?.role ?? 'system',
      action,
      area: action.split('.')[0],
      patient_uid,
      summary,
      details,
      ip: req?.ip || '',
    });
  } catch (err) {
    console.error(`⚠️  Could not write history entry (${action}): ${err.message}`);
  }
}

/** { field: { old, new } } for the fields that changed */
export function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    const a = before?.[f];
    const b = after?.[f];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changes[f] = { old: a ?? null, new: b ?? null };
  }
  return changes;
}
