import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

// NOTE: Make sure claire.beckerz.com is added to Firebase Console →
// Authentication → Settings → Authorized domains (colleges-for-claire.web.app
// should already be there).

const AuthContext = createContext(null);

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // On mobile, after Google redirects back to the app, pick up the result.
  useEffect(() => {
    if (!isMobile) return;
    getRedirectResult(auth).catch((err) => {
      // Ignore expected "no redirect" case; log real errors.
      if (err.code !== 'auth/no-auth-event') {
        console.error('getRedirectResult error:', err);
      }
    });
  }, []);

  const signInWithGoogle = () =>
    isMobile
      ? signInWithRedirect(auth, googleProvider)
      : signInWithPopup(auth, googleProvider);

  const signOut = () => firebaseSignOut(auth);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#111111',
      }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
