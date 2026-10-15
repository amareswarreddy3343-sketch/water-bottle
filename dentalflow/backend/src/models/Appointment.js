/**
 * Appointments given by the doctor. A patient can have several (past and upcoming).
 * The patient's `next_appointment` field is kept in step with the earliest upcoming one.
 */
import mongoose from 'mongoose';

export const APPOINTMENT_STATUSES = ['scheduled', 'arrived', 'cancelled'];

const { ObjectId } = mongoose.Schema.Types;

const appointmentSchema = new mongoose.Schema(
  {
    patient_uid: { type: String, required: true, uppercase: true, maxlength: 6 },
    // clinic-local date 'YYYY-MM-DD' and optional time 'HH:MM'
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, default: '', match: /^(|\d{2}:\d{2})$/ },
    purpose: { type: String, default: '', trim: true, maxlength: 200 },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled' },
    created_by: { type: ObjectId, ref: 'User', required: true },
    arrived_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    cancelled_by: { type: ObjectId, ref: 'User', default: null },
  },
  { collection: 'appointments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

appointmentSchema.index({ date: 1, status: 1 });
appointmentSchema.index({ patient_uid: 1, date: -1 });

export const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
export default Appointment;
