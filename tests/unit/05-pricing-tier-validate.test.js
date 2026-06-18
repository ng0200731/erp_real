import { eq, ok, summary } from './_helpers.js';
import { resolveTierTableTargetError } from '../../routes/pricing-tier-tables.js';

// Stub lookups: "found" returns a truthy row, "miss" simulates a deleted entity.
const found = { getCustomerById: async () => ({ id: 41 }), getBrandById: async () => ({ id: 1 }) };
const miss = { getCustomerById: async () => null, getBrandById: async () => null };

// --- customer (Garment Factory) scope ---
ok(
  await resolveTierTableTargetError({ scope: 'customer', customerId: 41 }, found) === null,
  'valid customer id -> null (no error)'
);
{
  const r = await resolveTierTableTargetError({ scope: 'customer', customerId: 999 }, miss);
  ok(r && /no longer exists/i.test(r), 'deleted customer id -> clear "no longer exists" error');
  ok(r && /refresh/i.test(r), '...and it tells the user to refresh');
}
{
  const r = await resolveTierTableTargetError({ scope: 'customer' }, miss); // no id at all
  ok(r && /select a garment factory/i.test(r), 'missing customer id -> "select a garment factory"');
}
// customerId that normalizes to NaN/0 must also be rejected (not silently pass)
{
  const r = await resolveTierTableTargetError({ scope: 'customer', customerId: 'abc' }, miss);
  ok(r != null, 'non-numeric customer id is rejected');
}

// --- brand scope ---
ok(
  await resolveTierTableTargetError({ scope: 'brand', brandId: 1 }, found) === null,
  'valid brand id -> null (no error)'
);
{
  const r = await resolveTierTableTargetError({ scope: 'brand', brandId: 999 }, miss);
  ok(r && /no longer exists/i.test(r), 'deleted brand id -> clear "no longer exists" error');
}
{
  const r = await resolveTierTableTargetError({ scope: 'brand' }, miss);
  ok(r && /select a brand/i.test(r), 'missing brand id -> "select a brand"');
}

summary('pricing tier target validation');
