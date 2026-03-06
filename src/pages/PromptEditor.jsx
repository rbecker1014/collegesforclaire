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
import {
  DEFAULT_SYSTEM, DEFAULT_USER,
  DEFAULT_SEARCH_SYSTEM, DEFAULT_SEARCH_USER,
  seedDefaultPrompts,
} from '../data/seedPrompts';

// ─── Prompt configs ──────────────────────────────────────────────────────────────

const KNOWN_PROMPTS = [
  {
    docId: 'school-profile',
    title: 'School Profile Generation',
    description: 'Used when generating a full school profile via Add School',
    placeholder: '{{schoolName}}',
    placeholderNote: '{{schoolName}} will be replaced with the school name at generation time',
    defaultSystem: DEFAULT_SYSTEM,
    defaultUser: DEFAULT_USER,
    testType: 'profile',
    systemRows: 20,
    userRows: 24,
  },
  {
    docId: 'school-search',
    title: 'School Search Lookup',
    description: 'Used when searching for schools in the Add School lookup',
    placeholder: '{{query}}',
    placeholderNote: '{{query}} will be replaced with the search query at lookup time',
    defaultSystem: DEFAULT_SEARCH_SYSTEM,
    defaultUser: DEFAULT_SEARCH_USER,
    testType: 'search',
    systemRows: 4,
    userRows: 8,
  },
];

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
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 15, height: 15, borderRadius: '50%',
        border: '1px solid rgba(245,240,232,0.25)',
        color: 'rgba(245,240,232,0.35)', fontSize: '9px', fontWeight: 700,
        cursor: 'default', flexShrink: 0,
      }}
    >
      i
    </span>
  );
}

