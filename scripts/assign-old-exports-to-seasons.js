const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignSeasonsToOldExports() {
  const exports = await prisma.exportContainer.findMany({ where: { seasonId: null } });
  const seasons = await prisma.season.findMany();

  function toDateOnly(d) {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  for (const exp of exports) {
    const expDate = toDateOnly(new Date(exp.date));

    const matched = seasons.find(season => {
      const start = new Date(season.startDate);
      const end = season.endDate ? new Date(season.endDate) : null;
      return start <= expDate && (!end || expDate <= end);
    });

    if (matched) {
      await prisma.exportContainer.update({
        where: { id: exp.id },
        data: { seasonId: matched.id },
      });
      console.log(`✅ Export ID ${exp.id} assigned to season ${matched.name}`);
    } else {
      console.log(`⚠️ Export ID ${exp.id} has no matching season`);
    }
  }

  console.log('🎉 Done assigning seasons to export documents');
  await prisma.$disconnect();
}

assignSeasonsToOldExports().catch(err => {
  console.error('❌ Error:', err);
  prisma.$disconnect();
});
