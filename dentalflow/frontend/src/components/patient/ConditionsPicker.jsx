import { useSettings } from '../../store/uiStore';
import Icon from '../Icon';
import { Field } from '../ui';

/**
 * Comorbidities picker: tick the conditions from the clinic's list (the admin manages
 * the list), plus free text for anything else.
 */
export default function ConditionsPicker({ selected, onChange, notes, onNotesChange }) {
  const options = useSettings((s) => s.settings.comorbidity_options);
  // conditions saved earlier but since removed from the clinic list stay visible
  const extra = selected.filter((c) => !options.some((o) => o.toLowerCase() === c.toLowerCase()));
  const all = [...options, ...extra];
  const isOn = (c) => selected.some((s) => s.toLowerCase() === c.toLowerCase());
  const toggle = (c) => onChange(isOn(c) ? selected.filter((s) => s.toLowerCase() !== c.toLowerCase()) : [...selected, c]);

  return (
    <div className="stack">
      <div className="row-wrap" role="group" aria-label="Comorbidities">
        {all.map((c) => (
          <button key={c} type="button" className="chip chip-check" aria-pressed={isOn(c)} onClick={() => toggle(c)}>
            {isOn(c) && <Icon name="check" size={15} strokeWidth={3} />}
            {c}
          </button>
        ))}
      </div>
      <Field label="Other conditions, allergies or medicines" hint="Anything not in the list above">
        <textarea
          className="textarea"
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. allergic to penicillin, on aspirin"
        />
      </Field>
    </div>
  );
}