function MiniSpinner({ size = 14, color = '#f5f0e8' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(245,240,232,0.15)', borderTopColor: color,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

// ─── HistoryCard ─────────────────────────────────────────────────────────────────

function HistoryCard({ item, onRestore }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: '#111111', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px', padding: '0.85rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', fontWeight: 600,
          color: 'rgba(245,240,232,0.6)', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px',
          padding: '0.1rem 0.45rem',
        }}>
          v{item.version}
        </span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.55)' }}>
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
          {['system', 'user'].map((field) => (
            <div key={field}>
              <div style={{ ...LABEL_STYLE, marginBottom: '0.3rem', textTransform: 'capitalize' }}>{field}</div>
              <textarea
                readOnly value={item[field] || ''}
                rows={5}
                style={{ ...TEXTAREA_STYLE, opacity: 0.65, resize: 'none', fontSize: '12px' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PromptCard ───────────────────────────────────────────────────────────────────

function PromptCard({
  docId, data, title, description,
  defaultSystem, defaultUser,
  testType, placeholderNote, systemRows, userRows,
  showToast,
}) {
  const { user } = useAuth();

  const [systemVal, setSystemVal] = useState('');
  const [userVal, setUserVal] = useState('');
  const [original, setOriginal] = useState({ system: '', user: '' });
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');
  const [history, setHistory] = useState([]);

  const initialized = useRef(false);
  const prevData = useRef(null);

  // Sync from Firestore data prop (only update state when content actually changed)
  useEffect(() => {
    if (!data) return;
    const prev = prevData.current;
    if (prev && prev.system === data.system && prev.user === data.user && prev.version === data.version) return;
    prevData.current = data;
    setMeta({ lastEditedBy: data.lastEditedBy, lastEditedAt: data.lastEditedAt, version: data.version });
    setOriginal({ system: data.system || '', user: data.user || '' });
    if (!initialized.current) {
      setSystemVal(data.system || '');
      setUserVal(data.user || '');
      initialized.current = true;
    }
  }, [data]);

  // Subscribe to history subcollection
  useEffect(() => {
    const histRef = collection(db, 'prompts', docId, 'history');
    const q = query(histRef, orderBy('savedAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [docId]);

  const hasChanges = initialized.current && (systemVal !== original.system || userVal !== original.user);

  async function saveToHistory() {
    await addDoc(collection(db, 'prompts', docId, 'history'), {
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
      await updateDoc(doc(db, 'prompts', docId), {
        system: systemVal,
        user: userVal,
        lastEditedBy: user?.displayName ?? 'Unknown',
        lastEditedAt: serverTimestamp(),
        version: (meta?.version ?? 1) + 1,
      });
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
      await updateDoc(doc(db, 'prompts', docId), {
        system: defaultSystem,
        user: defaultUser,
        lastEditedBy: user?.displayName ?? 'Unknown',
        lastEditedAt: serverTimestamp(),
        version: (meta?.version ?? 1) + 1,
      });
      setSystemVal(defaultSystem);
      setUserVal(defaultUser);
      setOriginal({ system: defaultSystem, user: defaultUser });
      showToast('Reset to defaults');
    } catch (err) {
      showToast('Reset failed: ' + err.message, '#ef4444');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const q = testQuery.trim();
    if (!q) return;
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      if (testType === 'profile') {
        const fn = httpsCallable(functions, 'generateSchoolProfile', { timeout: 120000 });
        const result = await fn({ schoolName: q });
        if (result.data.success) {
          setTestResult({ type: 'profile', schoolId: result.data.schoolId, schoolName: result.data.schoolName });
        }
      } else {
        const fn = httpsCallable(functions, 'searchSchools');
        const result = await fn({ query: q });
        setTestResult({ type: 'search', results: result.data.results || [] });
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

  const testPlaceholder = testType === 'profile' ? 'e.g., Purdue University' : 'e.g., UConn, SDSU, Michigan';
  const testBtnLabel = testType === 'profile' ? 'Generate Test Profile' : 'Search';
  const testLoadingLabel = testType === 'profile' ? 'Generating…' : 'Searching…';

  if (!data) return null;

  return (
    <div style={{
      background: '#1A1A1A',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '2rem',
      marginBottom: '2rem',
    }}>
      {/* Card header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{
          fontFamily: "'Libre Baskerville', serif",
          fontSize: '1.15rem', color: '#f5f0e8', margin: '0 0 0.3rem',
        }}>
          {title}
        </h2>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.85rem', color: 'rgba(245,240,232,0.45)', margin: 0,
        }}>
          {description}
        </p>
      </div>

      {/* System prompt */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={LABEL_STYLE}>
          System Prompt
          <InfoIcon tip="Sets Claude's role and behavior for this function" />
        </div>
        <textarea
          value={systemVal}
          onChange={(e) => setSystemVal(e.target.value)}
          rows={systemRows}
          style={TEXTAREA_STYLE}
        />
        <div style={CHAR_COUNT_STYLE}>{systemVal.length.toLocaleString()} characters</div>
      </div>

      {/* User prompt */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={LABEL_STYLE}>
          User Prompt Template
          <InfoIcon tip={placeholderNote} />
        </div>
        <textarea
          value={userVal}
          onChange={(e) => setUserVal(e.target.value)}
          rows={userRows}
          style={TEXTAREA_STYLE}
        />
        <div style={CHAR_COUNT_STYLE}>{userVal.length.toLocaleString()} characters</div>
        <div style={{
          marginTop: '0.6rem', padding: '0.5rem 0.85rem',
          background: 'rgba(232,151,107,0.08)', border: '1px solid rgba(232,151,107,0.2)',
          borderRadius: '6px', fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.8rem', color: 'rgba(232,151,107,0.8)',
        }}>
          {placeholderNote}
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
            border: 'none', borderRadius: '7px',
            color: hasChanges && !saving ? '#111' : 'rgba(232,151,107,0.5)',
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 600,
            cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
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
          {testOpen ? 'Close Test' : testType === 'profile' ? 'Test with a School' : 'Test Search'}
        </button>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div style={{
          background: '#111111', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem',
            color: 'rgba(245,240,232,0.75)', margin: 0, flex: 1,
          }}>
            Reset to default prompts? Current prompts will be saved to history first.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleReset}
              style={{
                padding: '0.4rem 0.9rem', background: '#ef4444', border: 'none',
                borderRadius: '6px', color: '#fff', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer',
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
          background: '#111111', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px', padding: '1.25rem', marginBottom: '1.75rem',
        }}>
          <p style={{
            fontFamily: "'Libre Baskerville', serif", fontSize: '0.95rem',
            color: '#f5f0e8', margin: '0 0 0.85rem',
          }}>
            {testType === 'profile' ? 'Test with a School' : 'Test Search Query'}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={testPlaceholder}
              value={testQuery}
              disabled={testLoading}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !testLoading) handleTest(); }}
              style={{
                flex: 1, minWidth: '200px', background: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px',
                padding: '0.5rem 0.85rem', color: '#f5f0e8',
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem',
                outline: 'none', opacity: testLoading ? 0.5 : 1,
              }}
            />
            <button
              onClick={handleTest}
              disabled={testLoading || !testQuery.trim()}
              style={{
                padding: '0.5rem 1.1rem',
                background: testLoading || !testQuery.trim() ? 'rgba(232,151,107,0.25)' : '#E8976B',
                border: 'none', borderRadius: '7px',
                color: testLoading || !testQuery.trim() ? 'rgba(232,151,107,0.5)' : '#111',
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', fontWeight: 600,
                cursor: testLoading || !testQuery.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap',
              }}
            >
              {testLoading ? <><MiniSpinner size={13} color="#111" /> {testLoadingLabel}</> : testBtnLabel}
            </button>
          </div>

          {testLoading && testType === 'profile' && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem',
              color: 'rgba(245,240,232,0.45)', margin: '0.75rem 0 0',
            }}>
              Generating test profile… (30–60 seconds)
            </p>
          )}

          {/* Profile result */}
          {testResult?.type === 'profile' && (
            <div style={{
              marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: '#6fcf97',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6fcf97" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {testResult.schoolName} profile created —{' '}
              <Link to={`/school/${testResult.schoolId}`} style={{ color: '#E8976B', textDecoration: 'underline' }}>
                View Profile
              </Link>
            </div>
          )}

          {/* Search results */}
          {testResult?.type === 'search' && (
            <div style={{ marginTop: '0.85rem' }}>
              {testResult.results.length === 0 ? (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem',
                  color: 'rgba(245,240,232,0.45)', margin: 0,
                }}>
                  No results found
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {testResult.results.map((school, i) => (
                    <div key={i} style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '6px',
                    }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem', color: '#f5f0e8' }}>
                        {school.name}
                      </span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(245,240,232,0.4)', marginLeft: '0.5rem' }}>
                        {school.city}, {school.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {testError && (
            <div style={{ marginTop: '0.85rem' }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem',
                color: '#ef4444', margin: '0 0 0.4rem',
              }}>
                {testError}
              </p>
              {testError.length > 100 && (
                <pre style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '6px', padding: '0.75rem', fontSize: '12px',
                  fontFamily: "'JetBrains Mono', monospace", color: 'rgba(245,240,232,0.55)',
                  maxHeight: '300px', overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                }}>
                  {testError}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{
          fontFamily: "'Libre Baskerville', serif", fontSize: '1rem',
          color: '#f5f0e8', margin: '0 0 0.85rem',
        }}>
          Prompt History
        </h3>
        {history.length === 0 ? (
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem',
            color: 'rgba(245,240,232,0.3)', margin: 0,
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
          fontFamily: "'DM Sans', sans-serif", fontSize: '11px',
          color: 'rgba(245,240,232,0.3)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
        }}>
          <span>Last edited by {meta.lastEditedBy || '—'} on {formatDate(meta.lastEditedAt)}</span>
          <span>Prompt version: {meta.version}</span>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function PromptEditor() {
  const [promptsMap, setPromptsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState(null);

  // Subscribe to entire prompts collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'prompts'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setPromptsMap(map);
      setLoading(false);
    });
    return unsub;
  }, []);

  const missingCount = KNOWN_PROMPTS.filter((p) => !promptsMap[p.docId]).length;

  function showToast(message, color = '#6fcf97') {
    setToast({ message, color });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSeedAll() {
    setSeeding(true);
    try {
      await seedDefaultPrompts(db);
      showToast('Prompts initialized!');
    } catch (err) {
      showToast('Failed to initialize: ' + err.message, '#ef4444');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <NavBar />
      <main style={{ padding: '2.5rem 1.5rem 6rem', maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '1.85rem', color: '#f5f0e8', margin: '0 0 0.4rem',
          }}>
            Prompt Editor
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.9rem',
            color: 'rgba(245,240,232,0.45)', margin: '0 0 0.3rem',
          }}>
            Edit the prompts used by Claude for school profile generation and search
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem',
            color: 'rgba(245,240,232,0.28)', margin: 0,
          }}>
            Changes take effect immediately for the next operation
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div className="spinner" />
          </div>
        )}

        {/* Initialize banner */}
        {!loading && missingCount > 0 && (
          <div style={{
            background: 'rgba(232,151,107,0.08)', border: '1px solid rgba(232,151,107,0.25)',
            borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '2rem',
            display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
          }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.875rem',
              color: 'rgba(232,151,107,0.9)', margin: 0, flex: 1,
            }}>
              {missingCount === 1 ? '1 prompt is' : `${missingCount} prompts are`} missing from Firestore. Initialize with default production prompts?
            </p>
            <button
              onClick={handleSeedAll}
              disabled={seeding}
              style={{
                padding: '0.5rem 1.25rem', background: '#E8976B', border: 'none',
                borderRadius: '7px', color: '#111', fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem', fontWeight: 600,
                cursor: seeding ? 'not-allowed' : 'pointer',
                opacity: seeding ? 0.6 : 1, whiteSpace: 'nowrap',
              }}
            >
              {seeding ? 'Initializing…' : 'Initialize All Prompts'}
            </button>
          </div>
        )}

        {/* Prompt cards */}
        {!loading && KNOWN_PROMPTS.map((p) => (
          <PromptCard
            key={p.docId}
            docId={p.docId}
            data={promptsMap[p.docId] || null}
            title={p.title}
            description={p.description}
            defaultSystem={p.defaultSystem}
            defaultUser={p.defaultUser}
            testType={p.testType}
            placeholderNote={p.placeholderNote}
            systemRows={p.systemRows}
            userRows={p.userRows}
            showToast={showToast}
          />
        ))}

      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', border: `1px solid ${toast.color}`, borderRadius: '8px',
          padding: '0.6rem 1.25rem', fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.875rem', color: toast.color, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 999,
          animation: 'fadeIn 0.2s ease', whiteSpace: 'nowrap',
        }}>
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
