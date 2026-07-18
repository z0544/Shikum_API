import { useEffect, useState } from 'react';

/** מחזיר האם שאילתת מדיה נתונה מתקיימת, ומתעדכן בזמן אמת בשינוי גודל החלון. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
