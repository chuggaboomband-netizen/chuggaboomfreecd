export default function GlobalLoading() {
  return (
    <main className="section hero portal-surface">
      <div className="shell">
        <section className="loading-panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-copy">
            <h1 className="section-heading">Please hold on, I&apos;m loading</h1>
          </div>
        </section>
      </div>
    </main>
  );
}
