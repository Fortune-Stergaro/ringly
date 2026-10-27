export function Banner({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        error
          ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          : 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100'
      }`}
    >
      {error ?? message}
    </div>
  );
}
