import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/print.css';
import Icon from '../Icon';
import { useScrollLock } from '../ui';

const PAGE_PX = 794; // 210 mm at 96 dpi

/**
 * Full-screen preview of an A4 document, scaled to fit the phone screen.
 * "Print" uses the browser's print dialog (which also offers "Save as PDF").
 */
export default function PrintPreview({ title, onClose, children }) {
  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  useScrollLock(true);

  useLayoutEffect(() => {
    const measure = () => {
      const w = stageRef.current?.clientWidth || PAGE_PX;
      setScale(Math.min(1, (w - 24) / PAGE_PX));
      setHeight(pageRef.current?.offsetHeight || 1123);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stageRef.current) ro.observe(stageRef.current);
    if (pageRef.current) ro.observe(pageRef.current);
    const prevTitle = document.title;
    document.title = title; // becomes the default PDF file name
    return () => {
      ro.disconnect();
      document.title = prevTitle;
    };
  }, [title]);

  return createPortal(
    <div className="print-preview" role="dialog" aria-modal="true" aria-label={title}>
      <div className="print-toolbar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
          <Icon name="close" size={22} />
        </button>
        <div className="grow strong ellipsis">{title}</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="printer" size={18} />
          Print or save PDF
        </button>
      </div>
      <div className="print-stage" ref={stageRef}>
        <div className="print-scale" style={{ width: PAGE_PX * scale, height: height * scale }}>
          <div ref={pageRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: PAGE_PX }}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('print-root') || document.body,
  );
}
