// CLI entry points never emit driver/SMTP error messages or stack traces containing URLs.
export class OperationalError extends Error {}

export async function runOperation(name, operation) {
  try { await operation() }
  catch (error) {
    console.error(JSON.stringify({ event: 'operation_failed', operation: name,
      message: error instanceof OperationalError ? error.message : 'Operation failed. Check configuration, service availability and permissions.' }))
    process.exitCode = 1
  }
}
