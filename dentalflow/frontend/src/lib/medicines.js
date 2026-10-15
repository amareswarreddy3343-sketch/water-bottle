/** Suggestions for the prescription form (doctors can type anything) */
export const COMMON_MEDICINES = [
  'Amoxicillin 500 mg',
  'Amoxicillin + Clavulanic acid 625 mg',
  'Metronidazole 400 mg',
  'Azithromycin 500 mg',
  'Clindamycin 300 mg',
  'Doxycycline 100 mg',
  'Ibuprofen 400 mg',
  'Paracetamol 650 mg',
  'Aceclofenac + Paracetamol',
  'Diclofenac 50 mg',
  'Ketorolac 10 mg',
  'Tramadol 50 mg',
  'Pantoprazole 40 mg',
  'Rabeprazole 20 mg',
  'Chlorhexidine 0.2% mouthwash',
  'Povidone-iodine gargle',
  'Benzocaine gel',
  'Choline salicylate gel',
  'Triamcinolone oral paste',
  'Vitamin B-complex',
  'Desensitising toothpaste',
];

export const FREQUENCIES = [
  { value: '1-0-1', hint: 'Morning and night' },
  { value: '1-1-1', hint: 'Three times a day' },
  { value: '1-0-0', hint: 'Morning' },
  { value: '0-0-1', hint: 'Night' },
  { value: '1-1-1-1', hint: 'Four times a day' },
  { value: 'SOS', hint: 'Only when needed' },
];

/** "1 tab, 1-0-1, 5 days, after food" */
export function describeMedicine(m) {
  return [m.dose, m.frequency, m.days ? `${m.days} day${Number(m.days) === 1 ? '' : 's'}` : null, m.timing ? m.timing.toLowerCase() : null]
    .filter(Boolean)
    .join(', ');
}
