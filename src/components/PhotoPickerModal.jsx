import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function PhotoPickerModal({ schoolId, candidates, onClose, onSaved }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (idx) => {
    if (selected.includes(idx)) {
      setSelected(selected.filter((i) => i !== idx));
    } else if (selected.length < 3) {
      setSelected([...selected, idx]);
    }
  };

  const handleSave = async () => {
    if (selected.length !== 3) return;
    setSaving(true);
    try {
      const gallery = selected.map((idx) => ({ ...candidates[idx], selected: true }));
      await updateDoc(doc(db, 'schools', schoolId), { 'images.gallery': gallery });
      onSaved(gallery);
      onClose();
    } catch (err) {
      console.error('Failed to save gallery:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{
        background: '#1A1A1A', borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        maxWidth: '720px', width: '100%',
        maxHeight: '90vh', overflow: 'auto',
        padding: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 700, color: '#f5f0e8' }}>
              Select 3 photos for the gallery
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(245,240,232,0.4)', marginTop: '0.2rem' }}>
              {selected.length} of 3 selected
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: 'rgba(245,240,232,0.5)', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 2×3 grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}>
          {candidates.map((photo, idx) => {
            const isSelected = selected.includes(idx);
            const isDisabled = !isSelected && selected.length >= 3;
            return (
              <div
                key={idx}
                onClick={() => !isDisabled && toggle(idx)}
                style={{
                  cursor: isDisabled ? 'default' : 'pointer',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: isSelected ? '2px solid #6fcf97' : '2px solid rgba(255,255,255,0.08)',
                  opacity: isDisabled ? 0.45 : 1,
                  transition: 'border-color 0.15s, opacity 0.15s',
                }}
              >
                <div style={{ position: 'relative', height: '160px' }}>
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {isSelected && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(111,207,151,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{
                        background: '#6fcf97', borderRadius: '50%',
                        width: '30px', height: '30px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={16} color="#000" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: '0.45rem 0.6rem', background: '#222' }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.72rem', color: 'rgba(245,240,232,0.8)', lineHeight: 1.35, marginBottom: '0.15rem' }}>
                    {photo.caption}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '0.62rem', color: 'rgba(245,240,232,0.35)' }}>
                    {photo.source}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)', color: 'rgba(245,240,232,0.6)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              padding: '0.5rem 1.25rem', fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={selected.length !== 3 || saving}
            style={{
              background: selected.length === 3 ? '#6fcf97' : 'rgba(111,207,151,0.15)',
              color: selected.length === 3 ? '#000' : 'rgba(111,207,151,0.35)',
              border: 'none', borderRadius: '6px',
              padding: '0.5rem 1.25rem', fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.875rem', fontWeight: 600,
              cursor: selected.length === 3 && !saving ? 'pointer' : 'default',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Save Gallery'}
          </button>
        </div>
      </div>
    </div>
  );
}
