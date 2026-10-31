import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// NEXT_PUBLIC_* lets the app use the public keys added by the Vercel ⇄ Supabase integration.
export default defineConfig({ plugins: [react()], envPrefix: ['VITE_', 'NEXT_PUBLIC_'] })
