'use client'

import { useState, useEffect } from 'react'
import { apiPost } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, Spinner, Badge } from '@/components/orderly/ui'
import { Gift, MapPin, CheckCircle2, AlertCircle, Clock, QrCode } from 'lucide-react'

type ClaimResult =
  | { ok: true; confirmationQr: string; rewardName: string }
  | { ok: false; reason: 'expired' | 'not_found' | 'already_claimed' | 'out_of_range' | 'no_geo'; distanceM?: number }

export function GeoClaimFlow({ token }: { token: string }) {
  const [phase, setPhase] = useState<'locating' | 'verifying' | 'success' | 'failed' | 'expired' | 'not_found' | 'already_claimed' | 'out_of_range' | 'no_geo'>('locating')
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    attemptClaim()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function attemptClaim() {
    setPhase('locating')
    let location: { lat: number; lng: number } | null = null

    if ('geolocation' in navigator) {
      try {
        location = await new Promise<{ lat: number; lng: number } | null>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => resolve(null), // Don't reject — try claim without location
            { timeout: 10_000, maximumAge: 30_000 },
          )
        })
      } catch {
        location = null
      }
    }

    setPhase('verifying')
    try {
      const r = await apiPost<ClaimResult>('/api/v1/loyalty/claim', {
        claimToken: token,
        lat: location?.lat,
        lng: location?.lng,
      })
      setResult(r)
      if (r.ok) {
        setPhase('success')
      } else {
        setPhase(r.reason as any)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Claim failed')
      setPhase('failed')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Gift className="h-4 w-4" />
          </div>
          <span className="font-semibold">Orderly · Reward claim</span>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-md w-full p-4 py-12">
        {phase === 'locating' && (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="h-10 w-10 text-emerald-600 mx-auto animate-pulse" />
              <h1 className="mt-4 text-lg font-bold">Finding your location...</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Please allow location access so we can verify you're at the restaurant.
              </p>
              <Spinner className="mx-auto mt-4" />
            </CardContent>
          </Card>
        )}

        {phase === 'verifying' && (
          <Card>
            <CardContent className="p-8 text-center">
              <Spinner size="lg" className="mx-auto" />
              <h1 className="mt-4 text-lg font-bold">Verifying your reward...</h1>
              <p className="mt-1 text-sm text-muted-foreground">Checking location and reward status.</p>
            </CardContent>
          </Card>
        )}

        {phase === 'success' && result?.ok && (
          <Card className="border-emerald-200">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
              <h1 className="mt-4 text-2xl font-bold">Reward claimed!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Show this code to staff to collect your reward:
              </p>
              <div className="mt-6 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-8">
                <p className="text-xs text-emerald-700 uppercase tracking-wider">Confirmation code</p>
                <p className="text-4xl font-mono font-bold text-emerald-900 tracking-widest mt-2">
                  {result.confirmationQr}
                </p>
              </div>
              <p className="mt-6 text-sm font-medium">{result.rewardName}</p>
            </CardContent>
          </Card>
        )}

        {phase === 'out_of_range' && (
          <Card className="border-red-200">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">You're not at the restaurant</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Rewards can only be claimed while you're at the restaurant.
              </p>
              {result && !result.ok && result.distanceM != null && (
                <Badge variant="warning" className="mt-3">
                  You're ~{(result.distanceM / 1000).toFixed(1)} km away
                </Badge>
              )}
              <Button onClick={attemptClaim} variant="outline" className="mt-6">
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {phase === 'expired' && (
          <Card className="border-amber-200">
            <CardContent className="p-8 text-center">
              <Clock className="h-12 w-12 text-amber-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Claim link expired</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reward claim links are valid for 15 minutes. Text REDEEM again to get a fresh link.
              </p>
            </CardContent>
          </Card>
        )}

        {phase === 'already_claimed' && (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Already claimed</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This reward has already been claimed. Text REDEEM to claim a new one.
              </p>
            </CardContent>
          </Card>
        )}

        {phase === 'no_geo' && (
          <Card className="border-amber-200">
            <CardContent className="p-8 text-center">
              <MapPin className="h-12 w-12 text-amber-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Location required</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We couldn't access your location. Please allow location permission and try again.
              </p>
              <Button onClick={attemptClaim} className="mt-6">Try again</Button>
            </CardContent>
          </Card>
        )}

        {(phase === 'not_found' || phase === 'failed') && (
          <Card className="border-red-200">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h1 className="mt-4 text-xl font-bold">Claim failed</h1>
              <p className="mt-1 text-sm text-muted-foreground">{error || 'This claim link is invalid.'}</p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
        Orderly · GPS-gated reward redemption · POPIA compliant
      </footer>
    </div>
  )
}
