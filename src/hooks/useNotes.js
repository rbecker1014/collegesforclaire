import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useNotes(schoolId) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'schools', schoolId, 'notes'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [schoolId]);

  return { notes, loading, error };
}

export async function addNote(schoolId, { text, category }, user) {
  await addDoc(collection(db, 'schools', schoolId, 'notes'), {
    text,
    category: category || 'general',
    authorName: user?.displayName || 'Unknown',
    authorEmail: user?.email || '',
    authorPhoto: user?.photoURL || '',
    createdAt: serverTimestamp(),
    editedAt: null,
  });
  await updateDoc(doc(db, 'schools', schoolId), {
    noteCount: increment(1),
  });
}

export async function editNote(schoolId, noteId, { text, category }) {
  await updateDoc(doc(db, 'schools', schoolId, 'notes', noteId), {
    text,
    category: category || 'general',
    editedAt: serverTimestamp(),
  });
}

export async function deleteNote(schoolId, noteId) {
  await deleteDoc(doc(db, 'schools', schoolId, 'notes', noteId));
  await updateDoc(doc(db, 'schools', schoolId), {
    noteCount: increment(-1),
  });
}
