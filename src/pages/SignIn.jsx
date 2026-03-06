import { useAuth } from '../contexts/AuthContext';

export default function SignIn() {
  const { signInWithGoogle } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111111',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#1A1A1A',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '3rem 2.5rem',
        width: '100%',
        maxWidth: '420px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: "'Libre Baskerville', serif",
          fontSize: '1.75rem',
          color: '#f5f0e8',
          margin: '0 0 0.75rem',
          lineHeight: 1.3,
        }}>
          Claire's College Research
        </h1>

        <p style={{
          color: 'rgba(245,240,232,0.5)',
          fontSize: '0.95rem',
          margin: '0 0 2.5rem',
          lineHeight: 1.5,
        }}>
          Track, compare, and rank nursing programs
        </p>

        <button
          onClick={signInWithGoogle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.75rem 1.25rem',
            background: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            color: '#1a1a1a',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.92'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <GoogleLogo />
          Sign in with Google
        </button>

        <p style={{
          marginTop: '1.75rem',
          color: 'rgba(245,240,232,0.35)',
          fontSize: '0.8rem',
        }}>
          Sign in with your Google account to get started
        </p>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
