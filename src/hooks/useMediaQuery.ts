import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean | undefined {
    const [matches, setMatches] = useState<boolean | undefined>(() => {
        if (typeof window === 'undefined') return undefined;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const media = window.matchMedia(query);

        const listener = (e: MediaQueryListEvent) => {
            setMatches(e.matches);
        };

        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [query]);

    return matches;
}
