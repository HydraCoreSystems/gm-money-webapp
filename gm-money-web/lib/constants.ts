// Per the owner's explicit instruction: nothing before this date should
// be considered "current" activity. Originally 2026-07-19; moved forward
// to 2026-08-01 on 2026-08-08 for a second clean slate after a Tiller
// sync bug (date-drift duplicate transactions) muddied the history in
// between. This does NOT affect account balances (those are real
// point-in-time snapshots, unaffected by which transactions we choose to
// display).
//
// Single source of truth for the cutoff, imported by the Dashboard, the
// Register, Review, and the Tiller-sync receiving endpoint. In its own
// module (rather than living in lib/dashboard.ts) so those files can all
// share it without an import cycle -- lib/dashboard.ts imports from
// lib/register.ts, so having lib/register.ts import it back from
// lib/dashboard.ts would be circular. lib/dashboard.ts re-exports it for
// backward compatibility with anything importing it from there.
export const CUTOFF_DATE = "2026-08-01";