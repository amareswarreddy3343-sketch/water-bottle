import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { PatientHistorySheet } from '../components/HistoryList';
import AppointmentsSection from '../components/patient/AppointmentsSection';
import ComplaintsSection from '../components/patient/ComplaintsSection';
import FilesSection from '../components/patient/FilesSection';
import PatientHeader from '../components/patient/PatientHeader';
import PaymentsSection from '../components/patient/PaymentsSection';
import PlanSection from '../components/patient/PlanSection';
import PrescriptionsSection from '../components/patient/PrescriptionsSection';
import ToothChartSection from '../components/patient/ToothChartSection';
import TreatmentsSection from '../components/patient/TreatmentsSection';
import { PrescriptionDocument, QuotationDocument, ReceiptDocument } from '../components/print/Documents';
import PrintPreview from '../components/print/PrintPreview';
import { LoadingBlock } from '../components/ui';
import { usePatientRecord } from '../hooks/usePatientRecord';
import AppShell from '../layouts/AppShell';
import { canRegister, isClinician } from '../lib/access';
import { fmtDate } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { toastError } from '../store/uiStore';
import { getErrorMessage } from '../utils/errors';

function PatientRecord({ uid }) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const clinician = isClinician(user);
  const record = usePatientRecord(uid, role);
  const { patient, totals, refresh, update } = record;
  const [printing, setPrinting] = useState(null); // { kind: 'receipt', data } | { kind: 'quote' } | { kind: 'rx', rx }
  const [historyOpen, setHistoryOpen] = useState(false);

  if (record.loading && !patient) {
    return (
      <AppShell title="Patient" back="/patients">
        <LoadingBlock />
      </AppShell>
    );
  }
  if (record.error || !patient) {
    return (
      <AppShell title="Patient" back="/patients">
        <div className="empty-big">
          <h3>{record.error === 'not-found' ? `No patient with ID ${uid}` : 'Could not open this patient'}</h3>
          <p>{record.error === 'not-found' ? 'Check the ID, or search by name or phone.' : record.error}</p>
          <Link to="/patients" className="btn mt-16">
            Search patients
          </Link>
        </div>
      </AppShell>
    );
  }

  const billChanged = () => refresh(['patient', 'treatments', 'payments']);

  const printReceipt = async () => {
    try {
      const data = await api.receipt(patient.uid);
      setPrinting({ kind: 'receipt', data });
    } catch (err) {
      toastError(
        err.response?.status === 404
          ? 'Nothing to print yet. Add a treatment or record a payment first.'
          : getErrorMessage(err, 'Could not prepare the receipt.'),
      );
    }
  };

  const jumps = [
    clinician && ['chart', 'Chart'],
    ['plan', 'Plan'],
    ['treatments', 'Treatments'],
    ['payments', 'Payments'],
    ['files', 'Files'],
    ['visit', 'Appointments'],
    ['medicines', 'Medicines'],
  ].filter(Boolean);

  const pendingPlan = record.proposals.filter((p) => p.status === 'proposed');

  return (
    <AppShell title={patient.name} back="/patients" titleOnScroll>
      <PatientHeader
        patient={patient}
        checkins={record.checkins}
        canEditConditions={clinician}
        canCheckIn={canRegister(user)}
        onPatientChange={(fn) => update('patient', fn)}
        onReload={() => refresh(['patient'])}
        onCheckedIn={() => refresh(['checkins', 'appointments'])}
        onHistory={role === 'master' ? () => setHistoryOpen(true) : undefined}
      />

      <nav className="jump-nav" aria-label="Sections">
        <div className="chip-scroll">
          {jumps.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="chip"
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {clinician && (
        <ComplaintsSection
          uid={patient.uid}
          complaints={record.complaints}
          canAdd={clinician}
          onAdded={(c) => update('complaints', (list) => [c, ...list])}
        />
      )}

      {clinician && <ToothChartSection uid={patient.uid} records={record.teeth} onChange={(fn) => update('teeth', fn)} />}

      <PlanSection
        uid={patient.uid}
        proposals={record.proposals}
        canEdit={clinician}
        onChange={(fn) => update('proposals', fn)}
        onBillChanged={billChanged}
        onPrintQuote={() => setPrinting({ kind: 'quote' })}
      />

      <TreatmentsSection
        uid={patient.uid}
        treatments={record.treatments}
        canAdd={clinician}
        onAdded={(t) => update('treatments', (list) => [t, ...list])}
      />

      <PaymentsSection
        uid={patient.uid}
        payments={record.payments}
        totals={totals}
        isMaster={role === 'master'}
        onPaymentsChanged={billChanged}
        onPrintReceipt={printReceipt}
      />

      <FilesSection
        uid={patient.uid}
        reports={record.reports}
        isMaster={role === 'master'}
        onChange={(fn) => update('reports', fn)}
      />

      <AppointmentsSection
        patient={patient}
        appointments={record.appointments}
        canEdit={clinician}
        onChanged={() => refresh(['appointments', 'patient'])}
      />

      {/* medicines with their date, at the end of the record */}
      <PrescriptionsSection
        uid={patient.uid}
        prescriptions={record.prescriptions}
        canEdit={clinician}
        onChanged={() => refresh(['prescriptions'])}
        onPrint={(rx) => setPrinting({ kind: 'rx', rx })}
      />

      {printing?.kind === 'receipt' && (
        <PrintPreview title={`Receipt ${patient.name} ${fmtDate(new Date())}`} onClose={() => setPrinting(null)}>
          <ReceiptDocument data={printing.data} preparedBy={user?.name} />
        </PrintPreview>
      )}
      {printing?.kind === 'rx' && (
        <PrintPreview title={`Prescription ${patient.name} ${fmtDate(printing.rx.date)}`} onClose={() => setPrinting(null)}>
          <PrescriptionDocument
            patient={patient}
            prescription={printing.rx}
            doctorName={printing.rx.created_by_name || (role === 'doctor' ? user?.name : undefined)}
          />
        </PrintPreview>
      )}
      {historyOpen && <PatientHistorySheet uid={patient.uid} name={patient.name} onClose={() => setHistoryOpen(false)} />}
      {printing?.kind === 'quote' && (
        <PrintPreview title={`Quotation ${patient.name} ${fmtDate(new Date())}`} onClose={() => setPrinting(null)}>
          <QuotationDocument patient={patient} items={pendingPlan} preparedBy={role === 'doctor' ? user?.name : undefined} />
        </PrintPreview>
      )}
    </AppShell>
  );
}

export default function PatientPage() {
  const { uid = '' } = useParams();
  const clean = uid.trim().toUpperCase();
  // re-mount for each patient so nothing from the previous one is shown
  return <PatientRecord key={clean} uid={clean} />;
}
