import { useEffect, useState } from 'react';
import { getOnlineState, initOnline, subscribeOnline } from './service.js';

let booted = false;

export function useOnlineState() {
  const [state, setState] = useState(getOnlineState());
  useEffect(() => {
    const off = subscribeOnline(setState);
    if (!booted) { booted = true; initOnline(); }
    return off;
  }, []);
  return state;
}
