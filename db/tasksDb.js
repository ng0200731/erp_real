import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const defaultDbPath = path.join(dataDir, 'tasks.db');
function resolveDbPath() {
  return process.env.ERP_DB_PATH || defaultDbPath;
}

let dbPromise = null;

async function ensureSchema(db) {
  try {
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,

      sourceEmailUid INTEGER,
      sourceSubject TEXT,
      customerEmail TEXT,

      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,

      replyMessageId TEXT,
      repliedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      remark TEXT,
      customerName TEXT NOT NULL DEFAULT '',
      contactPerson TEXT NOT NULL DEFAULT '',
      mailUser TEXT NOT NULL,
      mailPass TEXT NOT NULL,
      imapHost TEXT NOT NULL,
      imapPort INTEGER NOT NULL DEFAULT 993,
      imapTls TEXT NOT NULL DEFAULT 'true',
      smtpHost TEXT NOT NULL,
      smtpPort INTEGER NOT NULL DEFAULT 465,
      smtpSecure TEXT NOT NULL DEFAULT 'true',
      port INTEGER NOT NULL DEFAULT 3001,
      isActive INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      message_id TEXT,
      smtp_response TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error_message TEXT,
      sent_at TEXT NOT NULL,
      sender_email TEXT,
      profile_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyName TEXT NOT NULL,
      emailDomain TEXT NOT NULL,
      companyAddress TEXT,
      companyTel TEXT,
      companyType TEXT NOT NULL,
      companyWebsite TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      name TEXT NOT NULL,
      emailPrefix TEXT,
      title TEXT,
      tel TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactPerson TEXT,
      email TEXT,
      phone TEXT,
      productType TEXT NOT NULL,
      productDetails TEXT,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      total REAL NOT NULL,
      notes TEXT,
      type TEXT DEFAULT 'non email',
      sourceEmailUid INTEGER,
      sourceEmailSubject TEXT,
      sourceEmailMessageId TEXT,
      profileImagePath TEXT,
      attachmentPaths TEXT,
      dateCreated TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      resendCount INTEGER DEFAULT 0,
      outsourcingSeq TEXT,
      selectedSupplierId INTEGER,
      selectedSupplierResponseId INTEGER,
      sampleReadyDate TEXT,
      brandId INTEGER,
      profileImageBlob BLOB,
      profileImageMime TEXT,
      customerItemName TEXT,
      chaseSampleCount INTEGER DEFAULT 0,
      resubmitCount INTEGER DEFAULT 0,
      quotationSeq TEXT,
      height_mm REAL,
      width_mm REAL,
      markupPercent REAL DEFAULT 0,
      variable TEXT DEFAULT 'NO'
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      tags TEXT,
      components TEXT,
      features TEXT,
      dependencies TEXT,
      data_structure TEXT,
      ui_components TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tasks_sourceEmailUid ON tasks(sourceEmailUid);
    CREATE INDEX IF NOT EXISTS idx_profiles_isActive ON profiles(isActive);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_sent_at ON sent_emails(sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_profile_id ON sent_emails(profile_id);
    CREATE INDEX IF NOT EXISTS idx_sent_emails_to_email ON sent_emails(to_email);
    CREATE INDEX IF NOT EXISTS idx_customers_companyName ON customers(companyName);
    CREATE INDEX IF NOT EXISTS idx_customers_emailDomain ON customers(emailDomain);
    CREATE INDEX IF NOT EXISTS idx_customer_members_customerId ON customer_members(customerId);
    CREATE INDEX IF NOT EXISTS idx_customer_members_name ON customer_members(name);
    CREATE INDEX IF NOT EXISTS idx_quotations_customerName ON quotations(customerName);
    CREATE INDEX IF NOT EXISTS idx_quotations_productType ON quotations(productType);
    CREATE INDEX IF NOT EXISTS idx_quotations_dateCreated ON quotations(dateCreated DESC);
    CREATE INDEX IF NOT EXISTS idx_quotations_quotationSeq ON quotations(quotationSeq);
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyName TEXT NOT NULL,
      emailDomain TEXT NOT NULL,
      companyAddress TEXT,
      companyTel TEXT,
      companyType TEXT NOT NULL,
      companyWebsite TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId INTEGER NOT NULL,
      name TEXT NOT NULL,
      emailPrefix TEXT,
      title TEXT,
      tel TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_companyName ON suppliers(companyName);
    CREATE INDEX IF NOT EXISTS idx_suppliers_emailDomain ON suppliers(emailDomain);
    CREATE INDEX IF NOT EXISTS idx_supplier_members_supplierId ON supplier_members(supplierId);
    CREATE INDEX IF NOT EXISTS idx_supplier_members_name ON supplier_members(name);

    CREATE TABLE IF NOT EXISTS quotation_suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotationId INTEGER NOT NULL,
      supplierId INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (quotationId) REFERENCES quotations(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
      UNIQUE(quotationId, supplierId)
    );

    CREATE INDEX IF NOT EXISTS idx_quotation_suppliers_quotationId ON quotation_suppliers(quotationId);
    CREATE INDEX IF NOT EXISTS idx_quotation_suppliers_supplierId ON quotation_suppliers(supplierId);

    CREATE TABLE IF NOT EXISTS supplier_quotation_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      quotationId INTEGER NOT NULL,
      supplierId INTEGER NOT NULL,
      supplierMemberId INTEGER NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (quotationId) REFERENCES quotations(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierMemberId) REFERENCES supplier_members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS supplier_quotation_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tokenId INTEGER NOT NULL,
      quotationId INTEGER NOT NULL,
      supplierId INTEGER NOT NULL,
      supplierMemberId INTEGER NOT NULL,
      unitPrice REAL,
      totalPrice REAL,
      deliveryDays INTEGER,
      notes TEXT,
      submittedAt TEXT NOT NULL,
      FOREIGN KEY (tokenId) REFERENCES supplier_quotation_tokens(id),
      FOREIGN KEY (quotationId) REFERENCES quotations(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierMemberId) REFERENCES supplier_members(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sqt_token ON supplier_quotation_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_sqt_quotationId ON supplier_quotation_tokens(quotationId);
    CREATE INDEX IF NOT EXISTS idx_sqr_quotationId ON supplier_quotation_responses(quotationId);
    CREATE INDEX IF NOT EXISTS idx_sqr_tokenId ON supplier_quotation_responses(tokenId);

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      logoPath TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);

    CREATE TABLE IF NOT EXISTS product_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      productType TEXT NOT NULL,
      specs TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_product_profiles_productType ON product_profiles(productType);
    CREATE INDEX IF NOT EXISTS idx_product_profiles_name ON product_profiles(name);

    CREATE TABLE IF NOT EXISTS pricing_tier_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scope TEXT NOT NULL,
      brandId INTEGER,
      brandName TEXT,
      customerId INTEGER,
      customerName TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      sourceProfileId INTEGER UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (brandId) REFERENCES brands(id) ON DELETE SET NULL,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (sourceProfileId) REFERENCES product_profiles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_tier_table_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tableId INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (tableId) REFERENCES pricing_tier_tables(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pricing_tier_tables_scope ON pricing_tier_tables(scope);
    CREATE INDEX IF NOT EXISTS idx_pricing_tier_tables_brandId ON pricing_tier_tables(brandId);
    CREATE INDEX IF NOT EXISTS idx_pricing_tier_tables_customerId ON pricing_tier_tables(customerId);
    CREATE INDEX IF NOT EXISTS idx_pricing_tier_tables_name ON pricing_tier_tables(name);
    CREATE INDEX IF NOT EXISTS idx_pricing_tier_table_rows_tableId ON pricing_tier_table_rows(tableId);

    CREATE TABLE IF NOT EXISTS workshops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullCompanyName TEXT NOT NULL,
      tradingName TEXT,
      yearEstablished TEXT,
      companyType TEXT,
      legalStructure TEXT,
      businessRegNumber TEXT,
      gstVatNumber TEXT,
      website TEXT,
      yearlyTurnover TEXT,
      primaryContactName TEXT,
      primaryContactDesignation TEXT,
      mobileWhatsapp TEXT,
      emailAddress TEXT,
      altContactPerson TEXT,
      companyAddress TEXT,
      googleMapLink TEXT,
      country TEXT,
      cityProvince TEXT,
      factoryArea TEXT,
      numBuildings TEXT,
      totalEmployees TEXT,
      numProductionWorkers TEXT,
      numQCStaff TEXT,
      numAdminSalesStaff TEXT,
      productionCapabilities TEXT,
      departments TEXT,
      qualityCerts TEXT,
      sustainability TEXT,
      capacityReliability TEXT,
      uploads TEXT,
      howDidYouHear TEXT,
      existingRelationship TEXT,
      clientReferences TEXT,
      declarationAccepted INTEGER DEFAULT 0,
      digitalSignature TEXT,
      signatureDate TEXT,
      status TEXT DEFAULT 'active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workshops_fullCompanyName ON workshops(fullCompanyName);
    CREATE INDEX IF NOT EXISTS idx_workshops_country ON workshops(country);
    CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops(status);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderSeq TEXT NOT NULL UNIQUE,
      quotationId INTEGER NOT NULL,
      quotationType TEXT NOT NULL,
      quotationSeq TEXT NOT NULL,
      workshopId INTEGER,
      workshopName TEXT,
      country TEXT,
      customerName TEXT NOT NULL,
      contactPerson TEXT,
      email TEXT,
      phone TEXT,
      productType TEXT NOT NULL,
      productDetails TEXT,
      quantity INTEGER NOT NULL,
      unitPrice REAL NOT NULL,
      total REAL NOT NULL,
      customerItemName TEXT,
      brandId INTEGER,
      currentDepartment TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      dateCreated TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (quotationId) REFERENCES quotations(id),
      FOREIGN KEY (workshopId) REFERENCES workshops(id),
      FOREIGN KEY (brandId) REFERENCES brands(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_orderSeq ON orders(orderSeq);
    CREATE INDEX IF NOT EXISTS idx_orders_quotationId ON orders(quotationId);
    CREATE INDEX IF NOT EXISTS idx_orders_workshopId ON orders(workshopId);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_dateCreated ON orders(dateCreated DESC);

    CREATE TABLE IF NOT EXISTS order_progress_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderSeq TEXT NOT NULL,
      orderId INTEGER NOT NULL,
      department TEXT NOT NULL,
      scannedAt TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_opt_orderSeq ON order_progress_tracking(orderSeq);
    CREATE INDEX IF NOT EXISTS idx_opt_orderId ON order_progress_tracking(orderId);
    CREATE INDEX IF NOT EXISTS idx_opt_scannedAt ON order_progress_tracking(scannedAt DESC);
  `);
  } catch (err) {
    console.error('ensureSchema CREATE exec failed:', err);
    throw err;
  }

  // Add new columns if they don't exist (for database migration)
  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN profileImagePath TEXT;`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding profileImagePath column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN attachmentPaths TEXT;`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding attachmentPaths column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN type TEXT DEFAULT 'non email';`);
  } catch (err) {
    // Column might already exist, ignore error
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding type column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN sourceEmailUid INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding sourceEmailUid column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN sourceEmailSubject TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding sourceEmailSubject column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN sourceEmailMessageId TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding sourceEmailMessageId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE sent_emails ADD COLUMN sender_email TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding sender_email column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN resendCount INTEGER DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding resendCount column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE sent_emails ADD COLUMN isRead INTEGER DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding isRead column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN outsourcingSeq TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding outsourcingSeq column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN selectedSupplierId INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding selectedSupplierId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN selectedSupplierResponseId INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding selectedSupplierResponseId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN sampleReadyDate TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding sampleReadyDate column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE supplier_quotation_responses ADD COLUMN tierPrices TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding tierPrices column:', err);
    }
  }

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_sampling_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        quotationId INTEGER NOT NULL,
        supplierId INTEGER NOT NULL,
        supplierMemberId INTEGER NOT NULL,
        expiresAt TEXT NOT NULL,
        usedAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (quotationId) REFERENCES quotations(id) ON DELETE CASCADE,
        FOREIGN KEY (supplierId) REFERENCES suppliers(id),
        FOREIGN KEY (supplierMemberId) REFERENCES supplier_members(id)
      );
    `);
  } catch (err) {
    console.warn('Error creating supplier_sampling_tokens table:', err);
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN brandId INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding brandId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN profileImageBlob BLOB;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding profileImageBlob column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN profileImageMime TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding profileImageMime column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN customerItemName TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding customerItemName column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN chaseSampleCount INTEGER DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding chaseSampleCount column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN resubmitCount INTEGER DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding resubmitCount column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN quotationSeq TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding quotationSeq column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN height_mm REAL;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding height_mm column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN width_mm REAL;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding width_mm column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN markupPercent REAL DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding markupPercent column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN variable TEXT DEFAULT 'NO';`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding variable column:', err);
    }
  }

  // === Guarantee the quotations schema is complete before serving requests ===
  // The columns above are added via migrations; if one failed to apply to an
  // existing DB (e.g. a stale server process), UPDATE would throw
  // "no such column" while INSERT silently succeeds (create works, edit fails).
  // This verifies every expected column exists and force-adds any that are
  // missing, then logs proof. Wrapped so a PRAGMA failure can never break startup.
  try {
    const EXPECTED_QUOTATION_COLUMNS = [
      ['customerName', "TEXT NOT NULL DEFAULT ''"],
      ['contactPerson', 'TEXT'],
      ['email', 'TEXT'],
      ['phone', 'TEXT'],
      ['productType', "TEXT NOT NULL DEFAULT ''"],
      ['productDetails', 'TEXT'],
      ['quantity', 'INTEGER NOT NULL DEFAULT 0'],
      ['unitPrice', 'REAL NOT NULL DEFAULT 0'],
      ['total', 'REAL NOT NULL DEFAULT 0'],
      ['notes', 'TEXT'],
      ['type', "TEXT DEFAULT 'non email'"],
      ['sourceEmailUid', 'INTEGER'],
      ['sourceEmailSubject', 'TEXT'],
      ['sourceEmailMessageId', 'TEXT'],
      ['profileImagePath', 'TEXT'],
      ['attachmentPaths', 'TEXT'],
      ['dateCreated', "TEXT NOT NULL DEFAULT ''"],
      ['dateRevised', 'TEXT'],
      ['status', "TEXT NOT NULL DEFAULT 'draft'"],
      ['resendCount', 'INTEGER DEFAULT 0'],
      ['outsourcingSeq', 'TEXT'],
      ['selectedSupplierId', 'INTEGER'],
      ['selectedSupplierResponseId', 'INTEGER'],
      ['sampleReadyDate', 'TEXT'],
      ['brandId', 'INTEGER'],
      ['profileImageBlob', 'BLOB'],
      ['profileImageMime', 'TEXT'],
      ['customerItemName', 'TEXT'],
      ['chaseSampleCount', 'INTEGER DEFAULT 0'],
      ['resubmitCount', 'INTEGER DEFAULT 0'],
      ['quotationSeq', 'TEXT'],
      ['height_mm', 'REAL'],
      ['width_mm', 'REAL'],
      ['markupPercent', 'REAL DEFAULT 0'],
      ['variable', "TEXT DEFAULT 'NO'"]
    ];
    const cols = await db.all(`PRAGMA table_info(quotations);`);
    const present = new Set(cols.map(c => c.name.toLowerCase()));
    console.log(`[schema] quotations columns present (${cols.length}): ${cols.map(c => c.name).join(', ')}`);
    const missing = EXPECTED_QUOTATION_COLUMNS.filter(([name]) => !present.has(name.toLowerCase()));
    if (missing.length > 0) {
      console.warn(`[schema] quotations MISSING columns (force-adding): ${missing.map(([n]) => n).join(', ')}`);
      for (const [name, def] of missing) {
        try {
          await db.exec(`ALTER TABLE quotations ADD COLUMN ${name} ${def};`);
        } catch (err) {
          if (!err.message.includes('duplicate column name')) {
            console.warn(`[schema] Failed to add missing column ${name}:`, err);
          }
        }
      }
      const colsAfter = await db.all(`PRAGMA table_info(quotations);`);
      console.log(`[schema] quotations columns after self-heal (${colsAfter.length}): ${colsAfter.map(c => c.name).join(', ')}`);
    } else {
      console.log('[schema] quotations schema complete; no columns missing.');
    }
  } catch (verifyErr) {
    console.warn('[schema] quotations verification/self-heal failed (non-fatal):', verifyErr);
  }

  // Backfill quotationSeq for existing regular quotations (non-outsourcing)
  try {
    const existingSeqs = await db.all(`SELECT id FROM quotations WHERE quotationSeq IS NULL AND productType NOT IN ('other', 'others', 'outsource') ORDER BY id ASC`);
    if (existingSeqs.length > 0) {
      const maxRow = await db.get(`SELECT MAX(CAST(REPLACE(quotationSeq, 'IP', '') AS INTEGER)) as maxSeq FROM quotations WHERE quotationSeq IS NOT NULL`);
      let nextSeq = (maxRow && maxRow.maxSeq ? maxRow.maxSeq : 0) + 1;
      for (const row of existingSeqs) {
        const seq = 'IP' + String(nextSeq).padStart(7, '0');
        await db.run(`UPDATE quotations SET quotationSeq = ? WHERE id = ?`, [seq, row.id]);
        nextSeq++;
      }
      console.log(`Backfilled quotationSeq for ${existingSeqs.length} existing quotations`);
    }
  } catch (err) {
    console.warn('Error backfilling quotationSeq:', err);
  }

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS quotation_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotationId INTEGER NOT NULL,
        fromStatus TEXT,
        toStatus TEXT NOT NULL,
        changedAt TEXT NOT NULL,
        note TEXT,
        FOREIGN KEY (quotationId) REFERENCES quotations(id) ON DELETE CASCADE
      );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_qsh_quotationId ON quotation_status_history(quotationId);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_qsh_changedAt ON quotation_status_history(changedAt DESC);`);

    // Add note column if it doesn't exist (migration for existing DBs)
    try {
      await db.exec(`ALTER TABLE quotation_status_history ADD COLUMN note TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
  } catch (err) {
    console.warn('Error creating quotation_status_history table:', err);
  }

  // Migrate profiles: add customerName and contactPerson columns if missing
  try {
    await db.exec(`ALTER TABLE profiles ADD COLUMN customerName TEXT NOT NULL DEFAULT ''`);
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      console.warn('Error adding customerName column:', e);
    }
  }
  try {
    await db.exec(`ALTER TABLE profiles ADD COLUMN contactPerson TEXT NOT NULL DEFAULT ''`);
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      console.warn('Error adding contactPerson column:', e);
    }
  }

  try {
    const legacyTierProfiles = await db.all(
      `SELECT id, name, specs, createdAt, updatedAt
       FROM product_profiles
       WHERE productType = 'pricing-tier'
         AND id NOT IN (
           SELECT COALESCE(sourceProfileId, -1)
           FROM pricing_tier_tables
           WHERE sourceProfileId IS NOT NULL
         )`
    );

    for (const profile of legacyTierProfiles) {
      let specs = {};
      try {
        specs = typeof profile.specs === 'string' ? JSON.parse(profile.specs || '{}') : (profile.specs || {});
      } catch (e) {
        specs = {};
      }

      const scope = specs.scope === 'customer' ? 'customer' : 'brand';
      const createdAt = profile.createdAt || new Date().toISOString();
      const updatedAt = profile.updatedAt || createdAt;
      const header = await db.run(
        `INSERT INTO pricing_tier_tables
         (name, scope, brandId, brandName, customerId, customerName, disabled, sourceProfileId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.name || 'Untitled',
          scope,
          specs.brandId || null,
          specs.brandName || null,
          specs.customerId || null,
          specs.customerName || null,
          specs.disabled ? 1 : 0,
          profile.id,
          createdAt,
          updatedAt
        ]
      );

      const tiers = Array.isArray(specs.tiers) ? specs.tiers : [];
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i] || {};
        const quantity = parseInt(tier.quantity ?? tier.qty ?? 0, 10) || 0;
        const unitPrice = parseFloat(tier.unitPrice ?? tier.price ?? 0) || 0;
        if (quantity <= 0) continue;
        await db.run(
          `INSERT INTO pricing_tier_table_rows
           (tableId, quantity, unitPrice, sortOrder, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [header.lastID, quantity, unitPrice, i, createdAt, updatedAt]
        );
      }
    }
  } catch (err) {
    console.warn('Error migrating legacy pricing tier tables:', err);
  }
}

