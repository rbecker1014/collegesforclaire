import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useSchool(schoolId) {
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, 'schools', schoolId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setSchool(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [schoolId]);

  return { school, loading, error };
}
