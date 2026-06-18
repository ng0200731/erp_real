import { eq, ok, summary } from './_helpers.js';

const { normalizePricingForRead } = await import('../../db/tasksDb.js');

// flat -> none
let r = normalizePricingForRead({ pricing: { pricingMode: 'flat' } }, {});
eq(r.pricing.tierScopeMode, 'none', 'flat maps to none');
eq(r.pricing.tiers.length, 0, 'flat has empty tiers');

// tier + brand template -> brand
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 9, pricingTiers: [{ quantity: 1000, unitPrice: 0.5 }] } },
  { 9: 'brand' }
);
eq(r.pricing.tierScopeMode, 'brand', 'tier + brand scope -> brand');
eq(r.pricing.brandTierTableId, 9, 'brandTierTableId set');
eq(r.pricing.customerTierTableId, null, 'customerTierTableId null');
eq(r.pricing.tiers.length, 1, 'tiers carried over');

// tier + customer template -> customer
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 9, pricingTiers: [] } },
  { 9: 'customer' }
);
eq(r.pricing.tierScopeMode, 'customer', 'tier + customer scope -> customer');
eq(r.pricing.customerTierTableId, 9, 'customerTierTableId set');

// tier + unresolvable scope -> none + legacyTiers
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 99, pricingTiers: [{ quantity: 500, unitPrice: 0.2 }] } },
  {}
);
eq(r.pricing.tierScopeMode, 'none', 'unresolvable tier -> none');
ok(Array.isArray(r.pricing.legacyTiers) && r.pricing.legacyTiers.length === 1, 'legacyTiers preserved');
eq(r.pricing.legacyTierTemplateId, 99, 'legacyTierTemplateId preserved');

// already new shape -> idempotent
r = normalizePricingForRead({ pricing: { tierScopeMode: 'brand', brandTierTableId: 3, tiers: [] } }, {});
eq(r.pricing.tierScopeMode, 'brand', 'new shape unchanged');
eq(r.pricing.brandTierTableId, 3, 'new shape id unchanged');

// no pricing -> unchanged (no pricing key added)
r = normalizePricingForRead({ material: 'Cotton' }, {});
ok(r.pricing === undefined, 'missing pricing left absent');

summary('pricing normalize');
