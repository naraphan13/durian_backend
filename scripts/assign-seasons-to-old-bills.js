const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ฟังก์ชันตัดเวลาออก ให้เหลือเฉพาะวันที่
function toDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function assignOldBillsToSeasons() {
  try {
    console.log("🔍 กำลังค้นหาบิลที่ยังไม่มีฤดูกาล...");
    const oldBills = await prisma.bill.findMany({
      where: { seasonId: null },
      orderBy: { date: "asc" },
    });

    if (oldBills.length === 0) {
      console.log("✅ ไม่มีบิลที่ยังไม่ได้ผูกฤดูกาล");
      return;
    }

    const allSeasons = await prisma.season.findMany();
    let updatedCount = 0;

    for (const bill of oldBills) {
      const billDate = toDateOnly(new Date(bill.date));

      const season = allSeasons.find((s) => {
        const start = toDateOnly(new Date(s.startDate));
        const end = s.endDate ? toDateOnly(new Date(s.endDate)) : null;

        return billDate >= start && (!end || billDate <= end);
      });

      if (season) {
        await prisma.bill.update({
          where: { id: bill.id },
          data: { seasonId: season.id },
        });
        console.log(`✅ ผูกบิล ${bill.id} วันที่ ${billDate.toISOString().split("T")[0]} → ฤดูกาล "${season.name}"`);
        updatedCount++;
      } else {
        console.log(`⚠️ บิล ${bill.id} (${billDate.toISOString().split("T")[0]}) ไม่พบฤดูกาลที่ตรง`);
      }
    }

    console.log(`\n🎉 เสร็จสิ้น: อัปเดตบิลทั้งหมด ${updatedCount} ใบเรียบร้อยแล้ว`);
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err);
  } finally {
    await prisma.$disconnect();
  }
}

assignOldBillsToSeasons();
