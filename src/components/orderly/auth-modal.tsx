'use client'

import { useState, useEffect } from 'react'
import { Button, Input, Label, Spinner } from '@/components/orderly/ui'
import { INDUSTRIES } from '@/shared/types'
import { useAuth } from '@/lib/use-user'
import { X, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'

export function AuthModal({
  mode,
  onClose,
  onSwitch,
}: {
  mode: 'login' | 'signup'
  onClose: () => void
  onSwitch: (m: 'login' | 'signup') => void
}) {
  const { login, signup } = useAuth()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Signup-only fields
  const [restaurantName, setRestaurantName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [industry, setIndustry] = useState('restaurant')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        toast.success('Logged in')
      } else {
        await signup({ ownerName, ownerEmail: email, password })
        toast.success('Account created! Set up your restaurant.')
      }
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <MessageCircle className="h-4 w-4" />
            </div>
            <span className="font-semibold">Orderly</span>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'login'
            ? 'Log in to your restaurant dashboard.'
            : 'Sign up — then set up your restaurant in 30 seconds.'}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === 'signup' && (
            <div>
              <Label htmlFor="ownerName">Your name</Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Thabiso N."
                required
                className="mt-1"
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.co.za"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="mt-1"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Spinner size="sm" /> : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              No account yet?{' '}
              <button onClick={() => onSwitch('signup')} className="font-medium text-emerald-700 hover:underline">
                Start a free trial
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => onSwitch('login')} className="font-medium text-emerald-700 hover:underline">
                Log in
              </button>
            </>
          )}
        </div>

        <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Demo accounts</p>
          <p className="mt-1">Owner: owner@braaihouse.demo / owner123</p>
          <p>Admin: admin@orderly.demo / admin123</p>
        </div>
      </div>
    </div>
  )
}
