// Must report nothing. The three words below are the negative lookaheads: a
// ban that fired here would be reading `Precip`, `Min` and `Max` out of the
// full words. The classes are the slate surface family, which stays exempt.
export const Clean = () => (
  <section className="bg-slate-800 border border-slate-700 rounded-md">
    Precipitation Minimum Maximum Temperature Elevation
  </section>
)
