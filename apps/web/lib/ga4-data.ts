// Moved to @labprice/shared/src/ga4 so the worker's Monday traffic digest can use the same client —
// apps/worker cannot import from apps/web, and a second copy would drift (the two shouldAutoApprove
// implementations are the cautionary tale). Deep import, NOT the shared index barrel: this pulls in
// a Node-only Google SDK that must never reach a client bundle.
export { GA4_CONFIGURED, fetchGa4Summary, type Ga4Summary } from '@labprice/shared/src/ga4';
