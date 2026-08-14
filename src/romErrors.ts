export function formatModelBuildFailure(failed: number, total: number, detail: unknown) {
  const message = detail == null || String(detail).length === 0 ? "unknown model build error" : String(detail);
  const summary = failed === total
    ? `all ${total} model files failed`
    : `${failed} of ${total} model files could not be built`;
  return `${summary}: ${message}`;
}
