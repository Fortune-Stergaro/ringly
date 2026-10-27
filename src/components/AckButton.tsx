'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

export function AckButton({ occurrenceId, acked }: { occurrenceId: string; acked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(acked);
  const [err, setErr] = useState('');

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-300">
        <Check size={16} aria-hidden /> Acknowledged
      </span>
    );
  }
  return (
    <div>
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await fetch(`/api/occurrences/${occurrenceId}/ack`, { method: 'POST' });
            if (res.ok) {
              setDone(true);
              router.refresh();
            } else setErr('Could not acknowledge. Try again.');
          })
        }
      >
        Acknowledge
      </button>
      {err && <p className="mt-1 text-sm text-red-700">{err}</p>}
    </div>
  );
}
