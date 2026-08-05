// Orderly — single-page app entry
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/lib/use-user'
import { Marketing } from '@/components/orderly/marketing'
import { AuthModal } from '@/components/orderly/auth-modal'
import { AppShell } from '@/components/orderly/app-shell'
import { SuperAdminShell } from '@/components/orderly/super-admin-shell'
import { ClaimFlow } from '@/components/orderly/claim-flow'
import { GeoClaimFlow } from '@/components/orderly/geo-claim-flow'
import { HubView } from '@/components/orderly/hub-view'
import { Spinner } from '@/components/orderly/ui'

function Router() {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [authModal, setAuthModal] = useState<null | 'login' | 'signup'>(null)

  const claimToken = searchParams.get('claim')
  const geoClaimToken = searchParams.get('geo-claim')
  const billingReturn = searchParams.get('billing')
  const hubSlug = searchParams.get('hub')
  const hubSrc = searchParams.get('src') ?? undefined

  // Public Restaurant Hub — rendered BEFORE auth check (it's a public page).
  // Format: /?hub=restaurant-slug (optionally &src=qr_poster)
  if (hubSlug) {
    return <HubView slug={hubSlug} src={hubSrc} />
  }

  // Public flows
  if (claimToken) {
    return <ClaimFlow token={claimToken} />
  }
  if (geoClaimToken) {
    return <GeoClaimFlow token={geoClaimToken} />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    )
  }

  // Not authenticated → marketing + auth modal
  if (!user) {
    return (
      <>
        <Marketing onAuth={(mode) => setAuthModal(mode)} />
        {authModal && (
          <AuthModal
            mode={authModal}
            onClose={() => setAuthModal(null)}
            onSwitch={(m) => setAuthModal(m)}
          />
        )}
      </>
    )
  }

  // Billing return cleanup
  if (billingReturn) {
    // Strip the query param; the billing view shows status
    router.replace('/?view=settings')
  }

  // Super admin
  if (user.role === 'super_admin') {
    return <SuperAdminShell />
  }

  // Owner / manager / staff
  return <AppShell />
}

export default function Home() {
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <Spinner size="lg" />
          </div>
        }
      >
        <Router />
      </Suspense>
    </AuthProvider>
  )
}
