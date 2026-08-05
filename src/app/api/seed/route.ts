// /api/seed — one-shot demo data seed (idempotent)
// Creates: 1 super admin, 1 demo owner + demo tenant (with customers, rewards,
// automation rules, sample loyalty transactions). For development & demo only.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/security/password'
import { INDUSTRIES } from '@/shared/types'
import { MVP_RULES } from '@/modules/automation/rules.seed'
import { serializeTrigger } from '@/modules/automation/engine'

export async function POST() {
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })
  const report: string[] = []

  try {
    // 1. Super admin
    const saEmail = 'admin@orderly.demo'
    let superAdmin = await db.user.findUnique({ where: { email: saEmail } })
    if (!superAdmin) {
      superAdmin = await db.user.create({
        data: {
          email: saEmail,
          name: 'Orderly Admin',
          passwordHash: hashPassword('admin123'),
          role: 'super_admin',
        },
      })
      report.push('created super_admin: admin@orderly.demo / admin123')
    } else {
      report.push('super_admin exists')
    }

    // 2. Demo tenant + owner
    const ownerEmail = 'owner@braaihouse.demo'
    let owner = await db.user.findUnique({ where: { email: ownerEmail } })
    let tenantId: string
    if (!owner) {
      const industry = INDUSTRIES[0]
      const tenant = await db.tenant.create({
        data: {
          name: 'The Braai House',
          industry: 'restaurant',
          cuisine: 'South African Braai & Grill',
          brandingColor: '#e8722a',
          address: '123 Long Street, Cape Town',
          latitude: -33.9249,
          longitude: 18.4241,
          geoRadiusMeters: 500,
          capacity: 60,
          avgSpendCents: 25000,
          openingHours: JSON.stringify({ mon: '11:00-22:00', tue: '11:00-22:00', wed: '11:00-22:00', thu: '11:00-22:00', fri: '11:00-23:00', sat: '11:00-23:00', sun: '12:00-21:00' }),
          phone: '0211234567',
          googleReviewUrl: 'https://g.page/r/example/review',
          smartPageConfig: JSON.stringify({ rating: 4.7, tagline: 'Cape Town\'s home of flame-grilled perfection', todaySpecials: 'Tonight: 500g Tomahawk steak for two — R450' }),
          slug: 'braaihouse',
          plan: 'professional',
          planStatus: 'trial',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          pointsPerVisit: 10,
          pointsPerRand: 1,
          welcomeBonus: 50,
          currencyName: 'Braai Points',
          currency: 'ZAR',
          whatsappStatus: 'connected',
          whatsappPhone: '27000000000',
          whatsappInstanceName: 'demo-tenant',
          whatsappInstanceToken: 'demo-token',
        },
      })
      tenantId = tenant.id
      owner = await db.user.create({
        data: {
          email: ownerEmail,
          name: 'Thabiso N.',
          passwordHash: hashPassword('owner123'),
          role: 'owner',
          tenantId,
        },
      })
      report.push('created demo tenant: The Braai House (slug: braaihouse)')
      report.push('created owner: owner@braaihouse.demo / owner123')
    } else {
      tenantId = owner.tenantId!
      // Ensure tenant has slug + smartPageConfig even if seed re-run
      await db.tenant.updateMany({
        where: { id: tenantId, slug: null },
        data: { slug: 'braaihouse', smartPageConfig: JSON.stringify({ rating: 4.7, tagline: 'Cape Town\'s home of flame-grilled perfection', todaySpecials: 'Tonight: 500g Tomahawk steak for two — R450' }) },
      })
      report.push('demo tenant + owner exist')
    }

    // 3. Rewards catalog
    const existingRewards = await db.rewardsCatalog.count({ where: { tenantId } })
    if (existingRewards === 0) {
      await db.rewardsCatalog.createMany({
        data: [
          { tenantId, name: 'Free Coffee', description: 'Any size filter coffee', pointsCost: 50 },
          { tenantId, name: 'Free Dessert', description: 'Choice of any dessert', pointsCost: 120 },
          { tenantId, name: 'R50 Off Your Bill', description: 'R50 voucher', pointsCost: 200 },
          { tenantId, name: 'Free Main Meal', description: 'Any main course under R150', pointsCost: 400 },
          { tenantId, name: 'Dinner for Two', description: 'Two mains + dessert (R400 value)', pointsCost: 800 },
        ],
      })
      report.push('created 5 rewards')
    } else {
      report.push(`rewards exist (${existingRewards})`)
    }

    // 4. Demo customers (varied statuses + last-visit windows)
    const existingCustomers = await db.customer.count({ where: { tenantId } })
    if (existingCustomers === 0) {
      const now = Date.now()
      const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000)
      const sampleNames = [
        ['Lerato M.', '27000000001', 'active', 180, 5, 380, days(2)],
        ['Sipho D.', '27000000002', 'active', 240, 7, 540, days(5)],
        ['Anelisa V.', '27000000003', 'vip', 870, 22, 2100, days(1)],
        ['Mandla K.', '27000000004', 'vip', 540, 14, 1450, days(3)],
        ['Naledi T.', '27000000005', 'active', 90, 4, 220, days(8)],
        ['Bonga H.', '27000000006', 'at_risk', 60, 3, 180, days(33)],
        ['Zinhle L.', '27000000007', 'at_risk', 30, 2, 95, days(38)],
        ['Karabo S.', '27000000008', 'dormant', 20, 1, 65, days(72)],
        ['Lebo P.', '27000000009', 'dormant', 10, 1, 45, days(95)],
        ['Refilwe N.', '27000000010', 'active', 150, 6, 320, days(11)],
        ['Tumelo M.', '27000000011', 'active', 70, 3, 145, days(15)],
        ['Anele B.', '27000000012', 'opted_out', 0, 2, 80, days(20)],
        ['Palesa R.', '27000000013', 'active', 110, 5, 260, days(6)],
        ['Kagiso T.', '27000000014', 'active', 320, 9, 720, days(4)],
        ['Boitumelo V.', '27000000015', 'active', 80, 3, 175, days(13)],
      ] as const

      for (const [name, phone, status, points, visits, spent, lastVisit] of sampleNames) {
        // Birthday: ~20% of customers have a birthday today (for daily brief demo), rest spread across the year
        const isBirthdayToday = Math.random() < 0.2
        const today = new Date()
        const birthday = isBirthdayToday
          ? new Date(1990, today.getMonth(), today.getDate())
          : new Date(1985 + Math.floor(Math.random() * 15), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28))
        // Allergies: ~15% have one
        const allergies = Math.random() < 0.15 ? ['shellfish', 'peanuts', 'gluten', 'dairy'][Math.floor(Math.random() * 4)] : null

        const c = await db.customer.create({
          data: {
            tenantId,
            phone,
            name,
            pointsBalance: points,
            status,
            totalVisits: visits,
            totalSpent: spent,
            lastVisitAt: lastVisit,
            joinedAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
            consentAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
            source: ['qr', 'instagram', 'link', 'tiktok', 'qr'][Math.floor(Math.random() * 5)],
            birthday,
            allergies,
          },
        })
        // Welcome bonus ledger entry
        await db.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId: c.id,
            type: 'welcome_bonus',
            points: 50,
            reason: 'Welcome bonus on JOIN',
            reference: 'seed',
            createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000),
          },
        })
        // Earn entries for visits
        for (let v = 0; v < Math.min(visits, 5); v++) {
          await db.loyaltyTransaction.create({
            data: {
              tenantId,
              customerId: c.id,
              type: 'earn',
              points: Math.floor(spent / Math.max(visits, 1)) + 10,
              reason: `Visit ${v + 1}`,
              reference: 'seed_visit',
              createdAt: new Date(now - (60 - v * 7) * 24 * 60 * 60 * 1000),
            },
          })
        }
      }
      report.push('created 15 demo customers (mix of statuses)')
    } else {
      report.push(`customers exist (${existingCustomers})`)
    }

    // 5. Seed automation rules for the demo tenant
    const existingRules = await db.automationRule.count({ where: { tenantId } })
    if (existingRules === 0) {
      for (const rule of MVP_RULES) {
        await db.automationRule.create({
          data: {
            tenantId,
            name: rule.name,
            description: rule.description,
            category: rule.category,
            trigger: serializeTrigger(rule.trigger),
            conditions: JSON.stringify(rule.conditions),
            actions: JSON.stringify(rule.actions),
            cadence: rule.trigger.type === 'schedule' ? rule.trigger.cadence : null,
            isActive: rule.isActive,
            priority: rule.priority,
          },
        })
      }
      report.push(`seeded ${MVP_RULES.length} automation rules`)
    } else {
      report.push(`automation rules exist (${existingRules})`)
    }

    // 6. One prospect (for the super admin invite pipeline)
    const existingProspects = await db.prospect.count()
    if (existingProspects === 0) {
      await db.prospect.create({
        data: {
          restaurantName: 'Cape Malay Kitchen',
          contactName: 'Fatima D.',
          phone: '27000000020',
          email: 'fatima@capemalay.demo',
          industry: 'restaurant',
          status: 'pending',
          source: 'homepage',
        },
      })
      await db.prospect.create({
        data: {
          restaurantName: 'Sushi Yamamoto',
          contactName: 'Kenji Y.',
          phone: '27000000021',
          email: 'kenji@yamamoto.demo',
          industry: 'restaurant',
          status: 'pending',
          source: 'referral',
        },
      })
      report.push('created 2 demo prospects (homepage + referral)')
    } else {
      report.push(`prospects exist (${existingProspects})`)
    }

    // 7. Menu items
    const existingMenu = await db.menuItem.count({ where: { tenantId } })
    if (existingMenu === 0) {
      const menuItems = [
        { category: 'Starters', name: 'Braai Brood', description: 'Garlic bread with smoked paprika butter', priceCents: 4500, dietary: [], sortOrder: 1 },
        { category: 'Starters', name: 'Wors Rolls', description: 'Mini boerewors rolls with tomato smoor', priceCents: 6500, dietary: [], sortOrder: 2 },
        { category: 'Starters', name: 'Grilled Calamari', description: 'Lemon, garlic, herbs', priceCents: 8500, dietary: ['gluten_free'], sortOrder: 3 },
        { category: 'Mains', name: '500g Tomahawk Steak', description: 'Flame-grilled, two-person cut', priceCents: 45000, dietary: ['gluten_free'], sortOrder: 1 },
        { category: 'Mains', name: 'Lamb Chops', description: 'Three chops, rosemary, mustard glaze', priceCents: 18500, dietary: ['gluten_free'], sortOrder: 2 },
        { category: 'Mains', name: 'Boerewors & Pap', description: 'Traditional sausage, tomato smoor, chakalaka', priceCents: 12500, dietary: ['gluten_free'], sortOrder: 3 },
        { category: 'Mains', name: 'Vegetable Skewer', description: 'Seasonal vegetables, basting sauce', priceCents: 11000, dietary: ['vegetarian', 'vegan', 'gluten_free'], sortOrder: 4 },
        { category: 'Mains', name: 'Half Chicken', description: 'Marinated, flame-grilled', priceCents: 9500, dietary: ['halal', 'gluten_free'], sortOrder: 5 },
        { category: 'Sides', name: 'Pap & Smoor', description: 'Maize meal, tomato-onion sauce', priceCents: 3500, dietary: ['vegetarian', 'vegan', 'gluten_free'], sortOrder: 1 },
        { category: 'Sides', name: 'Braai Brood', description: 'Toasted garlic bread', priceCents: 3500, dietary: ['vegetarian'], sortOrder: 2 },
        { category: 'Sides', name: 'Chips', description: 'Hand-cut, sea salt', priceCents: 3500, dietary: ['vegetarian', 'vegan', 'gluten_free'], sortOrder: 3 },
        { category: 'Desserts', name: 'Malva Pudding', description: 'Warm, sticky, with custard', priceCents: 5500, dietary: ['vegetarian'], sortOrder: 1 },
        { category: 'Desserts', name: 'Koeksister Ice Cream', description: 'Vanilla ice cream, koeksister crumble', priceCents: 5500, dietary: ['vegetarian'], sortOrder: 2 },
        { category: 'Drinks', name: 'Craft Beer (500ml)', description: 'Local Cape Town brew', priceCents: 4500, dietary: ['vegetarian', 'vegan', 'gluten_free'], sortOrder: 1 },
        { category: 'Drinks', name: 'Cape Wine (Glass)', description: 'Red or white, ask your server', priceCents: 5500, dietary: ['vegetarian', 'vegan', 'gluten_free'], sortOrder: 2 },
        { category: 'Drinks', name: 'Soft Drink', description: 'Coke, Fanta, Sprite', priceCents: 2500, dietary: ['vegetarian', 'vegan', 'gluten_free', 'halal'], sortOrder: 3 },
      ]
      for (const item of menuItems) {
        await db.menuItem.create({
          data: { tenantId, ...item, dietary: JSON.stringify(item.dietary) },
        })
      }
      report.push(`created ${menuItems.length} menu items`)
    } else {
      report.push(`menu items exist (${existingMenu})`)
    }

    // 8. Knowledge source (the restaurant's policy FAQ — for AI concierge grounding)
    const existingKnowledge = await db.knowledgeSource.count({ where: { tenantId } })
    if (existingKnowledge === 0) {
      const policyText = `The Braai House — Policies & FAQ

PARKING: Free parking is available in the Long Street parking garage after 6pm. Validate your ticket at the bar. Street parking is metered until 6pm.

RESERVATIONS: We hold reservations for 15 minutes past the booked time. After that, the table is released to the waitlist. Please call us on 0211234567 if you're running late.

DRESS CODE: Smart casual. No beachwear after 6pm.

CHILDREN: Families welcome. We have a kids' menu and high chairs available.

DOGS: Well-behaved dogs are welcome on our outside patio only. Water bowls provided.

ALLERGENS: Our kitchen handles all major allergens. Please inform your server of any allergies — we'll prepare your meal separately. Our gluten-free options are prepared in a dedicated area.

VEGETARIAN & VEGAN: We have dedicated vegetarian and vegan mains (see menu). The vegetable skewer and pap & smoor are vegan-friendly.

BOOKINGS FOR LARGE GROUPS: Parties of 8 or more require a deposit of R50 per person, refundable up to 24 hours before. Book online or text BOOK to this number.

PRIVATE EVENTS: The whole venue is available for buy-out Mondays and Tuesdays. Contact events@braaihouse.example for pricing.

HAPPY HOUR: 4-6pm weekdays — half-price starters and selected cocktails.

LIVE MUSIC: Every Friday and Saturday from 7pm — local Cape Town artists.

WIFI: Free wifi available — ask your server for the password.

SMOKING: Smoking (including e-cigarettes) is permitted on the patio only, in line with South African law.`
      const source = await db.knowledgeSource.create({
        data: { tenantId, type: 'text', filename: 'Policies & FAQ', status: 'processing' },
      })
      // Chunk + store
      const chunkSize = 800, overlap = 100
      const chunks: string[] = []
      for (let i = 0; i < policyText.length; i += chunkSize - overlap) {
        const c = policyText.slice(i, i + chunkSize)
        if (c.trim().length > 40) chunks.push(c)
      }
      for (const chunk of chunks) {
        const keywords = chunk.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !['the','and','that','have','with','this','from','they','will','would','there','their','what','about','which','when','your','please','available'].includes(w)).join(' ')
        await db.knowledgeChunk.create({
          data: { tenantId, sourceId: source.id, content: chunk, keywords },
        })
      }
      await db.knowledgeSource.update({ where: { id: source.id }, data: { status: 'ready', chunkCount: chunks.length } })
      report.push(`created knowledge source (policies, ${chunks.length} chunks)`)
    } else {
      report.push(`knowledge sources exist (${existingKnowledge})`)
    }

    // 9. Sample reservations (today + upcoming + one completed for review test)
    const existingReservations = await db.reservation.count({ where: { tenantId } })
    if (existingReservations === 0) {
      const todayIso = new Date().toISOString().slice(0, 10)
      const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000)

      const customers = await db.customer.findMany({ where: { tenantId, status: { in: ['active', 'vip'] } }, take: 8 })
      const reservations = [
        { phone: customers[0]?.phone ?? '27000000001', name: customers[0]?.name, customerId: customers[0]?.id, partySize: 2, date: todayIso, time: '19:00', occasion: 'Anniversary', status: 'confirmed' },
        { phone: customers[2]?.phone ?? '27000000003', name: customers[2]?.name, customerId: customers[2]?.id, partySize: 4, date: todayIso, time: '20:00', status: 'confirmed' },
        { phone: customers[3]?.phone ?? '27000000004', name: customers[3]?.name, customerId: customers[3]?.id, partySize: 8, date: todayIso, time: '19:30', occasion: 'Birthday', status: 'confirmed' },
        { phone: customers[4]?.phone ?? '27000000005', name: customers[4]?.name, customerId: customers[4]?.id, partySize: 2, date: todayIso, time: '18:30', status: 'pending' },
        { phone: customers[5]?.phone ?? '27000000006', name: customers[5]?.name, customerId: customers[5]?.id, partySize: 6, date: tomorrowIso, time: '20:00', status: 'confirmed' },
        { phone: customers[6]?.phone ?? '27000000007', name: customers[6]?.name, customerId: customers[6]?.id, partySize: 3, date: tomorrowIso, time: '19:00', status: 'confirmed' },
        // Completed yesterday 2 hours ago — eligible for review request
        { phone: customers[7]?.phone ?? '27000000008', name: customers[7]?.name, customerId: customers[7]?.id, partySize: 2, date: yesterdayIso, time: '19:00', status: 'completed', completedAt: twoHoursAgo },
      ]
      for (let i = 0; i < reservations.length; i++) {
        const r = reservations[i]
        await db.reservation.create({
          data: {
            tenantId,
            customerId: r.customerId ?? null,
            phone: r.phone,
            name: r.name ?? null,
            partySize: r.partySize,
            reservationDate: r.date,
            reservationTime: r.time,
            occasion: r.occasion ?? null,
            bookingRef: `ORD-${Date.now().toString(36).toUpperCase().slice(-6)}${i}`,
            status: r.status,
            completedAt: r.completedAt ?? null,
          },
        })
      }
      report.push(`created ${reservations.length} reservations (today + tomorrow + 1 completed for review test)`)
    } else {
      report.push(`reservations exist (${existingReservations})`)
    }

    // 10. One waitlist entry
    const existingWaitlist = await db.waitlist.count({ where: { tenantId } })
    if (existingWaitlist === 0) {
      const c = await db.customer.findFirst({ where: { tenantId, status: 'active' }, select: { id: true, phone: true, name: true } })
      if (c) {
        await db.waitlist.create({
          data: {
            tenantId,
            customerId: c.id,
            name: c.name,
            phone: c.phone,
            partySize: 3,
            preferredDate: new Date().toISOString().slice(0, 10),
            preferredTime: '19:30',
            status: 'waiting',
          },
        })
        report.push('created 1 waitlist entry')
      }
    } else {
      report.push(`waitlist exists (${existingWaitlist})`)
    }

    return NextResponse.json({ ok: true, report })
  } catch (e: any) {
    console.error('[seed] failed:', e)
    return NextResponse.json({ ok: false, error: e?.message, report }, { status: 500 })
  }
}
