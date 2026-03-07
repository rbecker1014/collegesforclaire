import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useSchoolSearch } from '../hooks/useSchoolSearch';
import { useSchools } from '../hooks/useSchools';

// ─── Constants ──────────────────────────────────────────────────────────────────

const PROGRESS_STEPS = [
  { label: 'Searching for school data...', delay: 0 },
  { label: 'Analyzing nursing program...', delay: 8000 },
  { label: 'Evaluating campus life...', delay: 16000 },
  { label: "Assessing fit for Claire...", delay: 24000 },
  { label: 'Building profile...', delay: 32000 },
];

const INPUT_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '12px 40px 12px 12px',
  color: '#f5f0e8',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '15px',
  outline: 'none',
};

// ─── Sub-components ──────────────────────────────────────────────────────────────

function MiniSpinner({ size = 14, color = '#f5f0e8' }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: '2px solid rgba(245,240,232,0.2)',
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function CheckIcon({ size = 13, color = '#6fcf97' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────────

export default function AddSchoolModal({ onClose }) {
  const navigate = useNavigate();
  const { schools } = useSchools();

  // step: 'search' | 'confirm' | 'generating' | 'success'
  const [step, setStep] = useState('search');

  // Search section (always visible in search step)
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Manual entry section (always visible in search step)
  const [manualName, setManualName] = useState('');

  // Confirm step (search-result path only)
  const [selected, setSelected] = useState(null);   // { id, name, city, state, url }
  const [duplicate, setDuplicate] = useState(null); // matching existing school

  // Generate / progress state
  const [generatingName, setGeneratingName] = useState('');
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [genError, setGenError] = useState('');
  const [errorReturnStep, setErrorReturnStep] = useState('search'); // where to go on error

  // Success
  const [success, setSuccess] = useState(null);

  const searchInputRef = useRef(null);
  const manualInputRef = useRef(null);
  const timersRef = useRef([]);

  const { results, loading: searching, error: searchError } = useSchoolSearch(query);

  // Focus search input on open
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // Show/hide dropdown
  useEffect(() => {
    setShowDropdown(query.trim().length >= 3);
  }, [query]);

  // Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (step === 'generating') return;
      if (step === 'confirm') { setStep('search'); return; }
      if (query) { setQuery(''); setShowDropdown(false); return; }
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, query, onClose]);

  // Cleanup timers
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function findDuplicate(name) {
    const lower = name.toLowerCase();
    return schools.find((s) =>
      s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase())
    ) || null;
  }

  function handleSelectSchool(school) {
    setSelected(school);
    setShowDropdown(false);
    setDuplicate(findDuplicate(school.name));
    setGenError('');
    setStep('confirm');
  }

  function handleBackToSearch() {
    setStep('search');
    setSelected(null);
    setDuplicate(null);
    setGenError('');
    setVisibleSteps([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function startProgressSteps() {
    setVisibleSteps([]);
    PROGRESS_STEPS.forEach((_s, i) => {
      const t = setTimeout(() => setVisibleSteps((prev) => [...prev, i]), _s.delay);
      timersRef.current.push(t);
    });
  }

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  async function handleGenerate(schoolName, returnStep = 'search') {
    if (!schoolName) return;
    setGeneratingName(schoolName);
    setErrorReturnStep(returnStep);
    setStep('generating');
    setGenError('');
    startProgressSteps();

    try {
      const generateProfile = httpsCallable(functions, 'generateSchoolProfile', { timeout: 120000 });
      const result = await generateProfile({ schoolName });
      if (result.data.success) {
        clearTimers();
        setVisibleSteps([]);
        setSuccess({ schoolId: result.data.schoolId, schoolName: result.data.schoolName });
        setStep('success');
        setTimeout(() => { onClose(); navigate(`/school/${result.data.schoolId}`); }, 1500);
      }
    } catch (err) {
      clearTimers();
      setVisibleSteps([]);
      setGenError(err?.message || 'Something went wrong. Please try again.');
      setStep(returnStep);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'generating') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div style={{
        background: '#1A1A1A', borderRadius: '12px', padding: '32px',
        width: '100%', maxWidth: '480px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>

        {/* ── SUCCESS ── */}
        {step === 'success' && success && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(111,207,151,0.12)', border: '2px solid #6fcf97',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <CheckIcon size={24} />
            </div>
            <p style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.1rem', color: '#f5f0e8', margin: 0 }}>
              {success.schoolName} has been added!
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.45)', margin: '0.5rem 0 0' }}>
              Opening profile…
            </p>
          </div>
        )}

        {/* ── GENERATING ── */}
        {step === 'generating' && (
          <>
            <div>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.35rem', color: '#f5f0e8', margin: '0 0 0.2rem' }}>
                Add a School
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.4)', margin: 0 }}>
                Building profile for {generatingName}…
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '12px', background: '#111', borderRadius: '8px' }}>
              <MiniSpinner size={14} color="#E8976B" />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem', color: 'rgba(245,240,232,0.7)' }}>
                Researching {generatingName}…
              </span>
            </div>
            {visibleSteps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {PROGRESS_STEPS.map((s, i) => {
                  if (!visibleSteps.includes(i)) return null;
                  const isActive = visibleSteps[visibleSteps.length - 1] === i;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem',
                      color: isActive ? 'rgba(245,240,232,0.8)' : 'rgba(245,240,232,0.4)',
                      animation: 'fadeIn 0.4s ease',
                    }}>
                      {isActive ? <MiniSpinner size={13} color="#E8976B" /> : <CheckIcon />}
                      {s.label}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CONFIRM (search-result path) ── */}
        {step === 'confirm' && selected && (
          <>
            <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.35rem', color: '#f5f0e8', margin: 0 }}>
              Add a School
            </h2>

            {/* Selected school card */}
            <div style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '14px 16px' }}>
              <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.05rem', fontWeight: 700, color: '#f5f0e8', marginBottom: '0.2rem' }}>
                {selected.name}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.45)', marginBottom: selected.url ? '0.4rem' : 0 }}>
                {selected.city}, {selected.state}
              </div>
              {selected.url && (
                <a href={`https://${selected.url}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(232,151,107,0.7)', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#E8976B')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(232,151,107,0.7)')}
                >
                  {selected.url} ↗
                </a>
              )}
            </div>

            {/* Duplicate warning */}
            {duplicate && (
              <div style={{
                background: 'rgba(232,151,107,0.07)', border: '1px solid rgba(232,151,107,0.25)',
                borderRadius: '7px', padding: '0.65rem 0.9rem',
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem',
                color: 'rgba(232,151,107,0.85)',
                display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
              }}>
                <span>⚠️ {duplicate.name} is already on your list.</span>
                <Link to={`/school/${duplicate.id}`} onClick={onClose}
                  style={{ color: '#E8976B', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                  View it
                </Link>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={() => handleGenerate(selected.name, 'confirm')}
              style={{
                width: '100%', padding: '12px', background: '#E8976B',
                border: 'none', borderRadius: '8px', color: '#111111',
                fontFamily: "'DM Sans', sans-serif", fontSize: '14px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Generate Profile for {selected.name}
            </button>

            {genError && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: '#ef4444', margin: 0 }}>
                {genError}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(245,240,232,0.3)', margin: 0, lineHeight: 1.5 }}>
                This will take 30–60 seconds. Claude will research this school and build a complete profile.
              </p>
              <button onClick={handleBackToSearch}
                style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.35)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.7)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.35)')}
              >
                ← Pick a different school
              </button>
            </div>
          </>
        )}

        {/* ── SEARCH STEP ── */}
        {step === 'search' && (
          <>
            <div>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: '1.35rem', color: '#f5f0e8', margin: '0 0 0.4rem' }}>
                Add a School
              </h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: 'rgba(245,240,232,0.45)', margin: 0, lineHeight: 1.55 }}>
                Search for a school or enter the name directly.
              </p>
            </div>

            {/* Search input + dropdown */}
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                id="school-search"
                name="school-search"
                type="text"
                placeholder="Search for a school..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (query.trim().length >= 3) setShowDropdown(true); }}
                style={INPUT_STYLE}
              />
              {searching && (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                  <MiniSpinner size={14} color="rgba(245,240,232,0.4)" />
                </span>
              )}

              {showDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: '#252525', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', maxHeight: '280px', overflowY: 'auto',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10,
                }}>
                  {results.map((r) => (
                    <div key={r.id}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSchool(r); }}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem', fontWeight: 600, color: '#f5f0e8', marginBottom: '0.15rem' }}>
                        {r.name}
                      </div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)' }}>
                        {r.city}, {r.state}
                      </div>
                    </div>
                  ))}
                  {!searching && results.length === 0 && !searchError && (
                    <div style={{ padding: '14px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(245,240,232,0.35)' }}>
                      No schools found for "{query.trim()}"
                    </div>
                  )}
                  {searchError && (
                    <div style={{ padding: '14px 16px', fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.35)' }}>
                      Search unavailable — use the manual entry below
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.25)', whiteSpace: 'nowrap' }}>
                — or —
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            </div>

            {/* Manual entry */}
            <div>
              <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', display: 'block', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
                Enter full school name
              </label>
              <input
                ref={manualInputRef}
                id="school-manual-name"
                name="school-manual-name"
                type="text"
                placeholder="e.g., Clemson University"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && manualName.trim()) handleGenerate(manualName.trim(), 'search'); }}
                style={{ ...INPUT_STYLE, padding: '12px' }}
              />
              {genError && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: '#ef4444', margin: '0.4rem 0 0' }}>
                  {genError}
                </p>
              )}
              <button
                onClick={() => { if (manualName.trim()) handleGenerate(manualName.trim(), 'search'); }}
                disabled={!manualName.trim()}
                style={{
                  marginTop: '0.6rem', width: '100%', padding: '12px',
                  background: manualName.trim() ? '#E8976B' : 'rgba(232,151,107,0.2)',
                  border: 'none', borderRadius: '8px',
                  color: manualName.trim() ? '#111111' : 'rgba(232,151,107,0.4)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '14px', fontWeight: 600,
                  cursor: manualName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                Generate Profile
              </button>
            </div>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.35)', fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', cursor: 'pointer', padding: '0.25rem', margin: '-0.5rem 0 0', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.35)')}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
