export default function PortalLoading() {
  return (
    <main className="section hero portal-surface">
      <div className="shell">
        <section className="loading-panel loading-panel-portal">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-copy">
            <span className="eyebrow">Portal</span>
            <h1 className="section-heading">Working on it</h1>
            <p className="microcopy">
              Securing the request, syncing data, and loading the latest portal state.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
