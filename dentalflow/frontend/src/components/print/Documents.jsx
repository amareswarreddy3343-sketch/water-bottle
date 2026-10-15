import { fmtDate, fmtDateTime, genderLabel, money2, rupeesInWords, toNumber } from '../../lib/format';
import { ClinicWordmark } from '../Logo';

const CLINIC = {
  phone: '8328011058',
  email: 'icare322025@gmail.com',
  timings: '10:30 am to 9:00 pm',
  address: ['45/1-A-T-1, 1st Floor, Near Ayyappa Swamy Temple,', 'Cake Walla Backside, A-Camp, KURNOOL - 518 002.'],
};

/** The clinic letterhead: green (receipt) or pink (quotation) */
function Letterhead({ variant, patient, date, children }) {
  const pink = variant === 'quote';
  const green = pink ? '#b8306f' : '#1f8a4c';
  return (
    <div className={`doc-page${pink ? ' quote' : ''}`}>
      <div className="doc-brand">
        <ClinicWordmark green={green} pink="#d23c7d" />
      </div>
      <div className="doc-contact">
        <div className="line">
          <span>Cell : {CLINIC.phone}</span>
          <span>Email. Id: {CLINIC.email}</span>
        </div>
        <div className="timing">Timings : {CLINIC.timings}</div>
      </div>
      <div className="doc-panel">
        <div className="doc-watermark" aria-hidden="true">
          <ClinicWordmark green={green} pink={green} />
        </div>
        <div className="doc-fields">
          <span>
            Patient Name :<b>{patient.name}</b>
          </span>
          <span>
            Age :<b>{patient.age}</b>
          </span>
          <span>
            Sex :<b>{genderLabel(patient.gender)}</b>
          </span>
          <span className="sub">
            Patient ID {patient.uid}
            {patient.phone ? `, phone ${patient.phone}` : ''}
          </span>
          <span className="date">
            Date :<b>{fmtDate(date)}</b>
          </span>
        </div>
        {children}
      </div>
      <div className="doc-foot">
        {CLINIC.address.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  );
}

/** Final receipt: treatments, every payment with its mode, and the balance */
export function ReceiptDocument({ data, preparedBy }) {
  const { patient } = data;
  const treatments = [...(data.treatments || [])].sort((a, b) =>
    (a.treatment_date || '').localeCompare(b.treatment_date || ''),
  );
  const payments = data.payments || [];
  const treatmentsTotal = treatments.reduce((s, t) => s + toNumber(t.cost), 0);
  const billed = toNumber(data.billed_total);
  const paid = toNumber(data.paid_total);
  const balance = toNumber(data.balance);
  const unrecorded = toNumber(data.paid_unrecorded);
  const adjusted = patient.manual_total != null && Math.abs(billed - treatmentsTotal) > 0.004;
  const today = new Date();
  const receiptNo = `${patient.uid}-${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  return (
    <Letterhead variant="receipt" patient={patient} date={today}>
      <div className="doc-title">
        <span>Payment receipt</span>
        <small>Receipt no. {receiptNo}</small>
      </div>

      <div className="doc-h">Treatment</div>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="n">#</th>
            <th style={{ width: '24mm' }}>Date</th>
            <th>Treatment</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {treatments.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ color: '#5d6a65' }}>
                No treatment recorded yet (advance payment).
              </td>
            </tr>
          ) : (
            treatments.map((t, i) => (
              <tr key={t.id}>
                <td className="n">{i + 1}</td>
                <td>{fmtDate(t.treatment_date)}</td>
                <td>{t.description}</td>
                <td className="r">{money2(t.cost)}</td>
              </tr>
            ))
          )}
        </tbody>
        {treatments.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="r">
                Treatment total
              </td>
              <td className="r">{money2(treatmentsTotal)}</td>
            </tr>
            {adjusted && (
              <tr>
                <td colSpan={3} className="r">
                  Bill total after adjustment
                </td>
                <td className="r">{money2(billed)}</td>
              </tr>
            )}
          </tfoot>
        )}
      </table>

      <div className="doc-h">Payments received</div>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Date and time</th>
            <th>Mode</th>
            <th>Received by</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && unrecorded <= 0 && (
            <tr>
              <td colSpan={5} style={{ color: '#5d6a65' }}>
                No payment received yet.
              </td>
            </tr>
          )}
          {payments.map((p, i) => (
            <tr key={p.id}>
              <td className="n">{i + 1}</td>
              <td>{fmtDateTime(p.created_at)}</td>
              <td>
                {p.mode === 'upi' ? 'UPI' : 'Cash'}
                {p.reference ? ` (Ref. ${p.reference})` : ''}
              </td>
              <td>{p.created_by_name || ''}</td>
              <td className="r">{money2(p.amount)}</td>
            </tr>
          ))}
          {unrecorded > 0 && (
            <tr>
              <td className="n">{payments.length + 1}</td>
              <td colSpan={3}>Paid earlier</td>
              <td className="r">{money2(unrecorded)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="doc-summary">
        <div>
          <span>Bill total</span>
          <span>{money2(billed)}</span>
        </div>
        <div>
          <span>Paid by cash</span>
          <span>{money2(data.paid_cash)}</span>
        </div>
        <div>
          <span>Paid by UPI</span>
          <span>{money2(data.paid_upi)}</span>
        </div>
        {unrecorded > 0 && (
          <div>
            <span>Paid earlier</span>
            <span>{money2(unrecorded)}</span>
          </div>
        )}
        <div>
          <span>Total paid</span>
          <span>{money2(paid)}</span>
        </div>
        <div className="total">
          <span>{balance < 0 ? 'Advance with clinic' : 'Balance due'}</span>
          <span>{money2(Math.abs(balance))}</span>
        </div>
      </div>
      <p className="doc-words">
        Received with thanks: <b>{rupeesInWords(paid)} only.</b>
      </p>

      <div className="doc-sign">
        <div>Patient / guardian</div>
        <div>
          Authorised signatory
          {preparedBy ? <div style={{ border: 0, padding: 0, minWidth: 0, color: '#5d6a65' }}>Prepared by {preparedBy}</div> : null}
        </div>
      </div>
    </Letterhead>
  );
}

/** Quotation (treatment plan) on the pink letterhead */
export function QuotationDocument({ patient, items, preparedBy }) {
  const total = items.reduce((s, p) => s + toNumber(p.cost), 0);
  const today = new Date();
  return (
    <Letterhead variant="quote" patient={patient} date={today}>
      <div className="doc-title">
        <span>Treatment quotation</span>
        <small>Estimate</small>
      </div>
      <table className="doc-table">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Proposed treatment</th>
            <th style={{ width: '28mm' }}>Tooth</th>
            <th className="r">Cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.id}>
              <td className="n">{i + 1}</td>
              <td>{p.procedure}</td>
              <td>{p.tooth || '—'}</td>
              <td className="r">{money2(p.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="doc-summary">
        <div className="total">
          <span>Estimated total</span>
          <span>{money2(total)}</span>
        </div>
      </div>
      <p className="doc-words">
        In words: <b>{rupeesInWords(total)} only.</b>
      </p>
      <p className="doc-note">
        This is an estimate. The final amount may change if the treatment needed changes during the course of care.
      </p>
      <div className="doc-sign">
        <div>Patient / guardian</div>
        <div>
          Doctor’s signature
          {preparedBy ? <div style={{ border: 0, padding: 0, minWidth: 0, color: '#5d6a65' }}>{preparedBy}</div> : null}
        </div>
      </div>
    </Letterhead>
  );
}

/** Prescription (medicines with the date) on the clinic letterhead */
export function PrescriptionDocument({ patient, prescription, doctorName }) {
  const items = prescription.items || [];
  return (
    <Letterhead variant="rx" patient={patient} date={prescription.date}>
      <div className="doc-title">
        <span>
          <span className="doc-rx" aria-hidden="true">
            ℞
          </span>{' '}
          Prescription
        </span>
        <small>Dated {fmtDate(prescription.date)}</small>
      </div>
      {patient.comorbidities?.length > 0 && (
        <p className="doc-note" style={{ marginTop: 0 }}>
          Medical history: {patient.comorbidities.join(', ')}
        </p>
      )}
      <table className="doc-table">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Medicine</th>
            <th>Dose</th>
            <th>When</th>
            <th style={{ width: '16mm' }}>Days</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => (
            <tr key={`${m.name}-${i}`}>
              <td className="n">{i + 1}</td>
              <td>
                <b>{m.name}</b>
                {m.notes ? <div style={{ color: '#5d6a65', fontSize: '0.92em' }}>{m.notes}</div> : null}
              </td>
              <td>{m.dose || '—'}</td>
              <td>{[m.frequency, m.timing ? m.timing.toLowerCase() : null].filter(Boolean).join(', ') || '—'}</td>
              <td>{m.days ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {prescription.advice && (
        <>
          <div className="doc-h">Advice</div>
          <p className="doc-advice">{prescription.advice}</p>
        </>
      )}
      <p className="doc-note">Take the medicines as directed. Contact the clinic if you notice any reaction.</p>
      <div className="doc-sign">
        <div>Patient / guardian</div>
        <div>
          Doctor’s signature
          {doctorName ? <div style={{ border: 0, padding: 0, minWidth: 0, color: '#5d6a65' }}>{doctorName}</div> : null}
        </div>
      </div>
    </Letterhead>
  );
}
