export const metadata = { title: 'Privacy' };
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-3 px-4 py-10">
      <h1 className="text-2xl font-bold">Privacy (draft)</h1>
      <p>We store your email, display name, time zone, group memberships, acknowledgements and the push endpoints of devices you register. We don’t read messages from other apps and we don’t sell data.</p>
      <p>Group admins can see members’ display names, roles and acknowledgement status for their group’s events. They cannot see your devices or other groups.</p>
      <p>You can remove registered devices in Settings at any time. Replace this draft with reviewed legal text before launch.</p>
    </main>
  );
}
