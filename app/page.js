export default function Home() {
  return (
    <main style={{ padding: '50px', fontFamily: 'sans-serif' }}>
      <h1>Google Reviews Widget Demo</h1>
      <p>The widget should appear in the bottom right corner.</p>
      <p>
        <strong>Note:</strong> You need to run the cron job first to populate the data.
        <br />
        <a href="/api/cron/fetch-reviews" target="_blank">Run Cron Job (Fetch Reviews)</a>
      </p>
      
      <p style={{ fontSize: '0.9em', color: '#666', marginTop: '20px' }}>
        <strong>Tip:</strong> By default, this demo loads the widget with ID <code>default-widget</code>. 
        If your data is stored under a different ID (e.g., <code>client_wilma</code>), 
        update the URL or script tag to include <code>?id=YOUR_ID</code>.
      </p>

      {/* Widget Script */}
      <script src="/widget.js" defer></script>
    </main>
  );
}
