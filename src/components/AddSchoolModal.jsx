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

  // Step: 'search' | 'confirm' | 'generating' | 'success'
  const [step, setStep] = useState('search');

  // Search step state
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [manualName, setManualName] = useState('');

  // Confirm step state
  const [selected, setSelected] = useState(null); // { id, name, city, state, url }
  const [duplicate, setDuplicate] = useState(null); // existing school object

  // Generate step state
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [genError, setGenError] = useState('');
  const [success, setSuccess] = useState(null); // { schoolId, schoolName }

  const inputRef = useRef(null);
  const manualRef = useRef(null);
  const timersRef = useRef([]);

  const { results, loading: searching, error: searchError } = useSchoolSearch(query);

  // Focus input on mount / step change
  useEffect(() => {
    if (step === 'search') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (fallbackMode) {
      setTimeout(() => manualRef.current?.focus(), 50);
    }
  }, [step, fallbackMode]);

  // Auto-enable fallback if API errors persist
  useEffect(() => {
    if (searchError && query.trim().length >= 3 && !searching) {
      setFallbackMode(true);
    }
  }, [searchError, query, searching]);

  // Show dropdown when we have a query and results/state to show
  useEffect(() => {
    setShowDropdown(query.trim().length >= 3);
  }, [query]);

  // Escape key handling
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (step === 'generating') return; // can't close while generating
      if (step === 'confirm') { setStep('search'); return; }
      if (step === 'search' && query) { setQuery(''); setShowDropdown(false); return; }
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, query, onClose]);

  // Clear timers on unmount
  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  function handleSelectSchool(school) {
    setSelected(school);
    setShowDropdown(false);
    // Duplicate check
    const nameLower = school.name.toLowerCase();
    const found = schools.find((s) =>
      s.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(s.name.toLowerCase())
    );
    setDuplicate(found || null);
    setStep('confirm');
    setGenError('');
  }

  function handleBackToSearch() {
    setStep('search');
    setSelected(null);
    setDuplicate(null);
    setGenError('');
    setVisibleSteps([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function startProgressSteps() {
    setVisibleSteps([]);
    PROGRESS_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setVisibleSteps((prev) => [...prev, i]);
      }, step.delay);
      timersRef.current.push(t);
    });
  }

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  async function handleGenerate() {
    const schoolName = fallbackMode ? manualName.trim() : selected?.name;
    if (!schoolName) return;

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
        setTimeout(() => {
          onClose();
          navigate(`/school/${result.data.schoolId}`);
        }, 1500);
      }
    } catch (err) {
      clearTimers();
      setVisibleSteps([]);
      setStep('confirm');
      setGenError(err?.message || 'Something went wrong. Please try again.');
    }
  }

  const isGenerating = step === 'generating';
  const schoolNameForDisplay = fallbackMode ? manualName.trim() : selected?.name ?? '';

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !isGenerating) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div style={{
        background: '#1A1A1A',
        borderRadius: '12px',
        padding: '32px',
        width: '100%',
        maxWidth: '480px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>

        {/* ── SUCCESS ── */}
        {step === 'success' && success && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: 'rgba(111,207,151,0.12)',
              border: '2px solid #6fcf97',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <CheckIcon size={24} />
            </div>
            <p style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '1.1rem', color: '#f5f0e8', margin: 0,
            }}>
              {success.schoolName} has been added!
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.85rem', color: 'rgba(245,240,232,0.45)', margin: '0.5rem 0 0',
            }}>
              Opening profile…
            </p>
          </div>
        )}

        {/* ── SEARCH STEP ── */}
        {(step === 'search') && (
          <>
            <div>
              <h2 style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.35rem', color: '#f5f0e8', margin: '0 0 0.4rem',
              }}>
                Add a School
              </h2>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem', color: 'rgba(245,240,232,0.45)',
                margin: 0, lineHeight: 1.55,
              }}>
                Search for a school to get started.
              </p>
            </div>

            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search for a school..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (query.trim().length >= 3) setShowDropdown(true); }}
                style={INPUT_STYLE}
              />
              {/* Spinner inside input */}
              {searching && (
                <span style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                }}>
                  <MiniSpinner size={14} color="rgba(245,240,232,0.4)" />
                </span>
              )}

              {/* Results dropdown */}
              {showDropdown && !fallbackMode && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0, right: 0,
                  background: '#252525',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  zIndex: 10,
                }}>
                  {results.length > 0 && results.map((r) => (
                    <div
                      key={r.id}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSchool(r); }}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '0.9rem', fontWeight: 600, color: '#f5f0e8',
                        marginBottom: '0.15rem',
                      }}>
                        {r.name}
                      </div>
                      <div style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)',
                      }}>
                        {r.city}, {r.state}
                      </div>
                    </div>
                  ))}
                  {!searching && results.length === 0 && !searchError && (
                    <div style={{
                      padding: '14px 16px',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.85rem', color: 'rgba(245,240,232,0.35)',
                    }}>
                      No schools found for "{query.trim()}"
                    </div>
                  )}
                  {searchError && (
                    <div style={{
                      padding: '14px 16px',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.82rem', color: 'rgba(245,240,232,0.35)',
                    }}>
                      School search unavailable — enter the full school name manually
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fallback manual entry */}
            {fallbackMode && (
              <div>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.8rem', color: 'rgba(245,240,232,0.35)',
                  margin: '0 0 0.5rem',
                }}>
                  School search unavailable — enter the full school name manually
                </p>
                <input
                  ref={manualRef}
                  type="text"
                  placeholder="e.g., Clemson University"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && manualName.trim()) handleGenerate(); }}
                  style={{ ...INPUT_STYLE, padding: '12px' }}
                />
                {manualName.trim() && (
                  <button
                    onClick={handleGenerate}
                    style={{
                      marginTop: '0.75rem',
                      width: '100%', padding: '12px',
                      background: '#E8976B', border: 'none', borderRadius: '8px',
                      color: '#111', fontFamily: "'DM Sans', sans-serif",
                      fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Generate Profile for {manualName.trim()}
                  </button>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none',
                color: 'rgba(245,240,232,0.35)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem', cursor: 'pointer',
                padding: '0.25rem', margin: '-0.5rem 0 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.35)')}
            >
              Cancel
            </button>
          </>
        )}

        {/* ── CONFIRM / GENERATING STEP ── */}
        {(step === 'confirm' || step === 'generating') && selected && (
          <>
            <div>
              <h2 style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.35rem', color: '#f5f0e8', margin: '0 0 0.4rem',
              }}>
                Add a School
              </h2>
            </div>

            {/* Selected school card */}
            <div style={{
              background: '#111111',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '14px 16px',
            }}>
              <div style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.05rem', fontWeight: 700, color: '#f5f0e8',
                marginBottom: '0.2rem',
              }}>
                {selected.name}
              </div>
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.82rem', color: 'rgba(245,240,232,0.45)',
                marginBottom: selected.url ? '0.4rem' : 0,
              }}>
                {selected.city}, {selected.state}
              </div>
              {selected.url && (
                <a
                  href={`https://${selected.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.78rem', color: 'rgba(232,151,107,0.7)',
                    textDecoration: 'none',
                  }}
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
                background: 'rgba(232,151,107,0.07)',
                border: '1px solid rgba(232,151,107,0.25)',
                borderRadius: '7px',
                padding: '0.65rem 0.9rem',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.82rem',
                color: 'rgba(232,151,107,0.85)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}>
                <span>⚠️ {duplicate.name} is already on your list.</span>
                <Link
                  to={`/school/${duplicate.id}`}
                  onClick={onClose}
                  style={{ color: '#E8976B', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  View it
                </Link>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                width: '100%', padding: '12px',
                background: isGenerating ? 'rgba(232,151,107,0.45)' : '#E8976B',
                border: 'none', borderRadius: '8px',
                color: isGenerating ? 'rgba(17,17,17,0.6)' : '#111111',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px', fontWeight: 600,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {isGenerating ? (
                <><MiniSpinner size={14} color="#111" /> Researching {selected.name}…</>
              ) : (
                `Generate Profile for ${selected.name}`
              )}
            </button>

            {/* Progress steps */}
            {isGenerating && visibleSteps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '-0.25rem' }}>
                {PROGRESS_STEPS.map((s, i) => {
                  if (!visibleSteps.includes(i)) return null;
                  const isActive = visibleSteps[visibleSteps.length - 1] === i;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.82rem',
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

            {/* Generation error */}
            {genError && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.82rem', color: '#ef4444', margin: 0,
              }}>
                {genError}
              </p>
            )}

            {/* Hint text + back link */}
            {!isGenerating && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '-0.25rem' }}>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.8rem', color: 'rgba(245,240,232,0.3)',
                  margin: 0, lineHeight: 1.5,
                }}>
                  This will take 30–60 seconds. Claude will research this school and build a complete profile.
                </p>
                <button
                  onClick={handleBackToSearch}
                  style={{
                    background: 'none', border: 'none',
                    color: 'rgba(245,240,232,0.35)',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.85rem', cursor: 'pointer',
                    padding: 0, textAlign: 'left',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.7)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.35)')}
                >
                  ← Pick a different school
                </button>
              </div>
            )}
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
