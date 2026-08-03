export function useApiBase(): string {
  const config = useRuntimeConfig()
  return String(config.public.apiBase)
}