export async function getTasksDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const filename = resolveDbPath();
      await fs.mkdir(path.dirname(filename), { recursive: true });
      const db = await open({
        filename,
        driver: sqlite3.Database,
      });
      await ensureSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function resetTasksDbForTest() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.close();
    } catch (_) {
      // ignore close errors during test reset
    }
    dbPromise = null;
  }
}

/**
 * Seed profiles from profiles.json into SQL.
 * Merges missing profiles — does not delete or overwrite existing SQL rows.
 */
export async function seedProfilesFromJson() {
  try {
    const jsonPath = path.join(projectRoot, 'profiles.json');
    const raw = await fs.readFile(jsonPath, 'utf8');
    const profiles = JSON.parse(raw);
    if (!Array.isArray(profiles) || profiles.length === 0) return;

    const db = await getTasksDb();
    const existing = await db.all(`SELECT mailUser FROM profiles`);
    const existingEmails = new Set(existing.map(r => r.mailUser));

    const now = new Date().toISOString();
    let added = 0;
    for (const p of profiles) {
      // Skip if this mailUser already exists in SQL
      if (p.mailUser && existingEmails.has(p.mailUser)) continue;

      await db.run(
        `INSERT INTO profiles (name, remark, customerName, contactPerson, mailUser, mailPass, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpSecure, port, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.name || 'Unnamed',
          p.remark || '',
          p.customerName || '',
          p.contactPerson || '',
          p.mailUser || '',
          p.mailPass || '',
          p.imapHost || '',
          Number(p.imapPort) || 993,
          p.imapTls || 'true',
          p.smtpHost || '',
          Number(p.smtpPort) || 465,
          p.smtpSecure || 'true',
          Number(p.port) || 3001,
          p.isActive ? 1 : 0,
          now,
          now
        ]
      );
      added++;
    }
    if (added > 0) {
      console.log(`Seeded ${added} profile(s) from profiles.json into SQL`);
    }
  } catch (err) {
    console.warn('Could not seed profiles from JSON:', err.message);
  }
}

export const TASK_STATUS = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  REPLIED: 'replied',
  FOLLOW_UP: 'follow_up',
  CLOSED: 'closed',
};

export async function createTask({
  type,
  status = TASK_STATUS.NEW,
  sourceEmailUid = null,
  sourceSubject = null,
  customerEmail = null,
  notes = null,
} = {}) {
  if (!type || typeof type !== 'string') {
    throw new Error('Task type is required');
  }

  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO tasks (type, status, sourceEmailUid, sourceSubject, customerEmail, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [type, status, sourceEmailUid, sourceSubject, customerEmail, notes, now, now]
  );

  return await db.get(`SELECT * FROM tasks WHERE id = ?`, [result.lastID]);
}

export async function listTasks({ status } = {}) {
  const db = await getTasksDb();
  if (status) {
    return await db.all(
      `SELECT * FROM tasks WHERE status = ? ORDER BY id DESC`,
      [status]
    );
  }
  return await db.all(`SELECT * FROM tasks ORDER BY id DESC`);
}

export async function getTaskById(id) {
  const db = await getTasksDb();
  return await db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
}

export async function updateTaskStatus(id, status) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ?`,
    [status, now, id]
  );
  return await getTaskById(id);
}

// Profile management functions
export async function getProfiles() {
  const db = await getTasksDb();
  return await db.all(`SELECT * FROM profiles ORDER BY id ASC`);
}

export async function createProfile(profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO profiles (name, remark, customerName, contactPerson, mailUser, mailPass, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpSecure, port, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      profileData.name,
      profileData.remark || '',
      profileData.customerName || '',
      profileData.contactPerson || '',
      profileData.mailUser,
      profileData.mailPass,
      profileData.imapHost,
      profileData.imapPort || 993,
      profileData.imapTls || 'true',
      profileData.smtpHost,
      profileData.smtpPort || 465,
      profileData.smtpSecure || 'true',
      profileData.port || 3001,
      profileData.isActive || 0,
      now,
      now
    ]
  );

  return await db.get(`SELECT * FROM profiles WHERE id = ?`, [result.lastID]);
}

export async function updateProfile(id, profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE profiles SET
        name = ?,
        remark = ?,
        customerName = ?,
        contactPerson = ?,
        mailUser = ?,
        mailPass = ?,
        imapHost = ?,
        imapPort = ?,
        imapTls = ?,
        smtpHost = ?,
        smtpPort = ?,
        smtpSecure = ?,
        port = ?,
        isActive = ?,
        updatedAt = ?
      WHERE id = ?
    `,
    [
      profileData.name,
      profileData.remark || '',
      profileData.customerName || '',
      profileData.contactPerson || '',
      profileData.mailUser,
      profileData.mailPass,
      profileData.imapHost,
      profileData.imapPort || 993,
      profileData.imapTls || 'true',
      profileData.smtpHost,
      profileData.smtpPort || 465,
      profileData.smtpSecure || 'true',
      profileData.port || 3001,
      profileData.isActive || 0,
      now,
      id
    ]
  );

  return await db.get(`SELECT * FROM profiles WHERE id = ?`, [id]);
}

export async function deleteProfile(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM profiles WHERE id = ?`, [id]);
}

