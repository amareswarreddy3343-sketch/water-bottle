/** Kinds of change in the admin's history (the part of the action before the dot) */
export const HISTORY_AREAS = [
  { value: '', label: 'Everything' },
  { value: 'patient', label: 'Patient details' },
  { value: 'visit', label: 'Visits' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'complaint', label: 'Complaints' },
  { value: 'tooth', label: 'Tooth chart' },
  { value: 'plan', label: 'Treatment plan' },
  { value: 'treatment', label: 'Treatments' },
  { value: 'payment', label: 'Payments' },
  { value: 'file', label: 'Files' },
  { value: 'prescription', label: 'Medicines' },
  { value: 'team', label: 'Team' },
  { value: 'settings', label: 'Settings' },
  { value: 'auth', label: 'Sign-ins and passwords' },
  { value: 'backup', label: 'Backups' },
];

export const areaLabel = (area) => HISTORY_AREAS.find((a) => a.value === area)?.label || area || 'Change';
