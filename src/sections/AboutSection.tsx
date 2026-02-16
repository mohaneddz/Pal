export function AboutSection() {
  return (
    <section className="pal-about-panel">
      <header className="pal-page-header">
        <h2>Voice Workflow</h2>
        <p>Pal is tuned for fast, spoken interaction.</p>
      </header>
      <div className="pal-about-list">
        <article className="pal-about-card">
          <h3>Talk first</h3>
          <p>Use the large microphone on Home for quick back-and-forth and keep typing as a fallback.</p>
        </article>
        <article className="pal-about-card">
          <h3>Choose your mode</h3>
          <p>Switch between persona modes to match the style and intensity you want in responses.</p>
        </article>
        <article className="pal-about-card">
          <h3>Use chat search</h3>
          <p>Filter history directly in the chat panel when you need to find a prior response quickly.</p>
        </article>
      </div>
    </section>
  );
}