export async function activateProfile(id) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  // First, set all profiles to inactive
  await db.run(`UPDATE profiles SET isActive = 0, updatedAt = ?`, [now]);

  // Then activate the specified profile
  await db.run(`UPDATE profiles SET isActive = 1, updatedAt = ? WHERE id = ?`, [now, id]);
}

// Sent emails management functions
export async function createSentEmail({
  to_email,
  subject,
  body_text,
  body_html,
  message_id,
  smtp_response,
  status = 'sent',
  error_message = null,
  sender_email = null,
  profile_id = null,
}) {
  if (!to_email || !subject) {
    throw new Error('to_email and subject are required');
  }

  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO sent_emails (to_email, subject, body_text, body_html, message_id, smtp_response, status, error_message, sent_at, sender_email, profile_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [to_email, subject, body_text, body_html, message_id, smtp_response, status, error_message, now, sender_email, profile_id, now]
  );

  return await db.get(`SELECT * FROM sent_emails WHERE id = ?`, [result.lastID]);
}

export async function listSentEmails({ limit = 50, offset = 0, profile_id, sender_email } = {}) {
  const db = await getTasksDb();
  let query = `SELECT se.*, p.name as profile_name FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id`;
  let params = [];

  let whereClause = [];
  if (profile_id !== undefined) {
    whereClause.push(`se.profile_id = ?`);
    params.push(profile_id);
  }

  if (sender_email) {
    whereClause.push(`se.sender_email = ?`);
    params.push(sender_email);
  }

  if (whereClause.length > 0) {
    query += ` WHERE ` + whereClause.join(' AND ');
  }

  query += ` ORDER BY se.sent_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return await db.all(query, params);
}

export async function getSentEmailById(id) {
  const db = await getTasksDb();
  return await db.get(
    `SELECT se.*, p.name as profile_name FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id WHERE se.id = ?`,
    [id]
  );
}

export async function getSentEmailsCount({ profile_id, sender_email } = {}) {
  const db = await getTasksDb();
  let query = `SELECT COUNT(*) as count FROM sent_emails se LEFT JOIN profiles p ON se.profile_id = p.id`;
  let params = [];

  let whereClause = [];
  if (profile_id !== undefined) {
    whereClause.push(`se.profile_id = ?`);
    params.push(profile_id);
  }

  if (sender_email) {
    whereClause.push(`se.sender_email = ?`);
    params.push(sender_email);
  }

  if (whereClause.length > 0) {
    query += ` WHERE ` + whereClause.join(' AND ');
  }

  const result = await db.get(query, params);
  return result.count;
}

// ========== CUSTOMER FUNCTIONS ==========

export async function createCustomer(customerData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO customers (companyName, emailDomain, companyAddress, companyTel, companyType, companyWebsite, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      customerData.companyName,
      customerData.emailDomain,
      customerData.companyAddress || null,
      customerData.companyTel || null,
      customerData.companyType,
      customerData.companyWebsite || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function getCustomerById(id) {
  const db = await getTasksDb();
  const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [id]);

  if (customer) {
    // Get members
    const members = await db.all(`SELECT * FROM customer_members WHERE customerId = ? ORDER BY name`, [id]);
    customer.members = members;
  }

  return customer;
}

export async function getAllCustomers() {
  const db = await getTasksDb();
  const customers = await db.all(`SELECT * FROM customers ORDER BY companyName`);

  // Get members for each customer
  for (const customer of customers) {
    const members = await db.all(`SELECT * FROM customer_members WHERE customerId = ? ORDER BY name`, [customer.id]);
    customer.members = members;
  }

  return customers;
}

export async function updateCustomer(id, customerData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE customers
      SET companyName = ?, emailDomain = ?, companyAddress = ?, companyTel = ?, companyType = ?, companyWebsite = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      customerData.companyName,
      customerData.emailDomain,
      customerData.companyAddress || null,
      customerData.companyTel || null,
      customerData.companyType,
      customerData.companyWebsite || null,
      now,
      id
    ]
  );

  // Sync members if provided
  if (customerData.members && Array.isArray(customerData.members)) {
    // Get current members from DB
    const currentMembers = await db.all(`SELECT id FROM customer_members WHERE customerId = ?`, [id]);
    const currentIds = currentMembers.map(m => m.id);
    const sentIds = customerData.members.filter(m => m.id).map(m => Number(m.id));

    // Delete members no longer in the list
    const toDelete = currentIds.filter(mid => !sentIds.includes(mid));
    for (const delId of toDelete) {
      await db.run(`DELETE FROM customer_members WHERE id = ?`, [delId]);
    }

    // Upsert each member
    for (const member of customerData.members) {
      if (member.id) {
        // Update existing
        await db.run(
          `UPDATE customer_members SET name = ?, emailPrefix = ?, title = ?, tel = ?, updatedAt = ? WHERE id = ? AND customerId = ?`,
          [member.name, member.emailPrefix || null, member.title || null, member.tel || null, now, Number(member.id), id]
        );
      } else {
        // Create new
        await db.run(
          `INSERT INTO customer_members (customerId, name, emailPrefix, title, tel, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, member.name, member.emailPrefix || null, member.title || null, member.tel || null, now, now]
        );
      }
    }
  }

  return true;
}

