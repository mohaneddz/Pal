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
        <article className="pal-about-card">
          <h3>Keyboard Guide</h3>
          <p>This build is Windows-only, so shortcuts use <strong>Ctrl</strong>.</p>
          <p>Use these shortcuts to run Pal without touching the mouse.</p>
          <ul className="pal-shortcuts-list">
            <li><kbd>Ctrl + Shift + B</kbd><span>Bring Pal to front and focus question box (desktop-global)</span></li>
            <li><kbd>Alt + 1..5</kbd><span>Jump to Home, History, Stats, Settings, About</span></li>
            <li><kbd>Ctrl + 1..5</kbd><span>Alternate page jump mapping</span></li>
            <li><kbd>Ctrl + Left/Right</kbd><span>Cycle pages</span></li>
            <li><kbd>Ctrl + /</kbd><span>Focus composer input</span></li>
            <li><kbd>Ctrl + Enter</kbd><span>Send message</span></li>
            <li><kbd>Ctrl + K</kbd><span>Focus search input</span></li>
            <li><kbd>Ctrl + B</kbd><span>Toggle left sidebar</span></li>
            <li><kbd>Ctrl + Shift + J</kbd><span>Toggle chat sidebar</span></li>
            <li><kbd>Ctrl + Shift + V</kbd><span>Start voice chat</span></li>
            <li><kbd>Ctrl + Shift + X</kbd><span>Stop voice chat</span></li>
            <li><kbd>Ctrl + Shift + N</kbd><span>Start new conversation</span></li>
            <li><kbd>Ctrl + Shift + R</kbd><span>Reuse last prompt</span></li>
            <li><kbd>Ctrl + Shift + A</kbd><span>Attach context file</span></li>
            <li><kbd>Ctrl + Shift + C</kbd><span>Copy last reply</span></li>
            <li><kbd>Ctrl + Shift + E</kbd><span>Export transcript</span></li>
            <li><kbd>Ctrl + .</kbd><span>Stop speech playback</span></li>
            <li><kbd>Esc</kbd><span>Close open menus</span></li>
            <li><kbd>Ctrl + Shift + M</kbd><span>Minimize window (to tray if enabled)</span></li>
            <li><kbd>F11</kbd><span>Toggle fullscreen</span></li>
          </ul>
        </article>
      </div>
    </section>
  );
}
