'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/use-user'
import { apiPost, apiPatch } from '@/lib/api'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Badge,
  StatusBadge,
  Spinner,
  EmptyState,
  formatZAR,
  formatRelativeTime,
} from '@/components/orderly/ui'
import {
  MessageCircle,
  LayoutDashboard,
  Users,
  Zap,
  BarChart3,
  Settings,
  QrCode,
  LogOut,
  Menu,
  X,
  Plus,
  Search,
  Phone,
  Star,
  Clock,
  TrendingUp,
  Gift,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Building2,
  Loader2,
  CalendarCheck,
} from 'lucide-react'
import { Dashboard } from '@/components/orderly/dashboard'
import { Customers } from '@/components/orderly/customers'
import { Campaigns } from '@/components/orderly/campaigns'
import { Insights } from '@/components/orderly/insights'
import { SettingsView } from '@/components/orderly/settings'
import { QrPosterView } from '@/components/orderly/qr-poster-view'
import { BookingsView } from '@/components/orderly/bookings-view'
import { ReviewsView } from '@/components/orderly/reviews-view'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type View = 'dashboard' | 'customers' | 'campaigns' | 'insights' | 'settings' | 'qr-poster' | 'bookings' | 'reviews'

export function AppShell() {
  const { user, logout } = useAuth()
  const [view, setView] = useState<View>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems: { id: View; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'campaigns', label: 'Campaigns', icon: Zap },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
    { id: 'qr-poster', label: 'QR Poster', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const brandingColor = user?.tenant?.brandingColor ?? '#16a34a'

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      {/* Top bar (mobile) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 h-14">
        <button onClick={() => setSidebarOpen(true)} className="rounded p-1 hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ background: brandingColor }}>
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className="font-semibold">{user?.tenant?.name ?? 'Orderly'}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed md:sticky top-0 md:top-0 z-40 md:z-auto h-screen md:h-screen w-64 shrink-0 border-r bg-background transition-transform',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ background: brandingColor }}>
                <MessageCircle className="h-4 w-4" />
              </div>
              <span className="font-semibold">Orderly</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Restaurant</p>
              <p className="text-sm font-medium truncate">{user?.tenant?.name ?? '—'}</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={user?.tenant?.whatsappStatus ?? 'disconnected'} />
                <StatusBadge status={user?.tenant?.planStatus ?? 'trial'} />
              </div>
            </div>
          </div>

          <nav className="px-3 pb-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id); setSidebarOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    view === item.id
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  style={view === item.id ? { background: `${brandingColor}1a`, color: brandingColor } : {}}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 border-t p-3">
            <div className="flex items-center gap-3 rounded-md p-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {user?.name?.[0] ?? user?.email?.[0] ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name ?? 'Owner'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={logout} title="Log out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl p-4 md:p-8">
            {view === 'dashboard' && <Dashboard onNavigate={setView} />}
            {view === 'bookings' && <BookingsView />}
            {view === 'reviews' && <ReviewsView />}
            {view === 'customers' && <Customers />}
            {view === 'campaigns' && <Campaigns />}
            {view === 'insights' && <Insights />}
            {view === 'settings' && <SettingsView />}
            {view === 'qr-poster' && <QrPosterView />}
          </div>
        </main>
      </div>

      {/* Footer (sticky) */}
      <footer className="mt-auto border-t bg-background py-3 text-center text-xs text-muted-foreground">
        Orderly · WhatsApp-native restaurant growth · {user?.tenant?.name}
      </footer>
    </div>
  )
}