export async function deleteCustomer(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM customers WHERE id = ?`, [id]);
  return true;
}

export async function createCustomerMember(customerId, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO customer_members (customerId, name, emailPrefix, title, tel, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      customerId,
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function updateCustomerMember(id, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE customer_members
      SET name = ?, emailPrefix = ?, title = ?, tel = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      id
    ]
  );

  return true;
}

export async function deleteCustomerMember(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM customer_members WHERE id = ?`, [id]);
  return true;
}

// Find customer and member by email address
export async function findCustomerByEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return null;
  }

  const db = await getTasksDb();
  const emailParts = email.split('@');
  const emailPrefix = emailParts[0];
  const emailDomain = emailParts[1];

  // Search by domain
  const customer = await db.get(
    `SELECT * FROM customers WHERE emailDomain = ?`,
    [emailDomain]
  );

  if (customer) {
    // Search for specific member by email prefix
    const member = await db.get(
      `SELECT * FROM customer_members
       WHERE customerId = ? AND emailPrefix = ?`,
      [customer.id, emailPrefix]
    );

    // Get all members for this customer
    const allMembers = await db.all(
      `SELECT * FROM customer_members WHERE customerId = ? ORDER BY name`,
      [customer.id]
    );

    return {
      customer,
      member: member || null,
      allMembers
    };
  }

  return null;
}

