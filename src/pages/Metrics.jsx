import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, where,
  doc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Trash2, RefreshCw, Plus, FlaskConical } from 'lucide-react';
import NavBar from '../components/NavBar';
import { db, functions } from '../firebase';

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

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function Metrics() {
  const [metrics, setMetrics] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Add metric form state
  const [metricName, setMetricName] = useState('');
  const [metricDesc, setMetricDesc] = useState('');
  const [researching, setResearching] = useState(null); // metricId being researched
  const [researchError, setResearchError] = useState(null);
  const [researchProgress, setResearchProgress] = useState(null);

  // Subscribe to metrics collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'metrics'), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setMetrics(data);
      setLoadingMetrics(false);
    });
    return unsub;
  }, []);

  // Subscribe to non-archived schools
  useEffect(() => {
    const q = query(collection(db, 'schools'), where('archived', '!=', true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.rank || 99) - (b.rank || 99));
      setSchools(data);
    });
  }, []);

  const handleAddAndResearch = async () => {
    const name = metricName.trim();
    if (!name) return;

    const metricId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setResearching(metricId);
    setResearchError(null);
    setResearchProgress(`Researching "${name}" for ${schools.length} schools…`);

    try {
      const fn = httpsCallable(functions, 'generateMetric', { timeout: 310000 });
      const result = await fn({ metricId, metricName: name, metricDescription: metricDesc.trim() });
      setResearchProgress(null);
      setMetricName('');
      setMetricDesc('');
      if (result.data?.results) {
        const count = result.data.results.filter((r) => r.value && r.value !== 'Error').length;
        setResearchProgress(`Done — found values for ${count} of ${result.data.results.length} schools`);
        setTimeout(() => setResearchProgress(null), 5000);
      }
    } catch (err) {
      setResearchError(err.message || 'Research failed. Check function logs.');
      setResearchProgress(null);
    } finally {
      setResearching(null);
    }
  };

  const handleReresearch = async (metric) => {
    setResearching(metric.id);
    setResearchError(null);
    setResearchProgress(`Re-researching "${metric.name}" for ${schools.length} schools…`);

    try {
      const fn = httpsCallable(functions, 'generateMetric', { timeout: 310000 });
      await fn({ metricId: metric.id, metricName: metric.name, metricDescription: metric.description || '' });
      setResearchProgress(null);
      setTimeout(() => setResearchProgress(null), 5000);
    } catch (err) {
      setResearchError(err.message || 'Re-research failed.');
      setResearchProgress(null);
    } finally {
      setResearching(null);
    }
  };

  const handleDelete = async (metric) => {
    if (!window.confirm(`Delete metric "${metric.name}" and remove it from all schools?`)) return;

    // Delete from metrics collection
    await deleteDoc(doc(db, 'metrics', metric.id));

    // Remove from all school customMetrics
    const batch = writeBatch(db);
    schools.forEach((school) => {
      if (school.customMetrics?.[metric.id] !== undefined) {
        const ref = doc(db, 'schools', school.id);
        // Use FieldValue.delete() — but we're client-side so use deleteField()
        // We'll just set to null and handle on display
        batch.update(ref, { [`customMetrics.${metric.id}`]: null });
      }
    });
    await batch.commit();
  };

  const isResearching = (id) => researching === id;

  return (
    <>
      <NavBar />
      <main style={{ padding: '2.5rem 1.5rem 5rem', maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '2rem',
            color: '#f5f0e8',
            margin: '0 0 0.2rem',
          }}>
            Custom Metrics
          </h1>
          <p style={{
            color: 'rgba(245,240,232,0.35)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.88rem',
            margin: 0,
          }}>
            Add a metric and Claude will research it for every school on the list.
          </p>
        </div>

        {/* Add metric form */}
        <div style={{
          background: '#1A1A1A',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', fontWeight: 700, color: 'rgba(245,240,232,0.4)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '1rem' }}>
            New Metric
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <input
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              placeholder="Metric name (e.g., On-campus housing guarantee, Student to nurse ratio…)"
              style={INPUT_STYLE}
              onKeyDown={(e) => { if (e.key === 'Enter' && metricName.trim()) handleAddAndResearch(); }}
            />
            <textarea
              value={metricDesc}
              onChange={(e) => setMetricDesc(e.target.value)}
              placeholder="Description (optional) — helps Claude know exactly what to look for"
              rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '60px' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleAddAndResearch}
                disabled={!metricName.trim() || !!researching}
                style={{
                  background: '#E8976B',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.5rem 1.1rem',
                  color: '#111111',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: (!metricName.trim() || !!researching) ? 'default' : 'pointer',
                  opacity: (!metricName.trim() || !!researching) ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  transition: 'opacity 0.15s',
                }}
              >
                {researching ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={14} />}
                {researching ? 'Researching…' : 'Add & Research All Schools'}
              </button>
              {researchProgress && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.5)' }}>
                  {researchProgress}
                </span>
              )}
              {researchError && (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: '#eb5757' }}>
                  {researchError}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metrics list */}
        {loadingMetrics && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <div className="spinner" />
          </div>
        )}

        {!loadingMetrics && metrics.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'rgba(245,240,232,0.3)', fontFamily: "'DM Sans', sans-serif" }}>
            <Plus size={32} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
            <p style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>No custom metrics yet.</p>
            <p style={{ fontSize: '0.85rem' }}>Add one above — Claude will research it for all your schools.</p>
          </div>
        )}

        {!loadingMetrics && metrics.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {metrics.map((metric) => (
              <div key={metric.id} style={{
                background: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                {/* Metric header */}
                <div style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: '#f5f0e8', marginBottom: '0.15rem' }}>
                      {metric.name}
                    </div>
                    {metric.description && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(245,240,232,0.4)', lineHeight: 1.4 }}>
                        {metric.description}
                      </div>
                    )}
                    {metric.lastResearchedAt && (
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.7rem', color: 'rgba(245,240,232,0.25)', marginTop: '0.2rem' }}>
                        Last researched {formatDate(metric.lastResearchedAt)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleReresearch(metric)}
                      disabled={!!researching}
                      title="Re-research for all schools"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem',
                        color: 'rgba(245,240,232,0.6)',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '0.78rem',
                        cursor: researching ? 'default' : 'pointer',
                        opacity: researching ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!researching) e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    >
                      {isResearching(metric.id)
                        ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        : <RefreshCw size={12} />
                      }
                      {isResearching(metric.id) ? 'Researching…' : 'Re-research'}
                    </button>
                    <button
                      onClick={() => handleDelete(metric)}
                      title="Delete metric"
                      style={{
                        background: 'none',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem',
                        color: 'rgba(245,240,232,0.25)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#eb5757')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.25)')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* School values */}
                {schools.length > 0 && (
                  <div>
                    {schools.map((school, idx) => {
                      const data = school.customMetrics?.[metric.id];
                      return (
                        <div
                          key={school.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.75rem 1.25rem',
                            borderBottom: idx < schools.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}
                        >
                          {/* Color dot */}
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: school.primaryColor || 'rgba(245,240,232,0.2)',
                            flexShrink: 0,
                          }} />

                          {/* School name */}
                          <div style={{ width: '180px', flexShrink: 0 }}>
                            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {school.name}
                            </div>
                          </div>

                          {/* Value */}
                          <div style={{ flex: 1 }}>
                            {data ? (
                              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.85rem', color: data.value === 'Not available' || data.value === 'Error' ? 'rgba(245,240,232,0.28)' : '#f5f0e8' }}>
                                {data.value}
                              </div>
                            ) : (
                              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.82rem', color: 'rgba(245,240,232,0.2)', fontStyle: 'italic' }}>
                                Not researched
                              </div>
                            )}
                          </div>

                          {/* Source */}
                          {data?.source && data.source !== 'Not found' && (
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.7rem', color: 'rgba(245,240,232,0.28)' }}>
                                {data.asOf && <span>{data.asOf} · </span>}
                                {data.sourceUrl
                                  ? <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#E8976B', textDecoration: 'none' }}>{data.source}</a>
                                  : data.source
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
