import { doc, getDoc, setDoc } from 'firebase/firestore';
import { schools } from './seedSchools';

export async function seedDatabase(db) {
  for (const school of schools) {
    const ref = doc(db, 'schools', school.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      console.log(`[seed] Skipping "${school.name}" — already exists`);
    } else {
      await setDoc(ref, school);
      console.log(`[seed] Wrote "${school.name}"`);
    }
  }
  console.log('[seed] Done.');
}