// ========== QUOTATION FUNCTIONS ==========

export async function createQuotation(quotationData) {
  const db = await getTasksDb();

  const isOutsourcing = (quotationData.productType === 'other' || quotationData.productType === 'others' || quotationData.productType === 'outsource');

  // Auto-generate quotationSeq (IP) for regular quotations
  let quotationSeq = quotationData.quotationSeq || null;
  if (!isOutsourcing && !quotationSeq) {
    const seqRow = await db.get(`SELECT MAX(CAST(REPLACE(quotationSeq, 'IP', '') AS INTEGER)) as maxSeq FROM quotations WHERE quotationSeq IS NOT NULL`);
    const nextSeq = (seqRow && seqRow.maxSeq ? seqRow.maxSeq : 0) + 1;
    quotationSeq = 'IP' + String(nextSeq).padStart(7, '0');
  }

  // Auto-generate OS Ref for outsourcing quotations
  let outsourcingSeq = quotationData.outsourcingSeq || null;
  if (isOutsourcing && !outsourcingSeq) {
    const row = await db.get(`SELECT MAX(CAST(REPLACE(outsourcingSeq, 'OS', '') AS INTEGER)) as maxSeq FROM quotations WHERE outsourcingSeq IS NOT NULL`);
    const nextSeq = (row && row.maxSeq ? row.maxSeq : 0) + 1;
    outsourcingSeq = 'OS' + String(nextSeq).padStart(7, '0');
  }

  const result = await db.run(
    `
      INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, outsourcingSeq, quotationSeq, brandId, customerItemName, height_mm, width_mm, variable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      quotationData.customerName,
      quotationData.contactPerson || null,
      quotationData.email || null,
      quotationData.phone || null,
      quotationData.productType,
      JSON.stringify(quotationData.productDetails || {}),
      quotationData.quantity,
      quotationData.unitPrice,
      quotationData.total,
      quotationData.notes || null,
      quotationData.type || 'non email',
      quotationData.sourceEmailUid || null,
      quotationData.sourceEmailSubject || null,
      quotationData.sourceEmailMessageId || null,
      quotationData.profileImagePath || null,
      JSON.stringify(quotationData.attachmentPaths || []),
      quotationData.dateCreated,
      quotationData.status || 'draft',
      outsourcingSeq,
      quotationSeq,
      quotationData.brandId || null,
      quotationData.customerItemName || null,
      quotationData.height_mm || null,
      quotationData.width_mm || null,
      quotationData.variable || 'NO'
    ]
  );

  return result.lastID;
}

export async function getQuotationById(id) {
  const db = await getTasksDb();
  // Exclude profileImageBlob from general queries to avoid transferring large BLOB data
  const quotation = await db.get(
    `SELECT id, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, dateRevised, status, resendCount, outsourcingSeq, quotationSeq, selectedSupplierId, selectedSupplierResponseId, sampleReadyDate, brandId, profileImageMime, customerItemName, chaseSampleCount, resubmitCount, height_mm, width_mm, variable, CASE WHEN profileImageBlob IS NOT NULL THEN 1 ELSE 0 END as hasProfileImage FROM quotations WHERE id = ?`,
    [id]
  );

  if (quotation) {
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
    quotation.attachmentPaths = JSON.parse(quotation.attachmentPaths || '[]');
  }

  return quotation;
}

export async function getAllQuotations() {
  const db = await getTasksDb();
  // Exclude profileImageBlob from general queries to avoid transferring large BLOB data
  const quotations = await db.all(
    `SELECT id, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, dateRevised, status, resendCount, outsourcingSeq, quotationSeq, selectedSupplierId, selectedSupplierResponseId, sampleReadyDate, brandId, profileImageMime, customerItemName, chaseSampleCount, resubmitCount, height_mm, width_mm, variable, CASE WHEN profileImageBlob IS NOT NULL THEN 1 ELSE 0 END as hasProfileImage FROM quotations ORDER BY dateCreated DESC`
  );

  // Parse JSON fields
  for (const quotation of quotations) {
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
    quotation.attachmentPaths = JSON.parse(quotation.attachmentPaths || '[]');
  }

  return quotations;
}

export async function updateQuotation(id, quotationData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE quotations
      SET customerName = ?, contactPerson = ?, email = ?, phone = ?, productType = ?, productDetails = ?, quantity = ?, unitPrice = ?, total = ?, notes = ?, type = ?, sourceEmailUid = ?, sourceEmailSubject = ?, sourceEmailMessageId = ?, profileImagePath = ?, attachmentPaths = ?, status = ?, resendCount = ?, outsourcingSeq = ?, quotationSeq = ?, selectedSupplierId = ?, selectedSupplierResponseId = ?, sampleReadyDate = ?, brandId = ?, customerItemName = ?, chaseSampleCount = ?, resubmitCount = ?, height_mm = ?, width_mm = ?, variable = ?, dateRevised = ?
      WHERE id = ?
    `,
    [
      quotationData.customerName,
      quotationData.contactPerson || null,
      quotationData.email || null,
      quotationData.phone || null,
      quotationData.productType,
      JSON.stringify(quotationData.productDetails || {}),
      quotationData.quantity,
      quotationData.unitPrice,
      quotationData.total,
      quotationData.notes || null,
      quotationData.type || 'non email',
      quotationData.sourceEmailUid || null,
      quotationData.sourceEmailSubject || null,
      quotationData.sourceEmailMessageId || null,
      quotationData.profileImagePath || null,
      JSON.stringify(quotationData.attachmentPaths || []),
      quotationData.status || 'draft',
      quotationData.resendCount || 0,
      quotationData.outsourcingSeq || null,
      quotationData.quotationSeq || null,
      quotationData.selectedSupplierId || null,
      quotationData.selectedSupplierResponseId || null,
      quotationData.sampleReadyDate || null,
      quotationData.brandId || null,
      quotationData.customerItemName || null,
      quotationData.chaseSampleCount || 0,
      quotationData.resubmitCount || 0,
      quotationData.height_mm !== undefined ? quotationData.height_mm : null,
      quotationData.width_mm !== undefined ? quotationData.width_mm : null,
      quotationData.variable || 'NO',
      now,
      id
    ]
  );

  return true;
}

export async function updateQuotationProfileImage(id, imageBlob, mimeType) {
  const db = await getTasksDb();
  await db.run(
    `UPDATE quotations SET profileImageBlob = ?, profileImageMime = ? WHERE id = ?`,
    [imageBlob, mimeType, id]
  );
  return true;
}

export async function getQuotationProfileImage(id) {
  const db = await getTasksDb();
  const row = await db.get(
    `SELECT profileImageBlob, profileImageMime FROM quotations WHERE id = ?`,
    [id]
  );
  return row;
}

export async function deleteQuotation(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM quotations WHERE id = ?`, [id]);
  return true;
}

// ========== STATUS HISTORY FUNCTIONS ==========

export async function logStatusChange(quotationId, fromStatus, toStatus, note = null) {
  const db = await getTasksDb();
  const changedAt = new Date().toISOString();
  await db.run(
    `INSERT INTO quotation_status_history (quotationId, fromStatus, toStatus, changedAt, note) VALUES (?, ?, ?, ?, ?)`,
    [quotationId, fromStatus || null, toStatus, changedAt, note]
  );
  return true;
}

export async function getStatusHistory(quotationId) {
  const db = await getTasksDb();
  const rows = await db.all(
    `SELECT id, quotationId, fromStatus, toStatus, changedAt, note FROM quotation_status_history WHERE quotationId = ? ORDER BY changedAt ASC`,
    [quotationId]
  );
  return rows;
}

export async function getBulkStatusHistory(quotationIds) {
  const db = await getTasksDb();
  if (quotationIds.length === 0) return {};
  const placeholders = quotationIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT id, quotationId, fromStatus, toStatus, changedAt, note FROM quotation_status_history WHERE quotationId IN (${placeholders}) ORDER BY changedAt ASC`,
    quotationIds
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.quotationId]) map[row.quotationId] = [];
    map[row.quotationId].push(row);
  }
  return map;
}

