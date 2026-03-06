import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Check, X, Pencil } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import NavBar from '../components/NavBar';
import SourceCite from '../components/SourceCite';
import { useSchool } from '../hooks/useSchool';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';

// ─── Shared input style ────────────────────────────────────────────────────────

const INPUT_STYLE = {
  background: '#1A1A1A',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f5f0e8',
  borderRadius: '6px',
  padding: '8px 12px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.875rem',
  width: '100%',
  outline: 'none',
  display: 'block',
  boxSizing: 'border-box',
};

const GHOST_BTN = {
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(245,240,232,0.6)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  padding: '0.45rem 1rem',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.85rem',
  cursor: 'pointer',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return `rgba(200,200,200,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getInitials(name) {
  return name
    .split(/[\s,]+/)
    .filter((w) => w.length > 0 && !/^(of|the|and|for|in|at|a)$/i.test(w))
    .map((w) => w[0].toUpperCase())
    .slice(0, 3)
    .join('');
}

function camelToLabel(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function collectSources(obj) {
  const sources = new Map();
  function walk(node, label) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if ('value' in node && 'source' in node && node.source) {
      const key = node.sourceUrl || node.source;
      if (!sources.has(key)) {
        sources.set(key, { source: node.source, sourceUrl: node.sourceUrl, dataPoints: [] });
      }
      if (label) sources.get(key).dataPoints.push(camelToLabel(label));
    } else {
      Object.entries(node).forEach(([k, v]) => walk(v, k));
    }
  }
  walk(obj, '');
  return Array.from(sources.values());
}

function formatEditDate(at) {
  if (!at) return '';
  try {
    const d = at.toDate ? at.toDate() : new Date(at);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Shared small components ───────────────────────────────────────────────────

function TabButton({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
        padding: '0.75rem 1.25rem',
        color: active ? '#f5f0e8' : 'rgba(245,240,232,0.5)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '0.9rem',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function CardHeading({ children }) {
  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.09em',
      color: 'rgba(245,240,232,0.4)',
      marginBottom: '0.85rem',
    }}>
      {children}
    </div>
  );
}

function StatCell({ label, data, color, borderRadius, editable, onSave }) {
  return (
    <div style={{ background: '#222222', padding: '1rem 0.75rem', textAlign: 'center', borderRadius }}>
      <div style={{
        fontSize: '18px',
        fontWeight: 700,
        color,
        marginBottom: '0.3rem',
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1.2,
      }}>
        <SourceCite data={data} editable={editable} onSave={onSave} />
      </div>
      <div style={{
        fontSize: '0.6rem',
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        color: 'rgba(245,240,232,0.35)',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {label}
      </div>
    </div>
  );
}

function LastEditedLine({ lastEdit }) {
  if (!lastEdit?.by || !lastEdit?.at) return null;
  return (
    <p style={{
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '11px',
      color: 'rgba(245,240,232,0.3)',
      margin: '0.75rem 0 0',
    }}>
      Last edited by {lastEdit.by} on {formatEditDate(lastEdit.at)}
    </p>
  );
}

// ─── Editable detail text (plain string, not a sourced object) ─────────────────

function EditableDetail({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');

  useEffect(() => {
    if (!editing) setEditValue(value ?? '');
  }, [value, editing]);

  if (editing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSave(editValue); setEditing(false); }
            if (e.key === 'Escape') { setEditing(false); }
          }}
          style={{
            ...INPUT_STYLE,
            padding: '3px 8px',
            fontSize: '0.82rem',
            flex: 1,
            minWidth: '140px',
            display: 'inline',
            width: 'auto',
          }}
        />
        <button
          onClick={() => { onSave(editValue); setEditing(false); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
        >
          <Check size={12} color="#6fcf97" />
        </button>
        <button
          onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
        >
          <X size={12} color="rgba(245,240,232,0.4)" />
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '5px' }}>
      <span style={{ color: 'rgba(245,240,232,0.55)', fontSize: '0.82rem', lineHeight: 1.5 }}>
        {value}
      </span>
      <button
        onClick={() => setEditing(true)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '1px', display: 'inline-flex', flexShrink: 0, marginTop: '2px',
        }}
        title="Edit"
      >
        <Pencil size={10} color="rgba(245,240,232,0.2)" />
      </button>
    </span>
  );
}

// ─── Pros / Cons editable list ────────────────────────────────────────────────

function ProConList({ items = [], fieldPath, onFieldSave, color, isPro }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newText, setNewText] = useState('');

  const deleteItem = (idx) => {
    onFieldSave(fieldPath, items.filter((_, i) => i !== idx));
  };

  const saveNew = () => {
    const t = newText.trim();
    if (!t) return;
    onFieldSave(fieldPath, [...items, t]);
    setNewText('');
    setAddingNew(false);
  };

  return (
    <>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '0.7rem',
        fontWeight: 700,
        color: isPro ? color : 'rgba(245,240,232,0.38)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '0.75rem',
      }}>
        {isPro ? 'Pros' : 'Cons'}
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {items.map((item, i) => (
          <li key={i} style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.82rem',
            color: isPro ? 'rgba(245,240,232,0.72)' : 'rgba(245,240,232,0.52)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
            lineHeight: 1.45,
          }}>
            <span style={{ color: isPro ? color : 'rgba(235,87,87,0.7)', flexShrink: 0, fontWeight: 700, marginTop: '1px' }}>
              {isPro ? '+' : '–'}
            </span>
            <span style={{ flex: 1 }}>{item}</span>
            <button
              onClick={() => deleteItem(i)}
              title="Remove"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '1px', display: 'inline-flex', flexShrink: 0,
                color: 'rgba(245,240,232,0.2)', transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(235,87,87,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.2)')}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>

      {addingNew ? (
        <div style={{ display: 'flex', gap: '6px', marginTop: '0.6rem', alignItems: 'center' }}>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            autoFocus
            placeholder={isPro ? 'New pro…' : 'New con…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveNew();
              if (e.key === 'Escape') { setAddingNew(false); setNewText(''); }
            }}
            style={{ ...INPUT_STYLE, padding: '4px 8px', fontSize: '0.82rem', flex: 1, display: 'inline' }}
          />
          <button
            onClick={saveNew}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', flexShrink: 0 }}
          >
            <Check size={14} color="#6fcf97" />
          </button>
          <button
            onClick={() => { setAddingNew(false); setNewText(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', flexShrink: 0 }}
          >
            <X size={14} color="rgba(245,240,232,0.4)" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0.35rem 0 0', color: 'rgba(245,240,232,0.28)',
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem',
            display: 'flex', alignItems: 'center', gap: '4px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = isPro ? color : 'rgba(245,240,232,0.6)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.28)')}
        >
          + Add
        </button>
      )}
    </>
  );
}

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ school, onFieldSave }) {
  const o = school.overview;
  const summary = `${school.name} is a ${o?.type?.value ?? 'university'} set on a ${o?.campusSize?.value ?? '—'} campus in ${o?.location?.value ?? '—'}. With ${o?.enrollment?.value ?? '—'} undergrads, ${o?.clubsOrgs?.value ?? '—'} student organizations, and ${o?.conference?.value ?? '—'} athletics, it offers a vibrant social scene steeped in deep traditions.`;

  const keyFacts = [
    { label: 'Location', data: o?.location },
    { label: 'Type', data: o?.type },
    { label: 'Conference', data: o?.conference },
    { label: 'Enrollment', data: o?.enrollment, path: 'overview.enrollment.value' },
    { label: 'Acceptance Rate', data: o?.acceptanceRate, path: 'overview.acceptanceRate.value' },
    { label: 'In-State Tuition', data: o?.tuitionInState },
    { label: 'Out-of-State Tuition', data: o?.tuitionOutState, path: 'overview.tuitionOutState.value' },
    { label: 'Total Cost (OOS)', data: o?.totalCostOOS },
    { label: 'Scholarships', data: o?.scholarshipInfo, path: 'overview.scholarshipInfo.value' },
    { label: 'Greek Life', data: o?.greekLife },
    { label: '4-Year Grad Rate', data: o?.fourYearGradRate },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{
        color: 'rgba(245,240,232,0.68)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '0.95rem',
        lineHeight: 1.65,
        margin: 0,
      }}>
        {summary}
      </p>

      {/* Key Facts */}
      <div style={{
        background: hexToRgba(school.primaryColor, 0.06),
        border: `1px solid ${hexToRgba(school.primaryColor, 0.15)}`,
        borderRadius: '10px',
        padding: '1.25rem',
      }}>
        <CardHeading>Key Facts</CardHeading>
        <div className="key-facts-grid">
          {keyFacts.map(({ label, data, path }) => (
            <div key={label}>
              <div style={{
                fontSize: '0.68rem',
                color: 'rgba(245,240,232,0.35)',
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: '0.2rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {label}
              </div>
              <div style={{ fontSize: '0.88rem', color: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
                <SourceCite
                  data={data}
                  editable={!!path}
                  onSave={path ? (val) => onFieldSave(path, val) : undefined}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What Students Say */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding: '1.25rem',
      }}>
        <CardHeading>What Students Say</CardHeading>
        <p style={{ color: 'rgba(245,240,232,0.62)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem', lineHeight: 1.62, margin: 0 }}>
          {school.campusLife?.socialScene}
        </p>
      </div>
    </div>
  );
}

// ─── Tab: Nursing ──────────────────────────────────────────────────────────────

function NursingTab({ school, onFieldSave }) {
  const n = school.nursing;
  const color = school.primaryColor;

  const gridStats = [
    { label: 'NCLEX Pass Rate', data: n?.nclexPassRate, path: 'nursing.nclexPassRate.value' },
    { label: 'Admission Type', data: n?.admissionType },
    { label: 'Cohort Size', data: n?.cohortSize, path: 'nursing.cohortSize.value' },
    { label: 'GPA Requirement', data: n?.gpaRequirement, path: 'nursing.gpaRequirement.value' },
  ];
  const fullWidthStats = [
    { label: 'Clinical Partner', data: n?.clinicalPartner, path: 'nursing.clinicalPartner.value' },
    { label: 'New Facility', data: n?.newFacility },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        background: `linear-gradient(135deg, ${hexToRgba(color, 0.10)} 0%, rgba(26,26,26,0) 100%)`,
        border: `1px solid ${hexToRgba(color, 0.2)}`,
        borderRadius: '10px',
        padding: '1.25rem',
      }}>
        <CardHeading>Program Stats</CardHeading>
        <div className="nursing-grid">
          {gridStats.map(({ label, data, path }) => (
            <div key={label}>
              <div style={{ fontSize: '0.68rem', color: 'rgba(245,240,232,0.35)', fontFamily: "'DM Sans', sans-serif", marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </div>
              <div style={{ fontSize: '0.92rem', color: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, lineHeight: 1.4 }}>
                <SourceCite
                  data={data}
                  editable={!!path}
                  onSave={path ? (val) => onFieldSave(path, val) : undefined}
                />
              </div>
            </div>
          ))}
          {fullWidthStats.map(({ label, data, path }) => (
            <div key={label} style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.68rem', color: 'rgba(245,240,232,0.35)', fontFamily: "'DM Sans', sans-serif", marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </div>
              <div style={{ fontSize: '0.92rem', color: '#f5f0e8', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, lineHeight: 1.4 }}>
                <SourceCite
                  data={data}
                  editable={!!path}
                  onSave={path ? (val) => onFieldSave(path, val) : undefined}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {n?.programDescription && (
        <p style={{ color: 'rgba(245,240,232,0.65)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem', lineHeight: 1.62, margin: 0 }}>
          {n.programDescription}
        </p>
      )}

      {n?.bsnScholarsProgram && (
        <div style={{
          background: 'rgba(0,180,80,0.08)',
          border: '1px solid rgba(0,180,80,0.2)',
          borderRadius: '10px',
          padding: '1.1rem 1.25rem',
          display: 'flex',
          gap: '0.85rem',
          alignItems: 'flex-start',
        }}>
          <div style={{ color: '#6fcf97', flexShrink: 0, marginTop: '1px' }}>
            <Check size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '0.88rem', color: '#6fcf97', marginBottom: '0.3rem' }}>
              BSN Scholars Program
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.62)', lineHeight: 1.5 }}>
              <SourceCite data={n.bsnScholarsProgram} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Campus Life ──────────────────────────────────────────────────────────

function CampusLifeTab({ school }) {
  const cl = school.campusLife;
  const items = [
    { emoji: '🏈', title: 'Athletics', text: cl?.athletics },
    { emoji: '🎉', title: 'Social Scene', text: cl?.socialScene },
    { emoji: '🏔️', title: 'Location', text: cl?.locationHighlights },
    { emoji: '🏠', title: 'Housing', text: cl?.housing },
    { emoji: '🎾', title: 'Tennis', text: cl?.tennis },
  ];

  return (
    <div className="campus-life-grid">
      {items.map(({ emoji, title, text }) => (
        <div key={title} style={{
          background: '#1e1e1e',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          padding: '1.1rem',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.55rem' }}>{emoji}</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', fontWeight: 700, color: school.primaryColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>
            {title}
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.52)', lineHeight: 1.55, margin: 0 }}>
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Claire's Fit ─────────────────────────────────────────────────────────

function ClairesFitTab({ school, onFieldSave }) {
  const fit = school.claireFit;
  const color = school.primaryColor;

  const criteria = [
    { key: 'directAdmit', label: 'Direct Admit', data: fit?.directAdmit, path: 'claireFit.directAdmit.detail' },
    { key: 'bigSchoolSports', label: 'Big School / Sports', data: fit?.bigSchoolSports, path: 'claireFit.bigSchoolSports.detail' },
    { key: 'collegeTownVibe', label: 'College Town Vibe', data: fit?.collegeTownVibe, path: 'claireFit.collegeTownVibe.detail' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Criteria cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {criteria.map(({ key, label, data, path }) => {
          const meets = data?.meets;
          return (
            <div key={key} style={{
              background: meets ? 'rgba(0,180,80,0.06)' : 'rgba(235,87,87,0.06)',
              border: `1px solid ${meets ? 'rgba(0,180,80,0.18)' : 'rgba(235,87,87,0.15)'}`,
              borderRadius: '10px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: meets ? 'rgba(0,180,80,0.15)' : 'rgba(235,87,87,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: meets ? '#6fcf97' : '#eb5757',
              }}>
                {meets ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.88rem', fontWeight: 700, color: '#f5f0e8', marginBottom: '0.25rem' }}>
                  {label}
                </div>
                <EditableDetail
                  value={data?.detail}
                  onSave={(val) => onFieldSave(path, val)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pros / Cons */}
      <div className="fit-pros-cons">
        <div style={{ background: hexToRgba(color, 0.07), border: `1px solid ${hexToRgba(color, 0.18)}`, borderRadius: '10px', padding: '1.1rem' }}>
          <ProConList
            items={fit?.pros ?? []}
            fieldPath="claireFit.pros"
            onFieldSave={onFieldSave}
            color={color}
            isPro
          />
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '1.1rem' }}>
          <ProConList
            items={fit?.cons ?? []}
            fieldPath="claireFit.cons"
            onFieldSave={onFieldSave}
            color={color}
            isPro={false}
          />
        </div>
      </div>

      {/* Cost & Aid callout */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.7rem', fontWeight: 700, color: 'rgba(110,170,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Cost & Aid
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.6)', lineHeight: 1.55, margin: '0 0 0.35rem' }}>
          Out-of-state total cost:{' '}
          <strong style={{ color: '#f5f0e8' }}>
            <SourceCite data={school.overview?.totalCostOOS} />
          </strong>
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.6)', lineHeight: 1.55, margin: 0 }}>
          Aid:{' '}
          <SourceCite
            data={school.overview?.scholarshipInfo}
            editable
            onSave={(val) => onFieldSave('overview.scholarshipInfo.value', val)}
          />
        </p>
      </div>
    </div>
  );
}

// ─── YouTube icon ──────────────────────────────────────────────────────────────

function YouTubeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STAT_CELLS = [
  { label: 'Enrollment', key: 'enrollment', path: 'overview.enrollment.value' },
  { label: 'Campus Size', key: 'campusSize' },
  { label: 'Acceptance Rate', key: 'acceptanceRate', path: 'overview.acceptanceRate.value' },
  { label: 'Student : Faculty', key: 'studentFacultyRatio' },
  { label: 'Clubs & Orgs', key: 'clubsOrgs' },
  { label: 'US News Rank', key: 'usNewsRank' },
];

const COLS = 3;

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SchoolProfile() {
  const { schoolId } = useParams();
  const { school, loading } = useSchool(schoolId);
  const { user } = useAuth();

  // UI state — must be declared before any early returns
  const [activeTab, setActiveTab] = useState('overview');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [videoEditing, setVideoEditing] = useState(false);
  const [videoForm, setVideoForm] = useState({ url: '', title: '', description: '', altSearch: '' });

  if (loading) {
    return (
      <>
        <NavBar />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
          <div className="spinner" />
        </div>
      </>
    );
  }

  if (!school) {
    return (
      <>
        <NavBar />
        <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'rgba(245,240,232,0.45)', fontFamily: "'DM Sans', sans-serif", marginBottom: '1.25rem' }}>
            School not found.
          </p>
          <Link to="/" style={{ color: '#E8976B', fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem' }}>
            ← Back to list
          </Link>
        </div>
      </>
    );
  }

  const { primaryColor } = school;
  const sources = collectSources(school);

  // ── Firestore write helpers ──────────────────────────────────────────────────

  const writeLastEdit = (fieldPath) => ({
    'lastEdit.by': user?.displayName ?? 'Unknown',
    'lastEdit.email': user?.email ?? '',
    'lastEdit.at': serverTimestamp(),
    'lastEdit.field': fieldPath.split('.')[0],
  });

  const handleFieldSave = async (fieldPath, newValue) => {
    const ref = doc(db, 'schools', school.id);
    await updateDoc(ref, { [fieldPath]: newValue, ...writeLastEdit(fieldPath) });
  };

  const startVideoEdit = () => {
    setVideoForm({
      url: school.video?.url ?? '',
      title: school.video?.title ?? '',
      description: school.video?.description ?? '',
      altSearch: school.video?.altSearch ?? '',
    });
    setVideoEditing(true);
  };

  const handleVideoSave = async () => {
    const ref = doc(db, 'schools', school.id);
    await updateDoc(ref, {
      video: videoForm,
      'lastEdit.by': user?.displayName ?? 'Unknown',
      'lastEdit.email': user?.email ?? '',
      'lastEdit.at': serverTimestamp(),
      'lastEdit.field': 'video',
    });
    setVideoEditing(false);
  };

  // ── Grid helpers ─────────────────────────────────────────────────────────────

  function cellRadius(idx) {
    const total = STAT_CELLS.length;
    const r = '7px';
    const tl = idx === 0 ? r : '0';
    const tr = idx === COLS - 1 ? r : '0';
    const br = idx === total - 1 ? r : '0';
    const bl = idx === total - COLS ? r : '0';
    return `${tl} ${tr} ${br} ${bl}`;
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'nursing', label: 'Nursing' },
    { key: 'campusLife', label: 'Campus Life' },
    { key: 'clairesFit', label: "Claire's Fit" },
  ];

  const isVideoLastEdit = school.lastEdit?.field === 'video';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <NavBar />

      {/* ── Hero ── */}
      <div style={{
        background: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 12px,
            rgba(255,255,255,0.018) 12px,
            rgba(255,255,255,0.018) 13px
          ),
          linear-gradient(150deg, ${hexToRgba(primaryColor, 0.48)} 0%, #1a1a1a 55%)
        `,
        padding: '1.5rem 1.5rem 5rem',
      }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <Link
            to="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'rgba(245,240,232,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.84rem', marginBottom: '1.5rem', transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f5f0e8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.5)')}
          >
            <ChevronLeft size={15} /> Back to list
          </Link>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
            {/* Initials badge */}
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%', background: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: '0.95rem',
              color: primaryColor, boxShadow: '0 2px 14px rgba(0,0,0,0.35)', letterSpacing: '-0.02em',
            }}>
              {getInitials(school.name)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.11em', color: 'rgba(245,240,232,0.5)', marginBottom: '0.3rem' }}>
                {school.overview?.conference?.value}
                {school.overview?.founded?.value ? ` · Founded ${school.overview.founded.value}` : ''}
              </div>
              <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 'clamp(1.4rem, 3vw, 1.75rem)', color: '#f5f0e8', margin: '0 0 0.3rem', lineHeight: 1.2 }}>
                {school.name}
              </h1>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.88rem', color: 'rgba(245,240,232,0.5)', marginBottom: '1.1rem' }}>
                {school.nickname && <span>{school.nickname} · </span>}
                {school.overview?.location?.value}
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'OOS Tuition', value: school.overview?.tuitionOutState?.value },
                  { label: 'Setting', value: `${school.overview?.setting?.value ?? '—'} · ${school.overview?.campusSize?.value ?? '—'}` },
                  { label: 'Acceptance', value: school.overview?.acceptanceRate?.value },
                ].map((pill) => (
                  <span key={pill.label} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '0.3rem 0.7rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.82)', backdropFilter: 'blur(4px)' }}>
                    <span style={{ color: 'rgba(245,240,232,0.42)', marginRight: '0.25rem' }}>{pill.label}:</span>
                    {pill.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div style={{ maxWidth: '860px', margin: '-2.75rem auto 0', padding: '0 1.5rem', position: 'relative', zIndex: 1 }}>
        <div className="stats-grid" style={{ gap: '1px', background: hexToRgba(primaryColor, 0.28), borderRadius: '12px', boxShadow: '0 6px 28px rgba(0,0,0,0.5)' }}>
          {STAT_CELLS.map(({ label, key, path }, idx) => (
            <StatCell
              key={key}
              label={label}
              data={school.overview?.[key]}
              color={primaryColor}
              borderRadius={cellRadius(idx)}
              editable={!!path}
              onSave={path ? (val) => handleFieldSave(path, val) : undefined}
            />
          ))}
        </div>
      </div>

      {/* ── Tabs + content ── */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 1.5rem 5rem' }}>
        <div className="tab-bar" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', marginTop: '2rem', marginBottom: '1.5rem' }}>
          {tabs.map((tab) => (
            <TabButton key={tab.key} label={tab.label} active={activeTab === tab.key} color={primaryColor} onClick={() => setActiveTab(tab.key)} />
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab school={school} onFieldSave={handleFieldSave} />}
        {activeTab === 'nursing' && <NursingTab school={school} onFieldSave={handleFieldSave} />}
        {activeTab === 'campusLife' && <CampusLifeTab school={school} />}
        {activeTab === 'clairesFit' && <ClairesFitTab school={school} onFieldSave={handleFieldSave} />}

        {/* Last edit line — for non-video edits */}
        {school.lastEdit?.by && !isVideoLastEdit && (
          <LastEditedLine lastEdit={school.lastEdit} />
        )}

        {/* ── Video section ── */}
        <div style={{ marginTop: '2.75rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: primaryColor }}>
              Recommended Video
            </div>
            {!videoEditing && (
              <button
                onClick={startVideoEdit}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', lineHeight: 1 }}
                title="Edit video"
              >
                <Pencil size={14} color="rgba(245,240,232,0.3)" />
              </button>
            )}
          </div>

          {videoEditing ? (
            /* Video edit form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <input
                value={videoForm.url}
                onChange={(e) => setVideoForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="Video URL"
                style={INPUT_STYLE}
              />
              <input
                value={videoForm.title}
                onChange={(e) => setVideoForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Title"
                style={INPUT_STYLE}
              />
              <textarea
                value={videoForm.description}
                onChange={(e) => setVideoForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description"
                rows={2}
                style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '60px' }}
              />
              <input
                value={videoForm.altSearch}
                onChange={(e) => setVideoForm((f) => ({ ...f, altSearch: e.target.value }))}
                placeholder="Alt search text"
                style={INPUT_STYLE}
              />
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button
                  onClick={handleVideoSave}
                  style={{ background: primaryColor, color: '#fff', border: 'none', borderRadius: '6px', padding: '0.45rem 1.1rem', fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save
                </button>
                <button onClick={() => setVideoEditing(false)} style={GHOST_BTN}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Video display */
            <>
              {(school.video?.url || school.video?.title) && (
                <>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.55)', lineHeight: 1.55, margin: '0 0 1.1rem' }}>
                    <strong style={{ color: 'rgba(245,240,232,0.82)' }}>{school.video?.title}</strong>
                    {school.video?.description ? ` — ${school.video.description}` : ''}
                  </p>
                  {school.video?.url && (
                    <a
                      href={school.video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', background: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)', color: '#ffffff', padding: '0.6rem 1.1rem', borderRadius: '7px', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 2px 12px rgba(200,0,0,0.35)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(200,0,0,0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(200,0,0,0.35)'; }}
                    >
                      <YouTubeIcon /> Watch on YouTube
                    </a>
                  )}
                  {school.video?.altSearch && (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.75rem', color: 'rgba(245,240,232,0.28)', marginTop: '0.75rem' }}>
                      {school.video.altSearch}
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* Last edit line — for video edits */}
          {school.lastEdit?.by && isVideoLastEdit && (
            <LastEditedLine lastEdit={school.lastEdit} />
          )}
        </div>

        {/* ── Sources footer ── */}
        {sources.length > 0 && (
          <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => setSourcesOpen((o) => !o)}
              style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.3)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.6)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.3)')}
            >
              {sourcesOpen ? '▾' : '▸'} View All Sources ({sources.length})
            </button>

            {sourcesOpen && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {sources.map((s, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '7px', padding: '0.75rem 1rem' }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.83rem', fontWeight: 600, color: '#f5f0e8', marginBottom: '0.2rem' }}>
                      {s.source}
                    </div>
                    {s.sourceUrl && (
                      <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.72rem', color: '#E8976B', display: 'block', marginBottom: '0.3rem', wordBreak: 'break-all' }}>
                        {s.sourceUrl}
                      </a>
                    )}
                    {s.dataPoints.length > 0 && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.7rem', color: 'rgba(245,240,232,0.28)' }}>
                        {s.dataPoints.slice(0, 6).join(', ')}{s.dataPoints.length > 6 ? ` +${s.dataPoints.length - 6} more` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
