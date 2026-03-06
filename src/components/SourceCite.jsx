import { useState, useRef, useEffect } from 'react';
import { ExternalLink, Pencil, Check, X } from 'lucide-react';

const ICON_BTN = {
  background: 'none',
  border: 'none',
  padding: '0 0 0 2px',
  cursor: 'pointer',
  verticalAlign: 'super',
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
};

export default function SourceCite({ data, editable = false, onSave }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const ref = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Plain string or null — no source metadata
  if (!data || typeof data === 'string') {
    return <span>{data ?? '—'}</span>;
  }

  const { value, source, sourceUrl, asOf } = data;

  if (!source) {
    return <span>{value ?? '—'}</span>;
  }

  const truncateUrl = (url, max = 40) =>
    url && url.length > max ? url.slice(0, max) + '…' : url;

  const startEdit = (e) => {
    e.stopPropagation();
    setEditValue(value ?? '');
    setEditing(true);
    setOpen(false);
  };

  const saveEdit = (e) => {
    e?.stopPropagation();
    if (onSave) onSave(editValue);
    setEditing(false);
  };

  const cancelEdit = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  // ── Inline edit mode ──────────────────────────────────────────────────────
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit(e);
            if (e.key === 'Escape') cancelEdit(e);
          }}
          style={{
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#f5f0e8',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: 'inherit',
            fontFamily: "'DM Sans', sans-serif",
            minWidth: '80px',
            width: 'auto',
            outline: 'none',
          }}
        />
        <button onClick={saveEdit} style={{ ...ICON_BTN, verticalAlign: 'middle', padding: '1px' }} title="Save">
          <Check size={12} color="#6fcf97" />
        </button>
        <button onClick={cancelEdit} style={{ ...ICON_BTN, verticalAlign: 'middle', padding: '1px' }} title="Cancel">
          <X size={12} color="rgba(245,240,232,0.4)" />
        </button>
      </span>
    );
  }

  // ── Display mode ──────────────────────────────────────────────────────────
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline' }}>
      {value ?? '—'}

      {/* Source citation icon */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={ICON_BTN}
        title={`Source: ${source}`}
      >
        <ExternalLink size={10} color="rgba(245,240,232,0.25)" />
      </button>

      {/* Edit icon — only when editable */}
      {editable && (
        <button onClick={startEdit} style={ICON_BTN} title="Edit value">
          <Pencil size={10} color="rgba(245,240,232,0.22)" />
        </button>
      )}

      {/* Source popover */}
      {open && (
        <span style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          background: '#252525',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          maxWidth: '280px',
          minWidth: '180px',
          zIndex: 1000,
          display: 'block',
        }}>
          <span style={{
            display: 'block',
            fontWeight: 600,
            marginBottom: '0.3rem',
            fontSize: '0.8rem',
            color: '#f5f0e8',
            fontFamily: "'DM Sans', sans-serif",
            fontStyle: 'normal',
          }}>
            {source}
          </span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'block',
                color: '#E8976B',
                fontSize: '0.72rem',
                marginBottom: '0.35rem',
                textDecoration: 'underline',
                fontFamily: "'DM Sans', sans-serif",
                fontStyle: 'normal',
                wordBreak: 'break-all',
              }}
            >
              {truncateUrl(sourceUrl)}
            </a>
          )}
          {asOf && (
            <span style={{
              display: 'block',
              color: 'rgba(245,240,232,0.4)',
              fontSize: '0.7rem',
              fontFamily: "'DM Sans', sans-serif",
              fontStyle: 'normal',
            }}>
              Data as of: {asOf}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
