// The only application module that accesses browser persistence.
// Adapters may return values or promises; repositories always expose async commands.
export const localStorageAdapter = {
  read(key) {
    const saved = globalThis.localStorage.getItem(key)
    return saved === null ? undefined : JSON.parse(saved)
  },
  write(key, value) {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  },
}
