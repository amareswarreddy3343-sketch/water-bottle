import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { toNumber } from '../lib/format';

const PIECES = ['patient', 'complaints', 'teeth', 'proposals', 'treatments', 'payments', 'reports', 'checkins', 'appointments', 'prescriptions'];

/**
 * Loads everything shown on a patient's page in parallel. Receptionists don't load
 * complaints or the tooth chart (the server does not share those with them).
 */
export function usePatientRecord(uid, role) {
  const clinician = role === 'doctor' || role === 'master';
  const [state, setState] = useState({
    loading: true,
    error: '',
    patient: null,
    complaints: [],
    teeth: [],
    proposals: [],
    treatments: [],
    payments: [],
    reports: [],
    checkins: [],
    appointments: [],
    prescriptions: [],
  });

  const fetchers = useMemo(
    () => ({
      patient: () => api.getPatient(uid).then((r) => r.patient),
      complaints: () => (clinician ? api.complaints(uid).then((r) => r.complaints || []) : Promise.resolve([])),
      teeth: () => (clinician ? api.teeth(uid).then((r) => r.records || []) : Promise.resolve([])),
      proposals: () => api.proposals(uid).then((r) => r.proposals || []),
      treatments: () => api.treatments(uid).then((r) => r.treatments || []),
      payments: () => api.payments(uid).then((r) => r.payments || []),
      reports: () => api.reports(uid).then((r) => r.reports || []),
      checkins: () => api.checkIns(uid).then((r) => r.checkins || []),
      appointments: () => api.patientAppointments(uid).then((r) => r.appointments || []),
      prescriptions: () => api.prescriptions(uid).then((r) => r.prescriptions || []),
    }),
    [uid, clinician],
  );

  /** Put freshly loaded parts of the record into state */
  const apply = useCallback((pieces, results) => {
    setState((s) => {
      const next = { ...s, loading: false };
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[pieces[i]] = r.value;
      });
      const at = pieces.indexOf('patient');
      if (at >= 0) {
        const failed = results[at].status === 'rejected';
        const err = failed ? results[at].reason : null;
        next.error = !failed ? '' : err?.response?.status === 404 ? 'not-found' : 'Could not load this patient. Check the connection.';
      }
      return next;
    });
  }, []);

  /** Reload some (or all) parts of the record */
  const refresh = useCallback(
    async (pieces = PIECES) => {
      const results = await Promise.allSettled(pieces.map((p) => fetchers[p]()));
      apply(pieces, results);
    },
    [fetchers, apply],
  );

  // (the page is re-mounted per patient, so this runs once per patient)
  useEffect(() => {
    Promise.allSettled(PIECES.map((p) => fetchers[p]())).then((results) => apply(PIECES, results));
  }, [fetchers, apply]);

  const update = useCallback((key, fn) => {
    setState((s) => ({ ...s, [key]: typeof fn === 'function' ? fn(s[key]) : fn }));
  }, []);

  const totals = useMemo(() => {
    const p = state.patient;
    const treatmentsTotal = state.treatments.reduce((sum, t) => sum + toNumber(t.cost), 0);
    const manual = p?.manual_total != null && p.manual_total !== '' ? toNumber(p.manual_total) : null;
    const billed = manual ?? treatmentsTotal;
    const paid = toNumber(p?.paid_amount);
    const cash = state.payments.filter((x) => x.mode !== 'upi').reduce((s, x) => s + toNumber(x.amount), 0);
    const upi = state.payments.filter((x) => x.mode === 'upi').reduce((s, x) => s + toNumber(x.amount), 0);
    return { treatmentsTotal, manual, billed, paid, balance: billed - paid, cash, upi };
  }, [state.patient, state.treatments, state.payments]);

  return { ...state, totals, refresh, update };
}
