// Must report nothing. The three words below are the negative lookaheads: a
// ban that fired here would be reading `Precip`, `Min` and `Max` out of the
// full words. The classes are the theme's surface tokens, which a call site
// may name, as it could name the slate steps before #706.
export const Clean = () => (
  <section className="bg-panel border border-rule rounded-md text-ink-strong">
    Precipitation Minimum Maximum Temperature Elevation
  </section>
)
