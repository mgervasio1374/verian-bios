import { redirect } from 'next/navigation'

// Root → redirect to /dashboard (which resolves to user's workspace)
export default function RootPage() {
  redirect('/dashboard')
}
