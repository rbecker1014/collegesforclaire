import { useState, useEffect } from 'react';
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

// ─── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ─── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableSchoolCard({ school, activeId, isMobile }) {
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
        isMobile={isMobile}
      />
    </div>
  );
}

// ─── School card ───────────────────────────────────────────────────────────────

function SchoolCard({ school, dragHandleProps, isBeingDragged, isDimmed, isMobile }) {
  const [hovered, setHovered] = useState(false);

  const val = (field) => field?.value ?? '—';

  const allPills = [
    { label: 'OOS Tuition', value: val(school.overview?.tuitionOutState) },
    { label: 'NCLEX Pass', value: val(school.nursing?.nclexPassRate) },
    { label: 'Enrollment', value: val(school.overview?.enrollment) },
    { label: 'Conference', value: val(school.overview?.conference) },
  ];
  const pills = isMobile ? allPills.slice(0, 2) : allPills;

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
        borderLeft: `${isMobile ? 3 : 4}px solid ${school.primaryColor || '#E8976B'}`,
        padding: isMobile ? '6px 10px 6px 8px' : '1rem 1rem 1rem 0.75rem',
        gap: isMobile ? '0.4rem' : '0.75rem',
        opacity: isDimmed ? 0.45 : 1,
        boxShadow: isBeingDragged
          ? '0 16px 48px rgba(0,0,0,0.7)'
          : hovered ? '0 4px 20px rgba(0,0,0,0.4)' : 'none',
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
          padding: isMobile ? '0.1rem' : '0.25rem',
          transition: 'color 0.2s',
          flexShrink: 0,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <GripVertical size={isMobile ? 14 : 18} />
      </div>

      {/* Rank */}
      {isMobile ? (
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', fontWeight: 700,
          color: 'rgba(245,240,232,0.55)',
        }}>
          {school.rank}
        </div>
      ) : (
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
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.4rem',
          marginBottom: isMobile ? '3px' : '0.5rem',
        }}>
          <span style={{
            fontFamily: "'Libre Baskerville', serif",
            fontSize: isMobile ? '15px' : '1rem',
            color: '#f5f0e8',
            fontWeight: 700,
            overflow: isMobile ? 'hidden' : undefined,
            textOverflow: isMobile ? 'ellipsis' : undefined,
            whiteSpace: isMobile ? 'nowrap' : undefined,
          }}>
            {school.name}
          </span>
          {!isMobile && school.nickname && (
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
        <div style={{
          display: 'flex',
          gap: isMobile ? '0.3rem' : '0.4rem',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          marginBottom: isMobile ? '3px' : '0.55rem',
        }}>
          {pills.map((pill) => (
            <span key={pill.label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '4px',
              padding: isMobile ? '2px 6px' : '0.15rem 0.5rem',
              fontSize: isMobile ? '10px' : '0.73rem',
              fontFamily: "'DM Sans', sans-serif",
              color: 'rgba(245,240,232,0.7)',
              whiteSpace: 'nowrap',
            }}>
              {!isMobile && (
                <span style={{ color: 'rgba(245,240,232,0.35)', marginRight: '0.25rem' }}>
                  {pill.label}:
                </span>
              )}
              {pill.value}
            </span>
          ))}
        </div>

        {/* Claire's criteria */}
        <div style={{
          display: 'flex',
          gap: isMobile ? '5px' : '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {criteria.map((c) => (
            isMobile ? (
              <span
                key={c.key}
                title={c.label}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: c.meets ? '#6fcf97' : '#eb5757',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
            ) : (
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
            )
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
          padding: isMobile ? '0.15rem' : '0.25rem',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#E8976B')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,240,232,0.25)')}
      >
        <ChevronRight size={isMobile ? 16 : 20} />
      </Link>
    </div>
  );
}

// ─── Landing page ──────────────────────────────────────────────────────────────

export default function Landing() {
  const { schools, loading, error } = useSchools();
  const [activeId, setActiveId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const isMobile = useIsMobile();

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

  return (
    <>
      <NavBar />
      <main style={{
        padding: isMobile ? '1rem 0.75rem 5rem' : '2.5rem 1.5rem 5rem',
        maxWidth: '820px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: isMobile ? '1rem' : '2rem',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Libre Baskerville', serif",
              fontSize: isMobile ? '22px' : '2rem',
              color: '#f5f0e8',
              margin: '0 0 0.2rem',
            }}>
              Claire's College List
            </h1>
            <p style={{
              color: 'rgba(245,240,232,0.35)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: isMobile ? '12px' : '0.88rem',
              margin: 0,
            }}>
              {loading ? '' : `${schools.length} school${schools.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: isMobile ? '0.35rem 0.75rem' : '0.5rem 1rem',
                background: '#E8976B',
                border: 'none',
                borderRadius: '7px',
                color: '#111111',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: isMobile ? '0.8rem' : '0.875rem',
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
                padding: isMobile ? '0.35rem 0.75rem' : '0.5rem 1rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '7px',
                color: 'rgba(245,240,232,0.7)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: isMobile ? '0.8rem' : '0.875rem',
                textDecoration: 'none',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              Archived
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
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? '4px' : '0.75rem',
              }}>
                {schools.map((school) => (
                  <SortableSchoolCard
                    key={school.id}
                    school={school}
                    activeId={activeId}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

      </main>
      {showAddModal && (
        <AddSchoolModal onClose={() => setShowAddModal(false)} />
      )}
    </>
  );
}
