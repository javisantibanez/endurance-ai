import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    )
  }

  return createBrowserClient(
    supabaseUrl,
    publishableKey
  )
}
