import { useState, useEffect } from 'react';

export function useHashRouter() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (newRoute) => {
    window.location.hash = newRoute;
  };

  return { route, navigate };
}

