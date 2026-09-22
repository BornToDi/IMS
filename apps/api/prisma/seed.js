const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

const banks = [
  { name: 'Eastern Bank PLC (EBL)', branch: 'Gulshan Avenue Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 222264621, demo@ebl.com.bd' },
  { name: 'Dutch-Bangla Bank PLC (DBBL)', branch: 'Motijheel Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 9556993, demo@dbbl.com.bd' },
  { name: 'BRAC Bank PLC', branch: 'Gulshan Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 222281955, demo@bracbank.com' },
  { name: 'The City Bank PLC', branch: 'Dhanmondi Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 8331040, demo@citybankplc.com' },
  { name: 'Bank Asia PLC', branch: 'Kawran Bazar Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 55012061, demo@bankasia-bd.com' },
  { name: 'Prime Bank PLC', branch: 'Banani Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 9821118, demo@primebank.com.bd' },
  { name: 'United Commercial Bank PLC (UCB)', branch: 'Uttara Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 8913040, demo@ucb.com.bd' },
  { name: 'Mutual Trust Bank PLC (MTB)', branch: 'Dhanmondi Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 41021000, demo@mutualtrustbank.com' },
  { name: 'Islami Bank Bangladesh PLC', branch: 'Dilkusha Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 9563040, demo@islamibankbd.com' },
  { name: 'NCC Bank PLC', branch: 'Mohakhali Branch', contactPerson: 'Demo Operations', contactDetails: '+880 2 9884041, demo@nccbank.com.bd' }
];

const merchants = [
  { name: 'Aarong Dhanmondi', category: 'Clothing and lifestyle', address: 'House 12, Road 2, Dhanmondi, Dhaka' },
  { name: 'Agora Gulshan', category: 'Super shop', address: 'House 15, Road 11, Gulshan 1, Dhaka' },
  { name: 'Shwapno Mirpur', category: 'Super shop', address: 'Plot 8, Section 10, Mirpur, Dhaka' },
  { name: 'Bata New Market', category: 'Footwear store', address: 'New Market, Dhaka' },
  { name: 'Yellow Bashundhara', category: 'Fashion brand store', address: 'Bashundhara City, Panthapath, Dhaka' },
  { name: 'Rangs Electronics Uttara', category: 'Electronics store', address: 'Sector 7, Uttara, Dhaka' },
  { name: 'Meena Bazar Banani', category: 'Super shop', address: 'Road 11, Banani, Dhaka' },
  { name: 'Kacchi Bhai Baily Road', category: 'Restaurant', address: 'Baily Road, Ramna, Dhaka' },
  { name: 'Sailor Chattogram', category: 'Clothing and lifestyle', address: 'GEC Circle, Chattogram' },
  { name: 'Nandan Mega Shop Sylhet', category: 'Department store', address: 'Zindabazar, Sylhet' }
];

const models = ['Verifone V240m', 'Ingenico DX8000', 'PAX A920', 'Castles VEGA3000'];
const telcos = ['Grameenphone', 'Robi', 'Banglalink', 'Teletalk'];

