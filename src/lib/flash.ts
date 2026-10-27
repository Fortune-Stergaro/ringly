import { redirect } from 'next/navigation';

/** Redirect back to `path` with an ?error= message (must not be called inside try/catch). */
export function fail(path: string, message: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = '/app'): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : fallback;
}