// ========== SKILL FUNCTIONS ==========

export async function createSkill(skillData) {
  const db = await getTasksDb();

  const result = await db.run(
    `
      INSERT INTO skills (name, description, version, status, created, updated, tags, components, features, dependencies, data_structure, ui_components)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      skillData.name,
      skillData.description || null,
      skillData.version,
      skillData.status,
      skillData.created,
      skillData.updated,
      JSON.stringify(skillData.tags || []),
      JSON.stringify(skillData.components || {}),
      JSON.stringify(skillData.features || []),
      JSON.stringify(skillData.dependencies || []),
      JSON.stringify(skillData.data_structure || {}),
      JSON.stringify(skillData.ui_components || {})
    ]
  );

  return result.lastID;
}

export async function getSkillById(id) {
  const db = await getTasksDb();
  const skill = await db.get(`SELECT * FROM skills WHERE id = ?`, [id]);

  if (skill) {
    // Parse JSON fields
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skill;
}

export async function getSkillByName(name) {
  const db = await getTasksDb();
  const skill = await db.get(`SELECT * FROM skills WHERE name = ?`, [name]);

  if (skill) {
    // Parse JSON fields
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skill;
}

export async function getAllSkills() {
  const db = await getTasksDb();
  const skills = await db.all(`SELECT * FROM skills ORDER BY updated DESC`);

  // Parse JSON fields
  for (const skill of skills) {
    skill.tags = JSON.parse(skill.tags || '[]');
    skill.components = JSON.parse(skill.components || '{}');
    skill.features = JSON.parse(skill.features || '[]');
    skill.dependencies = JSON.parse(skill.dependencies || '[]');
    skill.data_structure = JSON.parse(skill.data_structure || '{}');
    skill.ui_components = JSON.parse(skill.ui_components || '{}');
  }

  return skills;
}

export async function updateSkill(id, skillData) {
  const db = await getTasksDb();

  await db.run(
    `
      UPDATE skills
      SET name = ?, description = ?, version = ?, status = ?, updated = ?, tags = ?, components = ?, features = ?, dependencies = ?, data_structure = ?, ui_components = ?
      WHERE id = ?
    `,
    [
      skillData.name,
      skillData.description || null,
      skillData.version,
      skillData.status,
      skillData.updated,
      JSON.stringify(skillData.tags || []),
      JSON.stringify(skillData.components || {}),
      JSON.stringify(skillData.features || []),
      JSON.stringify(skillData.dependencies || []),
      JSON.stringify(skillData.data_structure || {}),
      JSON.stringify(skillData.ui_components || {}),
      id
    ]
  );

  return true;
}

export async function deleteSkill(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM skills WHERE id = ?`, [id]);
  return true;
}

export async function getSkillsStats() {
  const db = await getTasksDb();
  const stats = await db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as inProgress,
      SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned
    FROM skills
  `);

  return {
    total: stats.total || 0,
    completed: stats.completed || 0,
    inProgress: stats.inProgress || 0,
    planned: stats.planned || 0
  };
}

// ========== SUPPLIER FUNCTIONS ==========

export async function createSupplier(supplierData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO suppliers (companyName, emailDomain, companyAddress, companyTel, companyType, companyWebsite, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      supplierData.companyName,
      supplierData.emailDomain,
      supplierData.companyAddress || null,
      supplierData.companyTel || null,
      supplierData.companyType,
      supplierData.companyWebsite || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function getSupplierById(id) {
  const db = await getTasksDb();
  const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [id]);

  if (supplier) {
    // Get members
    const members = await db.all(`SELECT * FROM supplier_members WHERE supplierId = ? ORDER BY name`, [id]);
    supplier.members = members;
  }

  return supplier;
}

export async function getAllSuppliers() {
  const db = await getTasksDb();
  const suppliers = await db.all(`SELECT * FROM suppliers ORDER BY companyName`);

  // Get members for each supplier
  for (const supplier of suppliers) {
    const members = await db.all(`SELECT * FROM supplier_members WHERE supplierId = ? ORDER BY name`, [supplier.id]);
    supplier.members = members;
  }

  return suppliers;
}

export async function updateSupplier(id, supplierData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE suppliers
      SET companyName = ?, emailDomain = ?, companyAddress = ?, companyTel = ?, companyType = ?, companyWebsite = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      supplierData.companyName,
      supplierData.emailDomain,
      supplierData.companyAddress || null,
      supplierData.companyTel || null,
      supplierData.companyType,
      supplierData.companyWebsite || null,
      now,
      id
    ]
  );

  return true;
}

export async function deleteSupplier(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM suppliers WHERE id = ?`, [id]);
  return true;
}

export async function createSupplierMember(supplierId, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `
      INSERT INTO supplier_members (supplierId, name, emailPrefix, title, tel, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      supplierId,
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      now
    ]
  );

  return result.lastID;
}

export async function updateSupplierMember(id, memberData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `
      UPDATE supplier_members
      SET name = ?, emailPrefix = ?, title = ?, tel = ?, updatedAt = ?
      WHERE id = ?
    `,
    [
      memberData.name,
      memberData.emailPrefix || null,
      memberData.title || null,
      memberData.tel || null,
      now,
      id
    ]
  );

  return true;
}

export async function deleteSupplierMember(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM supplier_members WHERE id = ?`, [id]);
  return true;
}

export async function findSupplierByEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return null;
  }

  const db = await getTasksDb();
  const emailParts = email.split('@');
  const emailPrefix = emailParts[0];
  const emailDomain = emailParts[1];

  // Search by domain
  const supplier = await db.get(
    `SELECT * FROM suppliers WHERE emailDomain = ?`,
    [emailDomain]
  );

  if (supplier) {
    // Search for specific member by email prefix
    const member = await db.get(
      `SELECT * FROM supplier_members
       WHERE supplierId = ? AND emailPrefix = ?`,
      [supplier.id, emailPrefix]
    );

    // Get all members for this supplier
    const allMembers = await db.all(
      `SELECT * FROM supplier_members WHERE supplierId = ? ORDER BY name`,
      [supplier.id]
    );

    return {
      supplier,
      member: member || null,
      allMembers
    };
  }

  return null;
}

// Quotation-Supplier linking functions
export async function linkSupplierToQuotation(quotationId, supplierId) {
  const db = await getTasksDb();
  const createdAt = new Date().toISOString();
  const result = await db.run(
    'INSERT OR IGNORE INTO quotation_suppliers (quotationId, supplierId, createdAt) VALUES (?, ?, ?)',
    [quotationId, supplierId, createdAt]
  );
  return result.lastID;
}

export async function unlinkSupplierFromQuotation(quotationId, supplierId) {
  const db = await getTasksDb();
  await db.run(
    'DELETE FROM quotation_suppliers WHERE quotationId = ? AND supplierId = ?',
    [quotationId, supplierId]
  );
  return true;
}

export async function getSuppliersForQuotation(quotationId) {
  const db = await getTasksDb();
  const suppliers = await db.all(`
    SELECT s.*, qs.createdAt as linkedAt
    FROM suppliers s
    INNER JOIN quotation_suppliers qs ON s.id = qs.supplierId
    WHERE qs.quotationId = ?
    ORDER BY qs.createdAt DESC
  `, [quotationId]);

  // Load members for each supplier
  for (const supplier of suppliers) {
    supplier.members = await db.all(
      'SELECT * FROM supplier_members WHERE supplierId = ? ORDER BY name',
      [supplier.id]
    );
  }

  return suppliers;
}

export async function getQuotationsForSupplier(supplierId) {
  const db = await getTasksDb();
  return await db.all(`
    SELECT q.*, qs.createdAt as linkedAt
    FROM quotations q
    INNER JOIN quotation_suppliers qs ON q.id = qs.quotationId
    WHERE qs.supplierId = ?
    ORDER BY q.dateCreated DESC
  `, [supplierId]);
}


