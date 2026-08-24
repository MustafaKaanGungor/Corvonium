import { useEffect, useState } from 'react';

export function useNow(intervalMS = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMS);
    return () => clearInterval(id);
  }, [intervalMS]);

  return now;
}
