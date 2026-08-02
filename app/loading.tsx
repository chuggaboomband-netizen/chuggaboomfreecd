export default function GlobalLoading() {
  return (
    <main className="section hero portal-surface">
      <div className="shell">
        <section className="loading-panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-copy">
            <span className="eyebrow">Loading</span>
            <h1 className="section-heading">Hang on, I&apos;m loading</h1>
            <p className="microcopy">
              Pulling together the latest page, reports, and settings.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
