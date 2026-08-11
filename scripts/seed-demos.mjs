// scripts/seed-demos.mjs — Pre-seed 14 Sandton demo restaurants as claimable tenants
// Run: DATABASE_URL=... NEXT_PUBLIC_APP_URL=... node scripts/seed-demos.mjs
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const demos = [
  { name:'Proud Mary', slug:'proud-mary', phone:'0615851596', email:'reservations@proudmary.co.za', address:'The Bank, 26 Cradock Ave, Rosebank', hours:'Daily 06:30-24:00', colour:'#7a1f2b', positioning:'All-day eatery & wine bar; accepts WhatsApp reservations; breakfast-brunch-lunch-dinner, set menus.', persona:'warm, stylish, highly responsive' },
  { name:'Marble Restaurant', slug:'marble', phone:'0105945550', email:'info@marble.restaurant', address:'Trumpet on Keyes, Cnr Keyes & Jellicoe Ave, Rosebank', hours:'Lunch 12-16, Dinner 17-22', colour:'#b0762a', positioning:'Premium fire-driven SA dining; reservations via phone/WhatsApp/DinePlan.', persona:'confident, culinary, refined, discreet' },
  { name:'AURUM Restaurant', slug:'aurum', phone:'0875360100', email:'bookings@aurumrestaurant.co.za', address:'Level 7, The Leonardo, 75 Maude St, Sandton', hours:'12:00-22:00', colour:'#c9a24b', positioning:'Luxury dining, Wine Library, Chef\'s Table, private events 14-120 guests.', persona:'personalised, luxury hospitality' },
  { name:'Trumps Grillhouse & Butchery', slug:'trumps-grillhouse', phone:'0117842366', email:'bookings@trumps-grill.com', address:'Shop 11, Nelson Mandela Square, Sandton', hours:'Daily 11:00-22:00', colour:'#8b5a2b', positioning:'Premium grillhouse; steak, wine, corporate & VIP dining.', persona:'confident, knowledgeable, sophisticated' },
  { name:'Signature Restaurant', slug:'signature-sandton', phone:'0118848888', email:'sandton@signaturerestaurant.co.za', address:'Morningside Shopping Centre, Shop U13, Sandton', hours:'Mon-Sat 12-24, Sun 12-22', colour:'#c9a24b', positioning:'Sophisticated fine dining; celebrations, business dinners, cocktails.', persona:'warm, confident, polished' },
  { name:'SINN', slug:'sinn', phone:'0107453705', email:'info@sinn.restaurant', address:'Shop 27, LXX, 70 Rivonia Rd, Sandhurst', hours:'12:00-late', colour:'#8a1e2d', positioning:'Modern Italian; business lunch, promotions, corporate events.', persona:'bold, artistic, energetic' },
  { name:'Zioux Restaurant & Bar', slug:'zioux', phone:'0105945455', email:'info@zioux.com', address:'The Marc, Cnr Rivonia & Maude St, Sandton', hours:'Tue-Sun 17:00-22:00', colour:'#800020', positioning:'Luxury Asian dining, cocktails, events, VIP experiences.', persona:'sophisticated, energetic, discreet' },
  { name:'Saint Restaurant', slug:'saint', phone:'0105945888', email:'info@saint.restaurant', address:'The Marc, Cnr Rivonia & Maude St, Sandton', hours:'Lunch 12-16, Dinner 17-22 (closed 16-17)', colour:'#7a1f2b', positioning:'Award-winning Italian; never promise bookings 16:00-17:00.', persona:'decadent, polished, energetic' },
  { name:'Tempo Luxury', slug:'tempo-luxury', phone:'0796775626', email:'reservations@tempo.luxury', address:'3 Achter Road, Rivonia Crossing, Sandton', hours:'12:00-late', colour:'#1f3a5f', positioning:'Dining + entertainment; events, birthdays, VIP.', persona:'premium, energetic, social' },
  { name:'The Grillhouse Sandton', slug:'grillhouse-sandton', phone:'0117836132', email:'sandton@thegrillhouse.co.za', address:'11 Alice Lane, Sandhurst', hours:'Tue-Sat 12-21', colour:'#5a3a22', positioning:'Premium steakhouse since 1994; corporate, wine, whisky.', persona:'warm, knowledgeable, professional' },
  { name:'Ukko Restaurant', slug:'ukko', phone:'0103350770', email:'info@ukkorestaurant.co.za', address:'Shop U24, Nicolway, Bryanston', hours:'11:00-22:00', colour:'#b0762a', positioning:'Mediterranean + sushi, social dining, menu concierge.', persona:'stylish, warm, social' },
  { name:'Ethos Restaurant', slug:'ethos', phone:'0104469906', email:'info@ethosrestaurant.co.za', address:'Cnr Eastwood & Parks Blvd, Rosebank', hours:'12:00-23:00', colour:'#b08d57', positioning:'Mediterranean luxury; marble interiors, business dining.', persona:'elegant, warm, Mediterranean' },
  { name:'CowFish Sandhurst', slug:'cowfish-sandhurst', phone:'0101572782', email:'sandhurst@cow-fish.co.za', address:'70 Rivonia Road, Sandhurst', hours:'12:00-22:00', colour:'#e8722a', positioning:'Burgers + sushi + seafood; playful social dining, big menu.', persona:'friendly, energetic, knowledgeable' },
  { name:'The Pot Luck Club Johannesburg', slug:'pot-luck-club-jhb', phone:'0101575757', email:'', address:'61 North Street, Melrose', hours:'Lunch & dinner', colour:'#3a3a3a', positioning:'Chef-led shared dining; guide first-time guests.', persona:'adventurous, conversational' },
]