// ========== BRAND FUNCTIONS ==========

export async function createBrand(brandData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const result = await db.run(
    `INSERT INTO brands (name, address, logoPath, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [brandData.name, brandData.address || null, brandData.logoPath || null, now, now]
  );

  return result.lastID;
}

export async function getBrandById(id) {
  const db = await getTasksDb();
  return await db.get(`SELECT * FROM brands WHERE id = ?`, [id]);
}

export async function getAllBrands() {
  const db = await getTasksDb();
  return await db.all(`SELECT * FROM brands ORDER BY name`);
}

export async function updateBrand(id, brandData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  await db.run(
    `UPDATE brands SET name = ?, address = ?, logoPath = ?, updatedAt = ? WHERE id = ?`,
    [brandData.name, brandData.address || null, brandData.logoPath || null, now, id]
  );

  return true;
}

export async function deleteBrand(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM brands WHERE id = ?`, [id]);
  return true;
}

// ========== Product Profile Functions ==========

export async function createProductProfile(profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  const specs = typeof profileData.specs === 'string' ? profileData.specs : JSON.stringify(profileData.specs || {});

  const result = await db.run(
    `INSERT INTO product_profiles (name, productType, specs, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [profileData.name, profileData.productType, specs, profileData.notes || null, now, now]
  );

  return result.lastID;
}

export async function getProductProfileById(id) {
  const db = await getTasksDb();
  const profile = await db.get(`SELECT * FROM product_profiles WHERE id = ?`, [id]);
  if (profile && profile.specs) {
    try { profile.specs = JSON.parse(profile.specs); } catch (e) { /* keep as string */ }
  }
  return profile;
}

export async function getAllProductProfiles() {
  const db = await getTasksDb();
  const profiles = await db.all(`SELECT * FROM product_profiles ORDER BY productType, name`);
  return profiles.map(p => {
    if (p.specs) { try { p.specs = JSON.parse(p.specs); } catch (e) { /* keep as string */ } }
    return p;
  });
}

export async function getProductProfilesByType(productType) {
  const db = await getTasksDb();
  const profiles = await db.all(`SELECT * FROM product_profiles WHERE productType = ? ORDER BY name`, [productType]);
  return profiles.map(p => {
    if (p.specs) { try { p.specs = JSON.parse(p.specs); } catch (e) { /* keep as string */ } }
    return p;
  });
}

export async function updateProductProfile(id, profileData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  const specs = typeof profileData.specs === 'string' ? profileData.specs : JSON.stringify(profileData.specs || {});

  await db.run(
    `UPDATE product_profiles SET name = ?, productType = ?, specs = ?, notes = ?, updatedAt = ? WHERE id = ?`,
    [profileData.name, profileData.productType, specs, profileData.notes || null, now, id]
  );

  return true;
}

export async function deleteProductProfile(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM product_profiles WHERE id = ?`, [id]);
  return true;
}

async function getPricingTierRows(db, tableId) {
  return await db.all(
    `SELECT id, quantity, unitPrice, sortOrder
     FROM pricing_tier_table_rows
     WHERE tableId = ?
     ORDER BY sortOrder ASC, id ASC`,
    [tableId]
  );
}

async function hydratePricingTierTable(db, row) {
  if (!row) return null;
  const tiers = await getPricingTierRows(db, row.id);
  return {
    ...row,
    disabled: !!row.disabled,
    tiers: tiers.map(t => ({
      id: t.id,
      quantity: t.quantity,
      unitPrice: Number(t.unitPrice),
      total: Number(t.quantity) * Number(t.unitPrice),
      sortOrder: t.sortOrder
    }))
  };
}

function normalizePricingTierTablePayload(data = {}) {
  const scope = data.scope === 'customer' ? 'customer' : 'brand';
  const tiers = Array.isArray(data.tiers) ? data.tiers : [];
  return {
    name: String(data.name || '').trim(),
    scope,
    brandId: scope === 'brand' && data.brandId ? Number(data.brandId) : null,
    brandName: scope === 'brand' ? (data.brandName || null) : null,
    customerId: scope === 'customer' && data.customerId ? Number(data.customerId) : null,
    customerName: scope === 'customer' ? (data.customerName || null) : null,
    disabled: data.disabled ? 1 : 0,
    tiers: tiers.map((tier, index) => ({
      quantity: parseInt(tier.quantity ?? tier.qty ?? 0, 10) || 0,
      unitPrice: parseFloat(tier.unitPrice ?? tier.price ?? 0) || 0,
      sortOrder: tier.sortOrder ?? index
    })).filter(tier => tier.quantity > 0)
  };
}

export async function createPricingTierTable(data) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  const payload = normalizePricingTierTablePayload(data);

  const result = await db.run(
    `INSERT INTO pricing_tier_tables
     (name, scope, brandId, brandName, customerId, customerName, disabled, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.name,
      payload.scope,
      payload.brandId,
      payload.brandName,
      payload.customerId,
      payload.customerName,
      payload.disabled,
      now,
      now
    ]
  );

  for (const tier of payload.tiers) {
    await db.run(
      `INSERT INTO pricing_tier_table_rows
       (tableId, quantity, unitPrice, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [result.lastID, tier.quantity, tier.unitPrice, tier.sortOrder, now, now]
    );
  }

  return result.lastID;
}

export async function getPricingTierTableById(id) {
  const db = await getTasksDb();
  const row = await db.get(`SELECT * FROM pricing_tier_tables WHERE id = ?`, [id]);
  return await hydratePricingTierTable(db, row);
}

export async function getAllPricingTierTables() {
  const db = await getTasksDb();
  const rows = await db.all(`SELECT * FROM pricing_tier_tables ORDER BY name COLLATE NOCASE ASC, id DESC`);
  const hydrated = [];
  for (const row of rows) {
    hydrated.push(await hydratePricingTierTable(db, row));
  }
  return hydrated;
}

export async function updatePricingTierTable(id, data) {
  const db = await getTasksDb();
  const now = new Date().toISOString();
  const payload = normalizePricingTierTablePayload(data);

  await db.run(
    `UPDATE pricing_tier_tables
     SET name = ?, scope = ?, brandId = ?, brandName = ?, customerId = ?, customerName = ?, disabled = ?, updatedAt = ?
     WHERE id = ?`,
    [
      payload.name,
      payload.scope,
      payload.brandId,
      payload.brandName,
      payload.customerId,
      payload.customerName,
      payload.disabled,
      now,
      id
    ]
  );

  await db.run(`DELETE FROM pricing_tier_table_rows WHERE tableId = ?`, [id]);
  for (const tier of payload.tiers) {
    await db.run(
      `INSERT INTO pricing_tier_table_rows
       (tableId, quantity, unitPrice, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, tier.quantity, tier.unitPrice, tier.sortOrder, now, now]
    );
  }

  return true;
}

export async function deletePricingTierTable(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM pricing_tier_tables WHERE id = ?`, [id]);
  return true;
}

// ─── Workshop CRUD ──────────────────────────────────────────────────────────

export async function createWorkshop(data) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const cols = [
    'fullCompanyName','tradingName','yearEstablished','companyType','legalStructure',
    'businessRegNumber','gstVatNumber','website','yearlyTurnover',
    'primaryContactName','primaryContactDesignation','mobileWhatsapp','emailAddress',
    'altContactPerson','companyAddress','googleMapLink',
    'country','cityProvince','factoryArea','numBuildings',
    'totalEmployees','numProductionWorkers','numQCStaff','numAdminSalesStaff',
    'productionCapabilities','departments','qualityCerts','sustainability',
    'capacityReliability','uploads',
    'howDidYouHear','existingRelationship','clientReferences',
    'declarationAccepted','digitalSignature','signatureDate',
    'status','createdAt','updatedAt'
  ];

  const vals = cols.map(c => {
    if (c === 'createdAt' || c === 'updatedAt') return now;
    if (c === 'status') return data.status || 'active';
    const v = data[c];
    if (v === undefined || v === null) return null;
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });

  const placeholders = cols.map(() => '?').join(', ');
  const result = await db.run(
    `INSERT INTO workshops (${cols.join(', ')}) VALUES (${placeholders})`,
    vals
  );
  return result.lastID;
}

