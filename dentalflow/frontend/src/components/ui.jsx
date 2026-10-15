/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useConfirmStore, useToasts } from '../store/uiStore';

// ── Body scroll lock shared by sheets, viewers and print previews ─────────
let locks = 0;
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    locks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks <= 0) {
        locks = 0;
        document.body.style.overflow = '';
      }
    };
  }, [active]);
}

/** Bottom sheet on phones, centred dialog on larger screens */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide = false, labelledBy }) {
  const titleId = useId();
  const ref = useRef(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // only the top-most sheet closes (a sheet can open another one)
      const open = document.querySelectorAll('.sheet-backdrop');
      if (open[open.length - 1] === ref.current?.parentElement) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    // move focus into the sheet for keyboard and screen-reader users
    const t = setTimeout(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) {
        const target = el.querySelector('[data-autofocus]') || el;
        target.focus({ preventScroll: true });
      }
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        className={`sheet${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
      >
        {title !== undefined && (
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
        )}
        {subtitle && <p className="sheet-sub">{subtitle}</p>}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      {label && <span>{label}</span>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function MoneyInput({ value, onChange, placeholder = '0', autoFocus, id, name, invalid }) {
  return (
    <div className="input-money">
      <input
        id={id}
        name={name}
        className={`input${invalid ? ' invalid' : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? true : undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
      />
    </div>
  );
}

/** Password box with a Show / Hide button */
export function PasswordInput({ value, onChange, autoComplete = 'current-password', autoFocus, invalid, id, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className={`input${invalid ? ' invalid' : ''}`}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? true : undefined}
        placeholder={placeholder}
        style={{ paddingRight: 72 }}
      />
      <button
        type="button"
        className="link-btn"
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function LoadingBlock() {
  return (
    <div className="loading-block">
      <Spinner />
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <p className="form-error" role="alert">
      {children}
    </p>
  );
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.kind === 'error' ? ' error' : ''}`}>
          {t.kind === 'error' ? <Icon name="alert" size={18} /> : <Icon name="check" size={18} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const close = useConfirmStore((s) => s.close);
  return (
    <Sheet
      open={Boolean(request)}
      onClose={() => close(false)}
      title={request?.title}
      footer={
        <>
          <button type="button" className="btn" onClick={() => close(false)}>
            {request?.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            data-autofocus
            className={`btn ${request?.danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => close(true)}
          >
            {request?.confirmLabel || 'Confirm'}
          </button>
        </>
      }
    >
      {request?.message && <p className="muted">{request.message}</p>}
    </Sheet>
  );
}
