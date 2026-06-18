import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const {
  createCustomer,
  createBrand,
  createPricingTierTable,
  getCustomerIdsByName,
  getPricingTierTablesByFilter,
} = await import('../../db/tasksDb.js');

await createCustomer({
  companyName: 'Acme Factory',
  emailDomain: 'acme.com',
  companyType: 'Garment Factory',
});

const ids = await getCustomerIdsByName('acme factory');
ok(ids.length === 1, 'getCustomerIdsByName matches case-insensitively');
const custId = ids[0];

// pricing_tier_tables.brandId has an enforced FK to brands(id). AUTOINCREMENT in
// a fresh temp DB yields ids 1,2,...; create the brand and use its real id so
// the brand-scoped tables below satisfy the FK. brandName carries the label.
let brandId = 0;
while (brandId < 5) {
  brandId = await createBrand({ name: 'Brand X' });
}

await createPricingTierTable({
  name: 'Acme tiers',
  scope: 'customer',
  customerId: custId,
  customerName: 'Acme Factory',
  tiers: [{ quantity: 1000, unitPrice: 0 }],
});
await createPricingTierTable({
  name: 'Brand X tiers',
  scope: 'brand',
  brandId,
  brandName: 'Brand X',
  tiers: [{ quantity: 500, unitPrice: 0 }],
});
await createPricingTierTable({
  name: 'Brand X disabled',
  scope: 'brand',
  brandId,
  brandName: 'Brand X',
  disabled: true,
  tiers: [{ quantity: 500, unitPrice: 0 }],
});

const byCustomerName = await getPricingTierTablesByFilter({ scope: 'customer', customerName: 'Acme Factory' });
eq(byCustomerName.length, 1, 'filter by customer name returns the one customer table');
eq(byCustomerName[0].name, 'Acme tiers', '...and it is the correct table');

const byBrand = await getPricingTierTablesByFilter({ scope: 'brand', brandId });
eq(byBrand.length, 1, 'brand filter excludes disabled tables');

const byCustId = await getPricingTierTablesByFilter({ scope: 'customer', customerId: custId });
eq(byCustId.length, 1, 'filter by customerId works');

const noMatch = await getPricingTierTablesByFilter({ scope: 'customer', customerName: 'Nonexistent' });
eq(noMatch.length, 0, 'no customer match returns empty array');

summary('pricing tier filter');
