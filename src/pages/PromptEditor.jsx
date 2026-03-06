import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  doc, onSnapshot, collection, addDoc, updateDoc,
  serverTimestamp, query, orderBy, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import NavBar from '../components/NavBar';
import { db, functions } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_SYSTEM, DEFAULT_USER, seedDefaultPrompts } from '../data/seedPrompts';

// ─── Shared styles ──────────────────────────────────────────────────────────────

const TEXTAREA_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '16px',
  color: '#f5f0e8',
  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
  fontSize: '13px',
  lineHeight: 1.6,
  resize: 'vertical',
  outline: 'none',
};

const LABEL_STYLE = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'rgba(245,240,232,0.5)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '0.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
};

const CHAR_COUNT_STYLE = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.75rem',
  color: 'rgba(245,240,232,0.25)',
  marginTop: '0.35rem',
  textAlign: 'right',
};

const GHOST_BTN = {
  padding: '0.5rem 1rem',
  background: 'none',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '7px',
  color: 'rgba(245,240,232,0.7)',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.875rem',
  cursor: 'pointer',
  transition: 'border-color 0.15s, color 0.15s',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function InfoIcon({ tip }) {
  return (
    <span
      title={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 15,
        height: 15,
        borderRadius: '50%',
        border: '1px solid rgba(245,240,232,0.25)',
        color: 'rgba(245,240,232,0.35)',
        fontSize: '9px',
        fontWeight: 700,
        cursor: 'default',
        flexShrink: 0,
      }}
    >
      i
    </span>
  );
}

