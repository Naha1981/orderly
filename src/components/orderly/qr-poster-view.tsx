'use client'

import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/orderly/ui'
import { QrCode, Download, Printer, MessageCircle } from 'lucide-react'
import { useAuth } from '@/lib/use-user'

export function QrPosterView() {
  const { user } = useAuth()
  const posterUrl = '/api/v1/qr-poster'
  const waLink = user?.tenant?.whatsappPhone
    ? `https://wa.me/${user.tenant.whatsappPhone}?text=JOIN`
    : 'https://wa.me/27000000000?text=JOIN'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">QR Poster</h1>
        <p className="text-sm text-muted-foreground">Print this for your counter and tables. Customers scan → WhatsApp opens → they text JOIN.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Preview */}
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterUrl} alt="QR Poster" className="w-full h-auto" />
            </div>
            <div className="mt-4 flex gap-2">
              <a
                href={posterUrl}
                download={`${user?.tenant?.name ?? 'orderly'}-qr-poster.svg`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 h-10 text-sm font-medium hover:bg-accent"
              >
                <Download className="h-4 w-4" /> Download SVG
              </a>
              <a
                href={posterUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 h-10 text-sm font-medium hover:bg-accent"
              >
                <Printer className="h-4 w-4" /> Open for printing
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>How it works</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Step n={1} text="Print the poster and place it on your counter, tables, and entrance." />
              <Step n={2} text="Customers scan with their phone camera — WhatsApp opens pre-filled with JOIN." />
              <Step n={3} text="They send the message — instant enrolment with welcome points." />
              <Step n={4} text="They text BALANCE / REDEEM / STOP anytime — fully WhatsApp-native." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Direct link</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">Share this link on Instagram, Facebook, TikTok, Google Business, or anywhere:</p>
              <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">{waLink}</div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => { navigator.clipboard.writeText(waLink); }}
              >
                Copy link
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tip</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The QR encodes a <code className="bg-muted px-1 rounded">wa.me</code> link — works on iPhone and Android without any app install.
                No app, no account, no friction.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
        {n}
      </div>
      <p>{text}</p>
    </div>
  )
}
