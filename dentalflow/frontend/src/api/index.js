/** All server calls used by the app, in one place. Each returns the response body. */
import client from './client';

const data = (p) => p.then((r) => r.data);
const enc = encodeURIComponent;

export const api = {
  // auth
  login: (email, password) => data(client.post('/auth/login/', { email, password })),
  logout: (refresh) => data(client.post('/auth/logout/', { refresh })),
  me: () => data(client.get('/auth/me/')),

  // passwords
  passwordOptions: () => data(client.get('/auth/password/options/')),
  forgotPassword: (email) => data(client.post('/auth/password/forgot/', { email })),
  checkResetLink: (token) => data(client.post('/auth/password/reset/check/', { token })),
  resetPassword: (token, password) => data(client.post('/auth/password/reset/', { token, password })),
  changePassword: (body) => data(client.post('/auth/password/change/', body)),
  adminResetPassword: (id, body) => data(client.post(`/auth/admin/users/${id}/reset-password/`, body)),

  // users (master)
  listUsers: (includeRemoved = false) =>
    data(client.get(`/auth/admin/users/list/${includeRemoved ? '?include_removed=1' : ''}`)),
  createUser: (body) => data(client.post('/auth/admin/users/create/', body)),
  updateUser: (id, body) => data(client.patch(`/auth/admin/users/${id}/update/`, body)),
  removeUser: (id) => data(client.delete(`/auth/admin/users/${id}/`)),
  restoreUser: (id) => data(client.post(`/auth/admin/users/${id}/restore/`)),

  // clinic date (always the server's, never the phone's)
  meta: () => data(client.get('/meta/')),

  // settings
  getSettings: () => data(client.get('/settings/')),
  saveSettings: (body) => data(client.patch('/settings/', body)),

  // patients
  stats: () => data(client.get('/patients/stats/')),
  findDuplicates: ({ phone = '', name = '' }) =>
    data(client.get(`/patients/duplicates/?phone=${enc(phone)}&name=${enc(name)}`)),
  searchPatients: (q = '') => data(client.get(`/patients/search/?search=${enc(q)}`)),
  getPatient: (uid) => data(client.get(`/patients/${enc(uid)}/`)),
  createPatient: (body) => data(client.post('/patients/', body)),
  editPatient: (uid, body) => data(client.patch(`/patients/${uid}/edit/`, body)),
  saveConditions: (uid, body) => data(client.patch(`/patients/${uid}/problems/`, body)),
  setManualTotal: (uid, value) => data(client.patch(`/patients/${uid}/total/`, { manual_total: value })),
  checkIns: (uid) => data(client.get(`/patients/${uid}/checkin/`)),
  checkIn: (uid, reason = '') => data(client.post(`/patients/${uid}/checkin/`, { reason })),
  todayVisits: () => data(client.get('/visits/today/')),

  // appointments
  appointmentsForDay: (date) => data(client.get(`/appointments/${date ? `?date=${enc(date)}` : ''}`)),
  upcomingAppointments: (days = 7) => data(client.get(`/appointments/upcoming/?days=${days}`)),
  patientAppointments: (uid) => data(client.get(`/patients/${uid}/appointments/`)),
  addAppointment: (body) => data(client.post('/appointments/', body)),
  updateAppointment: (id, body) => data(client.patch(`/appointments/${id}/`, body)),
  cancelAppointment: (id) => data(client.post(`/appointments/${id}/cancel/`)),

  // prescriptions
  prescriptions: (uid) => data(client.get(`/prescriptions/${uid}/`)),
  addPrescription: (body) => data(client.post('/prescriptions/', body)),
  updatePrescription: (id, body) => data(client.patch(`/prescriptions/item/${id}/`, body)),
  deletePrescription: (id) => data(client.delete(`/prescriptions/item/${id}/`)),

  // payments
  payments: (uid) => data(client.get(`/patients/${uid}/payments/`)),
  addPayment: (uid, body) => data(client.post(`/patients/${uid}/payments/`, body)),
  deletePayment: (uid, id, reason = '') => data(client.delete(`/patients/${uid}/payments/${id}/`, { data: { reason } })),
  collections: ({ from, to, mode } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (mode) q.set('mode', mode);
    return data(client.get(`/payments/?${q}`));
  },

  // clinical
  complaints: (uid) => data(client.get(`/complaints/${uid}/`)),
  addComplaint: (uid, text) => data(client.post('/complaints/', { patient_uid: uid, complaint_text: text })),
  teeth: (uid) => data(client.get(`/tooth/${uid}/`)),
  saveTooth: (body) => data(client.post('/tooth/', body)),
  bulkTeeth: (body) => data(client.post('/tooth/bulk/', body)),
  deleteTooth: (uid, toothId) => data(client.delete(`/tooth/${uid}/${toothId}/`)),
  treatments: (uid) => data(client.get(`/treatments/${uid}/`)),
  addTreatment: (body) => data(client.post('/treatments/', body)),

  // treatment plan
  proposals: (uid) => data(client.get(`/proposals/${uid}/`)),
  addProposal: (body) => data(client.post('/proposals/', body)),
  updateProposal: (id, body) => data(client.patch(`/proposals/item/${id}/`, body)),
  deleteProposal: (id) => data(client.delete(`/proposals/item/${id}/`)),
  completeProposal: (id, body = {}) => data(client.post(`/proposals/item/${id}/done/`, body)),
  undoProposal: (id) => data(client.post(`/proposals/item/${id}/undo/`)),

  // reports & receipt
  reports: (uid) => data(client.get(`/reports/${uid}/`)),
  uploadReport: (uid, file, type, description, onProgress) => {
    const form = new FormData();
    form.append('patient_uid', uid);
    form.append('report_type', type);
    form.append('description', description || '');
    form.append('file', file);
    return data(
      client.post('/reports/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
        onUploadProgress: (e) => onProgress && e.total && onProgress(e.loaded / e.total),
      }),
    );
  },
  deleteReport: (id) => data(client.delete(`/reports/delete/${id}/`)),
  deletedReports: (uid) => data(client.get(`/reports/${uid}/?deleted=1`)),
  restoreReport: (id) => data(client.post(`/reports/${id}/restore/`)),
  receipt: (uid) => data(client.get(`/reports/receipt/${uid}/`)),

  // admin: history and backups
  history: (filters = {}) => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, v === true ? '1' : v);
    });
    return data(client.get(`/history/?${q}`));
  },
  backups: () => data(client.get('/backups/')),
  backupNow: () => data(client.post('/backups/', {}, { timeout: 600000 })),
  downloadBackup: (name) => client.get(`/backups/download/${enc(name)}`, { responseType: 'blob', timeout: 600000 }).then((r) => r.data),
};

export default api;
