const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const card = await prisma.mapCard.findFirst({ orderBy: { id: 'desc' }});
  if (card && card.data_core && card.data_core.nodes) {
    const tableNodes = card.data_core.nodes.filter(n => n.type === 'table' || (n.data && n.data.nodeType === 'table'));
    console.log("DB MAPCARD ID:", card.id);
    console.log(JSON.stringify(tableNodes, null, 2));
  } else {
    console.log("No card or nodes found.");
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