export async function getWorkshopById(id) {
  const db = await getTasksDb();
  const w = await db.get(`SELECT * FROM workshops WHERE id = ?`, [id]);
  if (!w) return null;
  // Parse JSON fields
  ['productionCapabilities','departments','qualityCerts','sustainability','capacityReliability','uploads','clientReferences'].forEach(k => {
    if (w[k]) { try { w[k] = JSON.parse(w[k]); } catch(e) { /* keep as-is */ } }
  });
  return w;
}

export async function getAllWorkshops() {
  const db = await getTasksDb();
  const rows = await db.all(`SELECT * FROM workshops ORDER BY createdAt DESC`);
  rows.forEach(w => {
    ['productionCapabilities','departments','qualityCerts','sustainability','capacityReliability','uploads','clientReferences'].forEach(k => {
      if (w[k]) { try { w[k] = JSON.parse(w[k]); } catch(e) { /* keep as-is */ } }
    });
  });
  return rows;
}

export async function updateWorkshop(id, data) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const skip = ['id','createdAt','updatedAt'];
  const sets = [];
  const vals = [];

  for (const [k, v] of Object.entries(data)) {
    if (skip.includes(k)) continue;
    sets.push(`${k} = ?`);
    if (typeof v === 'object' && v !== null) {
      vals.push(JSON.stringify(v));
    } else {
      vals.push(v === undefined ? null : v);
    }
  }
  sets.push('updatedAt = ?');
  vals.push(now);
  vals.push(id);

  await db.run(`UPDATE workshops SET ${sets.join(', ')} WHERE id = ?`, vals);
  return true;
}

export async function deleteWorkshop(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM workshops WHERE id = ?`, [id]);
  return true;
}

// ─── Order CRUD ──────────────────────────────────────────────────────────

export async function createOrder(orderData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  // Auto-generate orderSeq (PO0000001)
  const seqRow = await db.get(
    `SELECT MAX(CAST(REPLACE(orderSeq, 'PO', '') AS INTEGER)) as maxSeq FROM orders`
  );
  const nextSeq = (seqRow && seqRow.maxSeq ? seqRow.maxSeq : 0) + 1;
  const orderSeq = 'PO' + String(nextSeq).padStart(7, '0');

  const result = await db.run(
    `INSERT INTO orders (
      orderSeq, quotationId, quotationType, quotationSeq,
      workshopId, workshopName, country,
      customerName, contactPerson, email, phone,
      productType, productDetails, quantity, unitPrice, total,
      customerItemName, brandId, status, dateCreated, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderSeq,
      orderData.quotationId,
      orderData.quotationType || 'quotation',
      orderData.quotationSeq || null,
      orderData.workshopId || null,
      orderData.workshopName || null,
      orderData.country || null,
      orderData.customerName,
      orderData.contactPerson || null,
      orderData.email || null,
      orderData.phone || null,
      orderData.productType,
      JSON.stringify(orderData.productDetails || {}),
      orderData.quantity,
      orderData.unitPrice,
      orderData.total,
      orderData.customerItemName || null,
      orderData.brandId || null,
      'pending',
      now,
      now,
      now
    ]
  );

  return { id: result.lastID, orderSeq };
}

export async function getOrderById(id) {
  const db = await getTasksDb();
  const order = await db.get(`SELECT * FROM orders WHERE id = ?`, [id]);
  if (order) {
    try { order.productDetails = JSON.parse(order.productDetails || '{}'); } catch (e) { order.productDetails = {}; }
  }
  return order;
}

export async function getOrderBySeq(orderSeq) {
  const db = await getTasksDb();
  const order = await db.get(`SELECT * FROM orders WHERE orderSeq = ?`, [orderSeq]);
  if (order) {
    try { order.productDetails = JSON.parse(order.productDetails || '{}'); } catch (e) { order.productDetails = {}; }
  }
  return order;
}

export async function getAllOrders() {
  const db = await getTasksDb();
  const orders = await db.all(`SELECT * FROM orders ORDER BY dateCreated DESC`);
  for (const order of orders) {
    try { order.productDetails = JSON.parse(order.productDetails || '{}'); } catch (e) { order.productDetails = {}; }
  }
  return orders;
}

export async function updateOrder(id, orderData) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const sets = [];
  const vals = [];
  const skip = ['id', 'orderSeq', 'quotationId', 'dateCreated', 'createdAt'];

  for (const [k, v] of Object.entries(orderData)) {
    if (skip.includes(k)) continue;
    sets.push(`${k} = ?`);
    if (k === 'productDetails' && typeof v === 'object') {
      vals.push(JSON.stringify(v));
    } else {
      vals.push(v === undefined ? null : v);
    }
  }
  sets.push('updatedAt = ?');
  vals.push(now);
  vals.push(id);

  await db.run(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, vals);
  return true;
}

export async function deleteOrder(id) {
  const db = await getTasksDb();
  await db.run(`DELETE FROM orders WHERE id = ?`, [id]);
  return true;
}

// ─── Order Progress Tracking ──────────────────────────────────────────

const VALID_DEPARTMENTS = [
  'CS Team', 'PMC', 'Material', 'Production',
  'Cut and Fold', 'QC', 'Shipment', 'Account'
];

export async function recordOrderDepartmentScan(orderSeq, department, notes = null) {
  const db = await getTasksDb();
  const now = new Date().toISOString();

  const order = await getOrderBySeq(orderSeq);
  if (!order) {
    return { error: 'Order not found', code: 404 };
  }

  const currentDeptIndex = VALID_DEPARTMENTS.indexOf(department);
  if (currentDeptIndex === -1) {
    return { error: `Invalid department: ${department}. Valid: ${VALID_DEPARTMENTS.join(', ')}`, code: 400 };
  }

  const lastScan = await getLastOrderScan(orderSeq);
  if (lastScan) {
    const lastDeptIndex = VALID_DEPARTMENTS.indexOf(lastScan.department);
    if (currentDeptIndex <= lastDeptIndex) {
      return {
        error: 'Cannot go back or repeat department',
        lastDepartment: lastScan.department,
        attemptedDepartment: department,
        code: 400
      };
    }
    if (currentDeptIndex > lastDeptIndex + 1) {
      return {
        error: `Cannot skip departments. Must follow sequence ${VALID_DEPARTMENTS.map((d, i) => `${i + 1}.${d}`).join(' → ')}`,
        nextExpected: VALID_DEPARTMENTS[lastDeptIndex + 1],
        code: 400
      };
    }
  } else if (department !== 'CS Team') {
    return {
      error: 'First scan must be CS Team',
      code: 400
    };
  }

  await db.run(
    `INSERT INTO order_progress_tracking (orderSeq, orderId, department, scannedAt, notes) VALUES (?, ?, ?, ?, ?)`,
    [orderSeq, order.id, department, now, notes]
  );

  await db.run(
    `UPDATE orders SET currentDepartment = ?, status = 'in-production', updatedAt = ? WHERE id = ?`,
    [department, now, order.id]
  );

  // If last department (Account), mark as completed
  if (department === 'Account') {
    await db.run(
      `UPDATE orders SET status = 'completed', updatedAt = ? WHERE id = ?`,
      [now, order.id]
    );
  }

  return { success: true, orderSeq, department, scannedAt: now };
}

export async function getOrderProgress(orderSeq) {
  const db = await getTasksDb();
  return await db.all(
    `SELECT * FROM order_progress_tracking WHERE orderSeq = ? ORDER BY scannedAt ASC`,
    [orderSeq]
  );
}

export async function getLastOrderScan(orderSeq) {
  const db = await getTasksDb();
  return await db.get(
    `SELECT * FROM order_progress_tracking WHERE orderSeq = ? ORDER BY scannedAt DESC LIMIT 1`,
    [orderSeq]
  );
}
