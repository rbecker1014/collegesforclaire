import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, onSnapshot, query, where,
  doc, updateDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { RotateCcw, ExternalLink } from 'lucide-react';
import NavBar from '../components/NavBar';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function Archive() {
  const { user } = useAuth();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'schools'), where('archived', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSchools(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleRestore = async (school) => {
    setRestoring(school.id);
    try {
      await updateDoc(doc(db, 'schools', school.id), {
        archived: deleteField(),
        archiveReason: deleteField(),
        archivedBy: deleteField(),
        archivedAt: deleteField(),
        'lastEdit.by': user?.displayName ?? 'Unknown',
        'lastEdit.email': user?.email ?? '',
        'lastEdit.at': serverTimestamp(),
        'lastEdit.field': 'archived',
      });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <NavBar />
      <main style={{ padding: '2.5rem 1.5rem 5rem', maxWidth: '820px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '2rem',
            color: '#f5f0e8',
            margin: '0 0 0.2rem',
          }}>
            Archived Schools
          </h1>
          <p style={{
            color: 'rgba(245,240,232,0.35)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.88rem',
            margin: 0,
          }}>
            {loading ? '' : `${schools.length} school${schools.length !== 1 ? 's' : ''} archived`}
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div className="spinner" />
          </div>
        )}

        {/* Empty state */}
        {!loading && schools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '5rem 2rem',
            color: 'rgba(245,240,232,0.3)',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No archived schools.</p>
            <p style={{ fontSize: '0.85rem' }}>
              Schools you archive from a school profile page will appear here.
            </p>
          </div>
        )}

        {/* School list */}
        {!loading && schools.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {schools.map((school) => (
              <div
                key={school.id}
                style={{
                  background: '#1A1A1A',
                  borderRadius: '10px',
                  borderLeft: `4px solid ${school.primaryColor || 'rgba(245,240,232,0.15)'}`,
                  padding: '1rem 1rem 1rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <span style={{
                      fontFamily: "'Libre Baskerville', serif",
                      fontSize: '1rem',
                      color: '#f5f0e8',
                      fontWeight: 700,
                    }}>
                      {school.name}
                    </span>
                    {school.nickname && (
                      <span style={{ fontSize: '0.82rem', color: 'rgba(245,240,232,0.38)', fontFamily: "'DM Sans', sans-serif" }}>
                        ({school.nickname})
                      </span>
                    )}
                  </div>

                  {school.archiveReason && (
                    <p style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.82rem',
                      color: 'rgba(245,240,232,0.5)',
                      margin: '0 0 0.3rem',
                      lineHeight: 1.4,
                    }}>
                      "{school.archiveReason}"
                    </p>
                  )}

                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.28)' }}>
                    {school.archivedBy && <span>Archived by {school.archivedBy}</span>}
                    {school.archivedAt && <span> · {formatDate(school.archivedAt)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <Link
                    to={`/school/${school.id}`}
                    title="View profile"
                    style={{
                      color: 'rgba(245,240,232,0.25)',
                      display: 'flex', alignItems: 'center',
                      padding: '0.35rem',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#E8976B')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.25)')}
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    onClick={() => handleRestore(school)}
                    disabled={restoring === school.id}
                    title="Restore to active list"
                    style={{
                      background: 'rgba(111,207,151,0.1)',
                      border: '1px solid rgba(111,207,151,0.2)',
                      borderRadius: '6px',
                      padding: '0.4rem 0.85rem',
                      color: '#6fcf97',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: restoring === school.id ? 'default' : 'pointer',
                      opacity: restoring === school.id ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      transition: 'opacity 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (restoring !== school.id) e.currentTarget.style.background = 'rgba(111,207,151,0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(111,207,151,0.1)'; }}
                  >
                    <RotateCcw size={12} />
                    {restoring === school.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