console.log('==> Seeding 14 demo tenants...\n')

for (const d of demos) {
  const token = crypto.randomUUID()
  const kb = `LOCATION: ${d.address}\nPHONE: ${d.phone}\nHOURS: ${d.hours}\nPOSITIONING: ${d.positioning}`

  // Check if tenant already exists by slug
  const existing = await prisma.tenant.findFirst({ where: { slug: d.slug } })
  if (existing) {
    // Update with persona + claimToken if not already claimed
    if (!existing.claimedAt) {
      await prisma.tenant.update({
        where: { id: existing.id },
        data: {
          persona: d.persona,
          brandingColor: d.colour,
          phone: d.phone,
          address: d.address,
          openingHours: JSON.stringify({ general: d.hours }),
          claimToken: existing.claimToken || token,
          planStatus: 'trial',
        },
      })
      console.log(`${d.name.padEnd(32)} ${APP}/?claim=${existing.claimToken || token}`)
    } else {
      console.log(`${d.name.padEnd(32)} ALREADY CLAIMED — skipping`)
    }
    continue
  }

  // Create new demo tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: d.name,
      slug: d.slug,
      phone: d.phone,
      address: d.address,
      industry: 'restaurant',
      brandingColor: d.colour,
      persona: d.persona,
      openingHours: JSON.stringify({ general: d.hours }),
      plan: 'starter',
      planStatus: 'trial',
      currencyName: 'Points',
      claimToken: token,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  })

  // Seed knowledge source with positioning info
  await prisma.knowledgeSource.create({
    data: {
      tenantId: tenant.id,
      type: 'text',
      filename: `${d.name} — Info Sheet`,
      status: 'ready',
      chunkCount: 1,
    },
  })

  const source = await prisma.knowledgeSource.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
  })

  if (source) {
    const keywords = kb.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !['the','and','that','have','with','this','from','they','will','would','there','their','what','about','which','when','your','please'].includes(w)).join(' ')
    await prisma.knowledgeChunk.create({
      data: {
        tenantId: tenant.id,
        sourceId: source.id,
        content: kb,
        keywords,
      },
    })
  }

  console.log(`${d.name.padEnd(32)} ${APP}/?claim=${token}`)
}

console.log('\n==> Done. 14 demo tenants seeded with magic links.')
await prisma.$disconnect()
