'use client';
import {useEffect, useState} from 'react';
import {readRankerArtifact, type RankerArtifact} from '@/lib/catboost-seed-ranker';

export function useSeedRanker() {
  const [model, setModel] = useState<RankerArtifact | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/station/ranking', {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])});
        if (!response.ok) return;
        const raw = await response.text();
        if (raw.length > 2_000_000) return;
        const data = JSON.parse(raw);
        if (!controller.signal.aborted && data.status === 'ready') setModel(readRankerArtifact(data.artifact));
      } catch { /* Recommendations never wait for the optional model. */ }
      finally { if (!controller.signal.aborted) setChecking(false); }
    })();
    return () => controller.abort();
  }, []);
  return {model, checking};
}
