import React, { useId, useState } from 'react';

export function UiTooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="ui-tooltip" data-open={open} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label="Ajuda" aria-describedby={open ? id : undefined} aria-expanded={open}
      onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); event.currentTarget.blur(); } }}>?</button>
    <span id={id} role="tooltip" hidden={!open}>{text}</span>
  </span>;
}
