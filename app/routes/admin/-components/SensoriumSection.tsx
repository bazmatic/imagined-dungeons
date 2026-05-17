import { useState } from 'react';

interface SensoriumSectionProps {
  readonly title: string;
  readonly defaultOpen: boolean;
  readonly children: React.ReactNode;
}

export function SensoriumSection({ title, defaultOpen, children }: SensoriumSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sensorium-section">
      <button
        type="button"
        className="sensorium-section__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sensorium-section__chevron">{open ? '▼' : '▶'}</span>
        <span className="sensorium-section__title">{title}</span>
      </button>
      {open ? <div className="sensorium-section__body">{children}</div> : null}
    </div>
  );
}