function MiniSpinner({ size = 14, color = '#f5f0e8' }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: '2px solid rgba(245,240,232,0.15)',
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ─── History card ────────────────────────────────────────────────────────────────

function HistoryCard({ item, onRestore }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: '#111111',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      padding: '0.85rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'rgba(245,240,232,0.6)',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px',
          padding: '0.1rem 0.45rem',
        }}>
          v{item.version}
        </span>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.82rem',
          color: 'rgba(245,240,232,0.55)',
        }}>
          {formatDate(item.savedAt)} · {item.savedBy || 'Unknown'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ ...GHOST_BTN, fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>
          <button
            onClick={() => onRestore(item)}
            style={{ ...GHOST_BTN, fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
          >
            Restore
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <div style={{ ...LABEL_STYLE, marginBottom: '0.3rem' }}>System</div>
            <textarea
              readOnly
              value={item.system || ''}
              rows={6}
              style={{ ...TEXTAREA_STYLE, opacity: 0.65, resize: 'none', fontSize: '12px' }}
            />
          </div>
          <div>
            <div style={{ ...LABEL_STYLE, marginBottom: '0.3rem' }}>User</div>
            <textarea
              readOnly
              value={item.user || ''}
              rows={6}
              style={{ ...TEXTAREA_STYLE, opacity: 0.65, resize: 'none', fontSize: '12px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function PromptEditor() {
  const { user } = useAuth();

  // Editor state
  const [systemVal, setSystemVal] = useState('');
  const [userVal, setUserVal] = useState('');
  const [original, setOriginal] = useState({ system: '', user: '' });
  const [meta, setMeta] = useState(null); // { lastEditedBy, lastEditedAt, version }
  const [docExists, setDocExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // UI state
  const [toast, setToast] = useState(null); // { message, color }
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Test state
  const [testOpen, setTestOpen] = useState(false);
  const [testName, setTestName] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');

  // History
  const [history, setHistory] = useState([]);

  const initialized = useRef(false);

  // Subscribe to main prompt doc
  useEffect(() => {
    const ref = doc(db, 'prompts', 'school-profile');
    const unsub = onSnapshot(ref, (snap) => {
      setLoading(false);
      if (!snap.exists()) {
        setDocExists(false);
        return;
      }
      setDocExists(true);
      const data = snap.data();
      setMeta({
        lastEditedBy: data.lastEditedBy,
        lastEditedAt: data.lastEditedAt,
        version: data.version,
      });
      setOriginal({ system: data.system || '', user: data.user || '' });
      if (!initialized.current) {
        setSystemVal(data.system || '');
        setUserVal(data.user || '');
        initialized.current = true;
      }
    });
    return unsub;
  }, []);

  // Subscribe to history subcollection
  useEffect(() => {
    const histRef = collection(db, 'prompts', 'school-profile', 'history');
    const q = query(histRef, orderBy('savedAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const hasChanges = systemVal !== original.system || userVal !== original.user;

  function showToast(message, color = '#6fcf97') {
    setToast({ message, color });
    setTimeout(() => setToast(null), 2500);
  }

  async function saveToHistory() {
    const histRef = collection(db, 'prompts', 'school-profile', 'history');
    await addDoc(histRef, {
      system: original.system,
      user: original.user,
      savedBy: user?.displayName ?? 'Unknown',
      savedByEmail: user?.email ?? '',
      savedAt: serverTimestamp(),
      version: meta?.version ?? 1,
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveToHistory();
      await updateDoc(doc(db, 'prompts', 'school-profile'), {
        system: systemVal,
        user: userVal,
        lastEditedBy: user?.displayName ?? 'Unknown',
        lastEditedAt: serverTimestamp(),
        version: (meta?.version ?? 1) + 1,
      });
      // Sync original so hasChanges resets
      setOriginal({ system: systemVal, user: userVal });
      showToast('Saved!');
    } catch (err) {
      showToast('Save failed: ' + err.message, '#ef4444');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setShowResetConfirm(false);
    setSaving(true);
    try {
      await saveToHistory();
      await updateDoc(doc(db, 'prompts', 'school-profile'), {
        system: DEFAULT_SYSTEM,
        user: DEFAULT_USER,
        lastEditedBy: user?.displayName ?? 'Unknown',
        lastEditedAt: serverTimestamp(),
        version: (meta?.version ?? 1) + 1,
      });
      setSystemVal(DEFAULT_SYSTEM);
      setUserVal(DEFAULT_USER);
      setOriginal({ system: DEFAULT_SYSTEM, user: DEFAULT_USER });
      showToast('Reset to defaults');
    } catch (err) {
      showToast('Reset failed: ' + err.message, '#ef4444');
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDefaultPrompts(db);
    } finally {
      setSeeding(false);
    }
  }

  async function handleTest() {
    const name = testName.trim();
    if (!name) return;
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      const generateProfile = httpsCallable(functions, 'generateSchoolProfile', { timeout: 120000 });
      const result = await generateProfile({ schoolName: name });
      if (result.data.success) {
        setTestResult({ schoolId: result.data.schoolId, schoolName: result.data.schoolName });
      }
    } catch (err) {
      setTestError(err?.message || 'Unknown error');
    } finally {
      setTestLoading(false);
    }
  }

  function handleRestore(item) {
    setSystemVal(item.system || '');
    setUserVal(item.user || '');
  }

  return (
    <>
      <NavBar />
      <main style={{ padding: '2.5rem 1.5rem 6rem', maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '1.85rem',
            color: '#f5f0e8',
            margin: '0 0 0.4rem',
          }}>
            Prompt Editor
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.9rem',
            color: 'rgba(245,240,232,0.45)',
            margin: '0 0 0.3rem',
          }}>
            Edit the prompts used when generating school profiles via Claude API
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.8rem',
            color: 'rgba(245,240,232,0.28)',
            margin: 0,
          }}>
            Changes take effect immediately for the next school generated
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div className="spinner" />
          </div>
        )}

        {/* Initialize prompts */}
        {!loading && !docExists && (
          <div style={{
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '2.5rem',
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              color: 'rgba(245,240,232,0.55)',
              marginBottom: '1.25rem',
            }}>
              No prompt document found. Initialize with the default production prompts?
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              style={{
                padding: '0.6rem 1.5rem',
                background: '#E8976B',
                border: 'none',
                borderRadius: '7px',
                color: '#111',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: seeding ? 'not-allowed' : 'pointer',
                opacity: seeding ? 0.6 : 1,
              }}
            >
              {seeding ? 'Initializing…' : 'Initialize Prompts'}
            </button>
          </div>
        )}

        {/* Editor */}
        {!loading && docExists && (
          <>
            {/* System prompt */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={LABEL_STYLE}>
                System Prompt
                <InfoIcon tip="Sets Claude's role, Claire's criteria, and source requirements" />
              </div>
              <textarea
                value={systemVal}
                onChange={(e) => setSystemVal(e.target.value)}
                rows={20}
                style={TEXTAREA_STYLE}
              />
              <div style={CHAR_COUNT_STYLE}>{systemVal.length.toLocaleString()} characters</div>
            </div>

            {/* User prompt */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={LABEL_STYLE}>
                User Prompt Template
                <InfoIcon tip="The research request sent for each school. Use {{schoolName}} as the placeholder." />
              </div>
              <textarea
                value={userVal}
                onChange={(e) => setUserVal(e.target.value)}
                rows={24}
                style={TEXTAREA_STYLE}
              />
              <div style={CHAR_COUNT_STYLE}>{userVal.length.toLocaleString()} characters</div>
              <div style={{
                marginTop: '0.6rem',
                padding: '0.5rem 0.85rem',
                background: 'rgba(232,151,107,0.08)',
                border: '1px solid rgba(232,151,107,0.2)',
                borderRadius: '6px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.8rem',
                color: 'rgba(232,151,107,0.8)',
              }}>
                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }}>
                  {'{{schoolName}}'}
                </code>
                {' '}will be replaced with the actual school name at generation time
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: hasChanges && !saving ? '#E8976B' : 'rgba(232,151,107,0.25)',
                  border: 'none',
                  borderRadius: '7px',
                  color: hasChanges && !saving ? '#111' : 'rgba(232,151,107,0.5)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'background 0.15s',
                }}
              >
                {saving ? <><MiniSpinner size={13} color="#111" /> Saving…</> : 'Save Changes'}
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                disabled={saving}
                style={GHOST_BTN}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = '#f5f0e8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(245,240,232,0.7)'; }}
              >
                Reset to Default
              </button>
              <button
                onClick={() => { setTestOpen(o => !o); setTestResult(null); setTestError(''); }}
                style={GHOST_BTN}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = '#f5f0e8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(245,240,232,0.7)'; }}
              >
                {testOpen ? 'Close Test' : 'Test with a School'}
              </button>
            </div>

            {/* Reset confirmation */}
            {showResetConfirm && (
              <div style={{
                background: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.875rem',
                  color: 'rgba(245,240,232,0.75)',
                  margin: 0,
                  flex: 1,
                }}>
                  Reset to default prompts? Your current prompts will be saved to history first.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleReset}
                    style={{
                      padding: '0.4rem 0.9rem',
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.83rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Yes, Reset
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    style={{ ...GHOST_BTN, fontSize: '0.83rem', padding: '0.4rem 0.9rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Test section */}
            {testOpen && (
              <div style={{
                background: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '2rem',
              }}>
                <p style={{
                  fontFamily: "'Libre Baskerville', serif",
                  fontSize: '0.95rem',
                  color: '#f5f0e8',
                  margin: '0 0 0.85rem',
                }}>
                  Test with a School
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="e.g., Purdue University"
                    value={testName}
                    disabled={testLoading}
                    onChange={(e) => setTestName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !testLoading) handleTest(); }}
                    style={{
                      flex: 1,
                      minWidth: '200px',
                      background: '#111111',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '7px',
                      padding: '0.5rem 0.85rem',
                      color: '#f5f0e8',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.875rem',
                      outline: 'none',
                      opacity: testLoading ? 0.5 : 1,
                    }}
                  />
                  <button
                    onClick={handleTest}
                    disabled={testLoading || !testName.trim()}
                    style={{
                      padding: '0.5rem 1.1rem',
                      background: testLoading || !testName.trim() ? 'rgba(232,151,107,0.25)' : '#E8976B',
                      border: 'none',
                      borderRadius: '7px',
                      color: testLoading || !testName.trim() ? 'rgba(232,151,107,0.5)' : '#111',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: testLoading || !testName.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {testLoading ? (
                      <><MiniSpinner size={13} color="#111" /> Generating…</>
                    ) : 'Run Test'}
                  </button>
                </div>

                {testLoading && (
                  <p style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.82rem',
                    color: 'rgba(245,240,232,0.45)',
                    margin: '0.75rem 0 0',
                  }}>
                    Generating test profile for {testName.trim()}… (30–60 seconds)
                  </p>
                )}

                {testResult && (
                  <div style={{
                    marginTop: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '0.875rem',
                    color: '#6fcf97',
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {testResult.schoolName} profile created —{' '}
                    <Link
                      to={`/school/${testResult.schoolId}`}
                      style={{ color: '#E8976B', textDecoration: 'underline' }}
                    >
                      View Profile
                    </Link>
                  </div>
                )}

                {testError && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.82rem',
                      color: '#ef4444',
                      margin: '0 0 0.4rem',
                    }}>
                      {testError}
                    </p>
                    {testError.length > 100 && (
                      <pre style={{
                        background: '#111',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'rgba(245,240,232,0.55)',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: 0,
                      }}>
                        {testError}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* History */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{
                fontFamily: "'Libre Baskerville', serif",
                fontSize: '1.1rem',
                color: '#f5f0e8',
                margin: '0 0 1rem',
              }}>
                Prompt History
              </h2>
              {history.length === 0 ? (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.875rem',
                  color: 'rgba(245,240,232,0.3)',
                  margin: 0,
                }}>
                  No previous versions
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {history.map((item) => (
                    <HistoryCard key={item.id} item={item} onRestore={handleRestore} />
                  ))}
                </div>
              )}
            </div>

            {/* Metadata footer */}
            {meta && (
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '11px',
                color: 'rgba(245,240,232,0.3)',
                display: 'flex',
                gap: '1.5rem',
                flexWrap: 'wrap',
              }}>
                <span>Last edited by {meta.lastEditedBy || '—'} on {formatDate(meta.lastEditedAt)}</span>
                <span>Prompt version: {meta.version}</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1A1A1A',
          border: `1px solid ${toast.color}`,
          borderRadius: '8px',
          padding: '0.6rem 1.25rem',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.875rem',
          color: toast.color,
          fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease',
          whiteSpace: 'nowrap',
        }}>
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}
