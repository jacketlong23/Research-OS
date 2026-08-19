import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { isForbiddenFrontendSupabaseKey } from './src/cloud/keySafety'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (key && isForbiddenFrontendSupabaseKey(key)) {
    throw new Error(
      '安全检查失败：VITE_SUPABASE_PUBLISHABLE_KEY 不能使用 sb_secret_* / service_role。请改用 Supabase Publishable Key。',
    )
  }

  return {
    base: '/Research-OS/',
    plugins: [react(), tailwindcss()],
  }
})
