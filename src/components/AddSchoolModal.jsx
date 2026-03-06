import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

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
  padding: '12px',
  color: '#f5f0e8',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '15px',
  outline: 'none',
};

function MiniSpinner({ size = 14, color = '#f5f0e8' }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid rgba(245,240,232,0.2)`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

export default function AddSchoolModal({ onClose }) {
  const navigate = useNavigate();
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visibleSteps, setVisibleSteps] = useState([]);
  const [success, setSuccess] = useState(null); // { schoolId, schoolName }
  const inputRef = useRef(null);
  const timersRef = useRef([]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  // Clear timers on unmount
  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

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
    const name = schoolName.trim();
    if (!name) {
      setError('Please enter a school name.');
      return;
    }
    setError('');
    setLoading(true);
    startProgressSteps();

    try {
      const generateProfile = httpsCallable(functions, 'generateSchoolProfile', {
        timeout: 120000,
      });
      const result = await generateProfile({ schoolName: name });

      if (result.data.success) {
        clearTimers();
        setVisibleSteps([]);
        setSuccess({ schoolId: result.data.schoolId, schoolName: result.data.schoolName });
        setTimeout(() => {
          onClose();
          navigate(`/school/${result.data.schoolId}`);
        }, 1500);
      }
    } catch (err) {
      clearTimers();
      setVisibleSteps([]);
      setLoading(false);
      setError(err?.message || 'Something went wrong. Please try again.');
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
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
        {/* Success state */}
        {success ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(111,207,151,0.12)',
              border: '2px solid #6fcf97',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '1.1rem',
              color: '#f5f0e8',
              margin: 0,
            }}>
              {success.schoolName} has been added!
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.85rem',
              color: 'rgba(245,240,232,0.45)',
              margin: '0.5rem 0 0',
            }}>
              Opening profile…
            </p>
          </div>
        ) : (
          <>
            {/* Heading */}
            <div>
              <h2 style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.35rem',
                color: '#f5f0e8',
                margin: '0 0 0.4rem',
              }}>
                Add a School
              </h2>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem',
                color: 'rgba(245,240,232,0.45)',
                margin: 0,
                lineHeight: 1.55,
              }}>
                Enter a school name and Claire's AI assistant will research it and build a full profile. This usually takes 30–60 seconds.
              </p>
            </div>

            {/* Input */}
            <div>
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g., Clemson University"
                value={schoolName}
                disabled={loading}
                onChange={(e) => { setSchoolName(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleGenerate(); }}
                style={{
                  ...INPUT_STYLE,
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? 'not-allowed' : 'text',
                }}
              />

              {/* Error */}
              {error && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.82rem',
                  color: '#ef4444',
                  margin: '0.5rem 0 0',
                }}>
                  {error}
                </p>
              )}

              {/* Progress steps */}
              {loading && visibleSteps.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {PROGRESS_STEPS.map((step, i) => {
                    const isVisible = visibleSteps.includes(i);
                    const isActive = visibleSteps[visibleSteps.length - 1] === i;
                    const isDone = visibleSteps.includes(i) && !isActive;
                    if (!isVisible) return null;
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: '0.82rem',
                          color: isDone ? 'rgba(245,240,232,0.4)' : 'rgba(245,240,232,0.8)',
                          animation: 'fadeIn 0.4s ease',
                        }}
                      >
                        {isDone ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <MiniSpinner size={13} color="#E8976B" />
                        )}
                        {step.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: loading ? 'rgba(232,151,107,0.45)' : '#E8976B',
                border: 'none',
                borderRadius: '8px',
                color: loading ? 'rgba(17,17,17,0.6)' : '#111111',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? (
                <>
                  <MiniSpinner size={14} color="#111111" />
                  Researching {schoolName.trim()}…
                </>
              ) : (
                'Generate Profile'
              )}
            </button>

            {/* Cancel */}
            {!loading && (
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(245,240,232,0.35)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  margin: '-0.5rem 0 0',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.7)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.35)')}
              >
                Cancel
              </button>
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
