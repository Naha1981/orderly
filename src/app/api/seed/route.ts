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
          brandingColor: industry.color,
          address: '123 Long Street, Cape Town',
          latitude: -33.9249,
          longitude: 18.4241,
          geoRadiusMeters: 500,
          plan: 'growth',
          planStatus: 'trial',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          pointsPerVisit: 10,
          pointsPerRand: 1,
          welcomeBonus: 50,
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
      report.push('created demo tenant: The Braai House')
      report.push('created owner: owner@braaihouse.demo / owner123')
    } else {
      tenantId = owner.tenantId!
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
        },
      })
      report.push('created 1 demo prospect')
    } else {
      report.push(`prospects exist (${existingProspects})`)
    }

    return NextResponse.json({ ok: true, report })
  } catch (e: any) {
    console.error('[seed] failed:', e)
    return NextResponse.json({ ok: false, error: e?.message, report }, { status: 500 })
  }
}