async function main() {
  let created = 0;
  for (let bankIndex = 0; bankIndex < banks.length; bankIndex += 1) {
    const bank = banks[bankIndex];
    const bankRow = await prisma.bankMaster.upsert({
      where: { name: bank.name },
      update: { branch: bank.branch, contactPerson: bank.contactPerson, contactDetails: bank.contactDetails, active: true },
      create: { ...bank, agreementReference: `DEMO-AGREEMENT-${String(bankIndex + 1).padStart(2, '0')}`, active: true }
    });

    for (let posIndex = 0; posIndex < merchants.length; posIndex += 1) {
      const merchant = merchants[posIndex];
      const serialNumber = `DEMO-${String(bankIndex + 1).padStart(2, '0')}-${String(posIndex + 1).padStart(3, '0')}`;
      await prisma.posSerial.upsert({
        where: { serialNumber },
        update: {
          bankName: bank.name, model: models[(bankIndex + posIndex) % models.length],
          location: merchant.address.split(',').slice(-2).join(',').trim(), place: merchant.category,
          tidNumber: `8${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(5, '0')}`,
          midNumber: `5${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(7, '0')}`,
          merchantName: merchant.name, merchantAddress: merchant.address, merchantStatus: 'ACTIVE',
          operator: telcos[(bankIndex + posIndex) % telcos.length], simNumber: `017${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(5, '0')}`,
          remarks: `Demo record · ${merchant.category}`
        },
        create: {
          bankName: bank.name, serialNumber, model: models[(bankIndex + posIndex) % models.length],
          location: merchant.address.split(',').slice(-2).join(',').trim(), place: merchant.category,
          tidNumber: `8${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(5, '0')}`,
          midNumber: `5${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(7, '0')}`,
          merchantName: merchant.name, merchantAddress: merchant.address, merchantStatus: 'ACTIVE',
          operator: telcos[(bankIndex + posIndex) % telcos.length], simNumber: `017${String(bankIndex + 1).padStart(2, '02')}${String(posIndex + 1).padStart(5, '0')}`,
          remarks: `Demo record · ${merchant.category}`
        }
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "InventoryDevice" ("id", "serialNumber", "brand", "model", "deviceType", "status", "bankId", "location", "merchant", "branch", "tid", "mid", "address", "telco", "simEi", "engineer", "deploymentDate", "remarks", "reference", "version", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 'POS', 'DEPLOYED', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Demo deployment team', ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT("serialNumber") DO UPDATE SET
           "brand" = excluded."brand", "model" = excluded."model", "status" = 'DEPLOYED', "bankId" = excluded."bankId",
           "location" = excluded."location", "merchant" = excluded."merchant", "branch" = excluded."branch",
           "tid" = excluded."tid", "mid" = excluded."mid", "address" = excluded."address", "telco" = excluded."telco",
           "simEi" = excluded."simEi", "engineer" = excluded."engineer", "deploymentDate" = excluded."deploymentDate",
           "remarks" = excluded."remarks", "reference" = excluded."reference", "archived" = false, "updatedAt" = CURRENT_TIMESTAMP`,
        randomUUID(), serialNumber, 'Demo POS Terminal', models[(bankIndex + posIndex) % models.length], bankRow.id,
        merchant.address.split(',').slice(-2).join(',').trim(), merchant.name, bank.branch,
        `8${String(bankIndex + 1).padStart(2, '0')}${String(posIndex + 1).padStart(5, '0')}`,
        `5${String(bankIndex + 1).padStart(2, '0')}${String(posIndex + 1).padStart(7, '0')}`,
        merchant.address, telcos[(bankIndex + posIndex) % telcos.length],
        `017${String(bankIndex + 1).padStart(2, '0')}${String(posIndex + 1).padStart(5, '0')}`,
        '2026-09-15T00:00:00.000Z', `Demo hardware record · ${merchant.category}`, `DEMO-${String(bankIndex + 1).padStart(2, '0')}`
      );
      created += 1;
    }
    if (bankIndex === 0) {
      const repairDemos = [
        ['Internet Issue', 'Repaired', 'Rakib', 'Completed', 0],
        ['Power Issue', 'Repaired', 'Fahim', 'Tested OK', 0],
        ['Card Reader Error', 'Repaired', 'Sabbir', 'Completed', 0],
        ['Printer Issue', 'Repaired', 'Rakib', 'Tested OK', 0],
        ['No Power', 'Repaired', 'Fahim', 'Completed', 0],
        ['Display Issue', 'Repaired', 'Sabbir', 'Tested OK', 0],
        ['Network Issue', 'Pending', 'Rakib', 'Under Observation', 0],
        ['Card Not Detected', 'Repaired', 'Fahim', 'Completed', 0],
        ['Touch Screen Issue', 'Repaired', 'Sabbir', 'Tested OK', 0],
        ['Battery Issue', 'Pending', 'Rakib', 'Spare Required', 0],
        ['Connectivity Issue', 'Repaired', 'Fahim', 'Completed', 0],
        ['SIM Error', 'Repaired', 'Sabbir', 'Tested OK', 0]
      ];
      for (let repairIndex = 0; repairIndex < repairDemos.length; repairIndex += 1) {
        const [faultType, repairStatus, technician, remarks, repairCost] = repairDemos[repairIndex];
        const serialNumber = `RMA-DEMO-${String(repairIndex + 1).padStart(3, '0')}`;
        await prisma.inventoryDevice.upsert({
          where: { serialNumber },
          update: { status: repairStatus === 'Repaired' ? 'REPAIRED' : 'UNDER_REPAIR', bankId: bankRow.id, location: ['Uttara', 'Gulshan', 'Banani', 'Dhanmondi', 'Mirpur', 'Mohammadpur', 'Farmgate', 'Motijheel', 'Khulna', 'Chittagong', 'Sylhet', 'Rajshahi'][repairIndex], tid: `806000${repairIndex + 6}`, faultType, repairStatus, technician, repairCost, remarks, archived: false },
          create: { serialNumber, brand: 'Demo POS Terminal', model: models[repairIndex % models.length], deviceType: 'POS', status: repairStatus === 'Repaired' ? 'REPAIRED' : 'UNDER_REPAIR', bankId: bankRow.id, location: ['Uttara', 'Gulshan', 'Banani', 'Dhanmondi', 'Mirpur', 'Mohammadpur', 'Farmgate', 'Motijheel', 'Khulna', 'Chittagong', 'Sylhet', 'Rajshahi'][repairIndex], tid: `806000${repairIndex + 6}`, faultType, repairReceivedDate: new Date('2026-09-18T00:00:00.000Z'), technician, repairStatus, repairCost, remarks, reference: 'NBL-RMA-DEMO-0922' }
        });
      }
      created += repairDemos.length;
    }
  }
  console.log(`Demo data ready: ${banks.length} Bangladesh banks and ${created} POS serial records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
