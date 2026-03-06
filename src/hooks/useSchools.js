import { useState, useEffect } from 'react';
import { collection, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

export function useSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'schools'),
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.archived !== true)
          .sort((a, b) => a.rank - b.rank);
        setSchools(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { schools, loading, error };
}

export async function updateRanks(schools) {
  const batch = writeBatch(db);
  schools.forEach((school, index) => {
    const ref = doc(db, 'schools', school.id);
    batch.update(ref, { rank: index + 1 });
  });
  return batch.commit();
}
