import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronRight, Check, X } from 'lucide-react';
import NavBar from '../components/NavBar';
import AddSchoolModal from '../components/AddSchoolModal';
import { useSchools, updateRanks } from '../hooks/useSchools';
import { db } from '../firebase';
import { seedDatabase } from '../data/seedFirestore';

// ─── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableSchoolCard({ school, activeId }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: school.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SchoolCard
        school={school}
        dragHandleProps={{ ...attributes, ...listeners }}
        isBeingDragged={isDragging}
        isDimmed={activeId !== null && !isDragging}
      />
    </div>
  );
}

// ─── School card ───────────────────────────────────────────────────────────────

function SchoolCard({ school, dragHandleProps, isBeingDragged, isDimmed }) {
  const [hovered, setHovered] = useState(false);

  const val = (field) => field?.value ?? '—';

  const pills = [
    { label: 'OOS Tuition', value: val(school.overview?.tuitionOutState) },
    { label: 'NCLEX Pass', value: val(school.nursing?.nclexPassRate) },
    { label: 'Enrollment', value: val(school.overview?.enrollment) },
    { label: 'Conference', value: val(school.overview?.conference) },
  ];

  const criteria = [
    { key: 'directAdmit', label: 'Direct Admit', meets: school.claireFit?.directAdmit?.meets },
    { key: 'bigSchoolSports', label: 'Big School/Sports', meets: school.claireFit?.bigSchoolSports?.meets },
    { key: 'collegeTownVibe', label: 'College Town', meets: school.claireFit?.collegeTownVibe?.meets },
  ];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#1A1A1A',
        borderRadius: '10px',
        borderLeft: `4px solid ${school.primaryColor || '#E8976B'}`,
        padding: '1rem 1rem 1rem 0.75rem',
        gap: '0.75rem',
        opacity: isDimmed ? 0.45 : 1,
        boxShadow: isBeingDragged
          ? '0 16px 48px rgba(0,0,0,0.7)'
          : hovered
          ? '0 4px 20px rgba(0,0,0,0.4)'
          : 'none',
        transform: isBeingDragged ? 'scale(1.01)' : hovered ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow 0.2s, transform 0.2s, opacity 0.15s',
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        style={{
          cursor: isBeingDragged ? 'grabbing' : 'grab',
          color: hovered ? 'rgba(245,240,232,0.45)' : 'rgba(245,240,232,0.15)',
          padding: '0.25rem',
          transition: 'color 0.2s',
          flexShrink: 0,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <GripVertical size={18} />
      </div>

      {/* Rank */}
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        color: 'rgba(245,240,232,0.18)',
        minWidth: '2rem',
        textAlign: 'center',
        flexShrink: 0,
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1,
      }}>
        {school.rank}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name + nickname */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: '1rem',
            color: '#f5f0e8',
            fontWeight: 700,
          }}>
            {school.name}
          </span>
          {school.nickname && (
            <span style={{
              fontSize: '0.82rem',
              color: 'rgba(245,240,232,0.38)',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              ({school.nickname})
            </span>
          )}
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
          {pills.map((pill) => (
            <span key={pill.label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '4px',
              padding: '0.15rem 0.5rem',
              fontSize: '0.73rem',
              fontFamily: "'DM Sans', sans-serif",
              color: 'rgba(245,240,232,0.7)',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: 'rgba(245,240,232,0.35)', marginRight: '0.25rem' }}>
                {pill.label}:
              </span>
              {pill.value}
            </span>
          ))}
        </div>

        {/* Claire's criteria */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {criteria.map((c) => (
            <div key={c.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.73rem',
              fontFamily: "'DM Sans', sans-serif",
              color: c.meets ? '#6fcf97' : '#eb5757',
            }}>
              {c.meets
                ? <Check size={11} strokeWidth={3} />
                : <X size={11} strokeWidth={3} />
              }
              {c.label}
            </div>
          ))}
        </div>
      </div>

      {/* Arrow link */}
      <Link
        to={`/school/${school.id}`}
        style={{
          color: 'rgba(245,240,232,0.25)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'color 0.15s',
          padding: '0.25rem',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#E8976B')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.25)')}
      >
        <ChevronRight size={20} />
      </Link>
    </div>
  );
}

// ─── Landing page ──────────────────────────────────────────────────────────────

export default function Landing() {
  const { schools, loading, error } = useSchools();
  const [activeId, setActiveId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart({ active }) {
    setActiveId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = schools.findIndex((s) => s.id === active.id);
    const newIndex = schools.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(schools, oldIndex, newIndex);
    updateRanks(reordered);
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDatabase(db);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <NavBar />
      <main style={{
        padding: '2.5rem 1.5rem 5rem',
        maxWidth: '820px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '2rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: '2rem',
              color: '#f5f0e8',
              margin: '0 0 0.35rem',
            }}>
              Claire's College List
            </h1>
            <p style={{
              color: 'rgba(245,240,232,0.35)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.88rem',
              margin: 0,
            }}>
              {loading ? '' : `${schools.length} school${schools.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#E8976B',
                border: 'none',
                borderRadius: '7px',
                color: '#111111',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Add School
            </button>
            <Link
              to="/archive"
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '7px',
                color: 'rgba(245,240,232,0.7)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              View Archived
            </Link>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div className="spinner" />
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{
            color: '#eb5757',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '0.9rem',
          }}>
            Error loading schools: {error.message}
          </p>
        )}

        {/* Empty state */}
        {!loading && !error && schools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '5rem 2rem',
            color: 'rgba(245,240,232,0.3)',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <p style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>No schools yet.</p>
            <p style={{ fontSize: '0.85rem' }}>
              Use the Seed Data button below to load the initial list.
            </p>
          </div>
        )}

        {/* Sortable list */}
        {!loading && schools.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={schools.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {schools.map((school) => (
                  <SortableSchoolCard
                    key={school.id}
                    school={school}
                    activeId={activeId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Seed data button */}
        <div style={{ textAlign: 'center', marginTop: '3.5rem' }}>
          <button
            onClick={handleSeed}
            disabled={seeding}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(245,240,232,0.18)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.78rem',
              cursor: seeding ? 'default' : 'pointer',
              padding: '0.5rem 1rem',
              transition: 'color 0.2s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => { if (!seeding) e.currentTarget.style.color = 'rgba(245,240,232,0.45)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(245,240,232,0.18)'; }}
          >
            {seeding ? 'Seeding…' : 'Seed Data'}
          </button>
        </div>
      </main>
      {showAddModal && (
        <AddSchoolModal onClose={() => setShowAddModal(false)} />
      )}
    </>
  );
}
