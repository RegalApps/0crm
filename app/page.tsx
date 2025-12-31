export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Vapi Cron Calls</h1>
      <p>This app triggers daily check-in calls via Vapi at:</p>
      <ul>
        <li><strong>6am ET</strong> – Quick, concise 3 goals check-in</li>
        <li><strong>12pm ET</strong> – Update on how we're doing on those 3 goals</li>
        <li><strong>8pm ET</strong> – Weekly tracking: ICP calls, investor intros, feature dev</li>
      </ul>
      <p>
        API endpoint: <code>/api/vapi-call?slot=morning|noon|evening</code>
      </p>
    </main>
  );
}


