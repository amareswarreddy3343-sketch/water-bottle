/**
 * Clinic settings: comorbidity pick-list and tooth-chart status colours.
 *   GET   /api/settings/   — every signed-in user (the app needs them to draw screens)
 *   PATCH /api/settings/   — Master admin only
 */
import crypto from 'node:crypto';
import { MAX_COMORBIDITY_OPTIONS, MAX_TOOTH_STATUSES, STATUS_PARTS, ToothRecord, loadSettings } from '../models/index.js';
import { audit } from '../utils/audit.js';
import { fieldErrors, forbidden } from '../utils/errors.js';
import { serializeSettings } from '../utils/serializers.js';
import Validator from '../utils/validation.js';

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function getSettings(req, res) {
  const settings = await loadSettings();
  res.json({ settings: serializeSettings(settings) });
}

/** Validates the tooth status list; returns { list } or { error } */
function parseToothStatuses(value, existing) {
  const existingIds = new Set(existing.map((s) => s.id));
  if (!Array.isArray(value)) return { error: 'Expected a list of statuses.' };
  if (value.length > MAX_TOOTH_STATUSES) {
    return { error: `You can define at most ${MAX_TOOTH_STATUSES} tooth statuses.` };
  }
  const list = [];
  const labels = new Set();
  const ids = new Set();
  for (const [i, item] of value.entries()) {
    const n = i + 1;
    if (!item || typeof item !== 'object') return { error: `Status ${n}: invalid value.` };
    const label = typeof item.label === 'string' ? item.label.trim().replace(/\s+/g, ' ') : '';
    if (!label) return { error: `Status ${n}: name is required.` };
    if (label.length > 30) return { error: `Status ${n}: name must be 30 characters or fewer.` };
    if (labels.has(label.toLowerCase())) return { error: `Status "${label}" is listed twice.` };
    labels.add(label.toLowerCase());

    const color = typeof item.color === 'string' ? item.color.trim() : '';
    if (!COLOR_RE.test(color)) return { error: `Status "${label}": colour must look like #a1b2c3.` };

    // Keep the id of an existing status (so teeth stay linked when it is renamed)
    let id = typeof item.id === 'string' && existingIds.has(item.id) ? item.id : null;
    if (!id || ids.has(id)) id = `st_${crypto.randomBytes(4).toString('hex')}`;
    ids.add(id);

    // Crown, root or both — when not sent, an existing status keeps what it had
    const keptPart = existing.find((s) => s.id === id)?.part || 'both';
    const part = item.part === undefined || item.part === null || item.part === '' ? keptPart : String(item.part);
    if (!STATUS_PARTS.includes(part)) return { error: `Status "${label}": use it for crown, root or both.` };
    list.push({ id, label, color: color.toLowerCase(), part });
  }
  return { list };
}

export async function updateSettings(req, res) {
  if (req.user.role !== 'master') throw forbidden('Only master admin can change clinic settings.');

  const settings = await loadSettings();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const v = new Validator(body);
  const errors = {};

  let comorbidities;
  if (v.has('comorbidity_options')) {
    comorbidities = v.stringList('comorbidity_options', { maxItems: MAX_COMORBIDITY_OPTIONS, maxLength: 60 });
  }

  let statuses;
  if (Object.prototype.hasOwnProperty.call(body, 'tooth_statuses')) {
    const parsed = parseToothStatuses(body.tooth_statuses, settings.tooth_statuses);
    if (parsed.error) errors.tooth_statuses = [parsed.error];
    else statuses = parsed.list;
  }

  if (v.hasErrors() || Object.keys(errors).length) {
    throw fieldErrors({ ...v.errors, ...errors });
  }

  let removedIds = [];
  const before = {
    comorbidity_options: [...settings.comorbidity_options],
    tooth_statuses: settings.tooth_statuses.map((t) => ({ id: t.id, label: t.label, color: t.color, part: t.part })),
  };
  if (comorbidities !== undefined) settings.comorbidity_options = comorbidities;
  if (statuses !== undefined) {
    const keep = new Set(statuses.map((s) => s.id));
    removedIds = settings.tooth_statuses.map((s) => s.id).filter((id) => !keep.has(id));
    settings.tooth_statuses = statuses;
  }
  settings.updated_by = req.user._id;
  await settings.save();

  // Teeth marked with a status that no longer exists go back to "no colour".
  // Which teeth had it is written to the history first, so nothing is lost.
  let affectedTeeth = [];
  if (removedIds.length) {
    const affected = await ToothRecord.find(
      { $or: [{ crown_status: { $in: removedIds } }, { root_status: { $in: removedIds } }, { status: { $in: removedIds } }] },
      'patient_uid tooth_id crown_status root_status status',
    ).lean();
    affectedTeeth = affected.map((r) => ({
      patient_uid: r.patient_uid,
      tooth_id: r.tooth_id,
      crown_status: r.crown_status || '',
      root_status: r.root_status || '',
      status: r.status || '',
    }));
    for (const r of affected) {
      const crown = removedIds.includes(r.crown_status) ? '' : r.crown_status || '';
      const root = removedIds.includes(r.root_status) ? '' : r.root_status || '';
      await ToothRecord.updateOne(
        { _id: r._id },
        { $set: { crown_status: crown, root_status: root, status: crown || root || '' } },
      );
    }
  }
  await audit(req, {
    action: 'settings.update',
    summary: [
      comorbidities !== undefined ? 'Changed the comorbidity list' : null,
      statuses !== undefined ? 'Changed the tooth chart colours' : null,
    ].filter(Boolean).join(', ') || 'Saved settings',
    details: { before, removed_status_ids: removedIds, teeth_that_had_removed_colours: affectedTeeth },
  });

  res.json({ message: 'Settings saved.', settings: serializeSettings(settings) });
}
