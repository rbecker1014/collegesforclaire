import { useState, useEffect } from 'react';

export function useSchoolSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query ? query.trim() : '';
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(q);
        const url =
          `https://api.data.gov/ed/collegescorecard/v1/schools.json` +
          `?school.name=${encoded}` +
          `&fields=id,school.name,school.city,school.state,school.school_url` +
          `&per_page=8&api_key=DEMO_KEY`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        setResults(
          (data.results || []).map((s) => ({
            id: s.id,
            name: s['school.name'],
            city: s['school.city'],
            state: s['school.state'],
            url: s['school.school_url'],
          }))
        );
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading, error };
}
