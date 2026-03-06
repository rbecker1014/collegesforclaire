import { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NavBar() {
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinkStyle = ({ isActive }) => ({
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.9rem',
    color: isActive ? '#E8976B' : 'rgba(245,240,232,0.65)',
    textDecoration: 'none',
    padding: '0.25rem 0',
    borderBottom: isActive ? '1px solid #E8976B' : '1px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  });

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#111111',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 1.5rem',
    }}>
      {/* Left: wordmark */}
      <div style={{ flex: '0 0 auto' }}>
        <Link to="/" style={{
          fontFamily: "'Libre Baskerville', serif",
          fontSize: '1.05rem',
          color: '#f5f0e8',
          textDecoration: 'none',
        }}>
          Claire's Colleges
        </Link>
      </div>

      {/* Center: nav links */}
      <div style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        gap: '2rem',
      }}>
        <NavLink to="/" end style={navLinkStyle}
          onMouseEnter={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = '#f5f0e8'; }}
          onMouseLeave={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = 'rgba(245,240,232,0.65)'; }}
        >
          Home
        </NavLink>
        <NavLink to="/archive" style={navLinkStyle}
          onMouseEnter={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = '#f5f0e8'; }}
          onMouseLeave={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = 'rgba(245,240,232,0.65)'; }}
        >
          Archive
        </NavLink>
        <NavLink to="/metrics" style={navLinkStyle}
          onMouseEnter={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = '#f5f0e8'; }}
          onMouseLeave={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = 'rgba(245,240,232,0.65)'; }}
        >
          Metrics
        </NavLink>
        <NavLink to="/admin/prompts" style={navLinkStyle}
          onMouseEnter={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = '#f5f0e8'; }}
          onMouseLeave={e => { if (!e.currentTarget.style.borderBottomColor.includes('E8976B')) e.currentTarget.style.color = 'rgba(245,240,232,0.65)'; }}
        >
          Prompts
        </NavLink>
      </div>

      {/* Right: user avatar + dropdown */}
      <div style={{ flex: '0 0 auto', position: 'relative' }} ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid rgba(255,255,255,0.12)',
              }}
            />
          ) : (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#E8976B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}>
              {user?.displayName?.[0] ?? 'U'}
            </div>
          )}
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '1rem',
            minWidth: '220px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <p style={{
              margin: '0 0 0.2rem',
              color: '#f5f0e8',
              fontWeight: 600,
              fontSize: '0.9rem',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {user?.displayName}
            </p>
            <p style={{
              margin: '0 0 1rem',
              color: 'rgba(245,240,232,0.45)',
              fontSize: '0.8rem',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {user?.email}
            </p>
            <button
              onClick={() => { setDropdownOpen(false); signOut(); }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: 'rgba(245,240,232,0.8)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
