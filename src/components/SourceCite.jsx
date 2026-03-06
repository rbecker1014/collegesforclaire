import { useState, useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

export default function SourceCite({ data }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Plain string or null
  if (!data || typeof data === 'string') {
    return <span>{data ?? '—'}</span>;
  }

  const { value, source, sourceUrl, asOf } = data;

  // Object without source metadata — just show value
  if (!source) {
    return <span>{value ?? '—'}</span>;
  }

  const truncateUrl = (url, max = 40) =>
    url && url.length > max ? url.slice(0, max) + '…' : url;

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline' }}>
      {value ?? '—'}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 0 0 2px',
          cursor: 'pointer',
          verticalAlign: 'super',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
        }}
        title={`Source: ${source}`}
      >
        <ExternalLink size={10} color="rgba(245,240,232,0.25)" />
      </button>

      {open && (
        <span
          style={{
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
          }}
        >
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
