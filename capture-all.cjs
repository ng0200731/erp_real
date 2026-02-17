const { chromium } = require('playwright');
const path = require('path');

const FOLDER = path.join(__dirname, 'capture', '20260212-222007');
const URL = 'http://localhost:3001/';
const WAIT = 1500;

async function goToPanel(context, menuActions) {
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  for (const act of menuActions) {
    if (act.click) await page.click(act.click);
    if (act.wait) await page.waitForTimeout(act.wait);
  }
  await page.waitForTimeout(WAIT);
  return page;
}

async function cap(page, filename, autoDismiss = true) {
  const fp = path.join(FOLDER, `${filename}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`  + ${filename}.png`);
  if (autoDismiss) await dismiss(page);
}

async function dismiss(page) {
  for (let i = 0; i < 3; i++) {
    try { await page.keyboard.press('Escape'); } catch {}
    await page.waitForTimeout(200);
  }
  // Force-remove any remaining overlays via JS
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay, .swal2-container, .swal2-backdrop-show').forEach(el => {
      el.style.display = 'none';
      el.remove();
    });
  }).catch(() => {});
  await page.waitForTimeout(200);
}

async function safeClick(page, selector) {
  await dismiss(page);
  const el = await page.$(selector);
  if (!el) return false;
  try {
    await el.click({ timeout: 5000 });
  } catch {
    // If blocked by overlay, force click via JS
    await page.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); }, selector);
  }
  await page.waitForTimeout(WAIT);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  let page;

  // ── 00 DASHBOARD ──
  console.log('\n[00] Dashboard');
  page = await goToPanel(ctx, []);
  await cap(page, '00-0001-dashboard');
  await safeClick(page, '#viewModePie');
  await cap(page, '00-0002-dashboard-pie');
  await safeClick(page, '#viewModeBar');
  await cap(page, '00-0003-dashboard-bar');
  await safeClick(page, '#quotationDistributionColumn');
  await cap(page, '00-0004-dashboard-quotation-expand');
  await safeClick(page, '#quotationDistributionColumn');
  await safeClick(page, '#outsourcingDistributionColumn');
  await cap(page, '00-0005-dashboard-outsourcing-expand');
  await page.close();

  // ── 01 EMAIL RECEIVE ──
  console.log('\n[01] Email Receive');
  const emailNav = [{ click: '#menuEmail' }, { wait: 300 }, { click: '#emailReceiveBtn' }];
  page = await goToPanel(ctx, emailNav);
  await cap(page, '01-0001-email-receive');
  await safeClick(page, '#composeBtn');
  await cap(page, '01-0002-email-receive-compose');
  await page.close();

  page = await goToPanel(ctx, emailNav);
  await safeClick(page, '#refreshEmailsBtn');
  await cap(page, '01-0003-email-receive-refresh');
  await safeClick(page, '#testSendBtn');
  await cap(page, '01-0004-email-receive-test-send');
  await safeClick(page, '#testSmtpBtn');
  await cap(page, '01-0005-email-receive-test-smtp');
  await page.close();

  // ── 01 EMAIL RECEIVE — "Click to view" modal + Quotation sub-options + Image Lib ──
  console.log('\n[01] Email Receive — Modal Actions');
  page = await goToPanel(ctx, emailNav);
  // Refresh to load emails
  await safeClick(page, '#refreshEmailsBtn');
  await page.waitForTimeout(3000); // wait for IMAP fetch

  // Click "Click to view" on first email row
  const viewCell = await page.$('.email-view-cell');
  if (viewCell) {
    await viewCell.click();
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0006-email-receive-modal', false);

    // Click Quotation to expand sub-options
    await page.evaluate(() => { document.getElementById('quotationBtn')?.click(); });
    await page.waitForTimeout(800);
    await cap(page, '01-0007-email-receive-modal-quotation-expand', false);

    // Hang Tag
    await page.evaluate(() => { document.querySelector('[data-testid="quotation-hang-tag-btn"]')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0008-email-receive-quotation-hang-tag', false);
    await page.evaluate(() => { document.getElementById('emailQuotationModalClose')?.click(); });
    await page.waitForTimeout(500);

    // Woven Label
    await page.evaluate(() => { document.querySelector('[data-testid="quotation-woven-label-btn"]')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0009-email-receive-quotation-woven-label', false);
    await page.evaluate(() => { document.getElementById('emailQuotationModalClose')?.click(); });
    await page.waitForTimeout(500);

    // Care Label
    await page.evaluate(() => { document.querySelector('[data-testid="quotation-care-label-btn"]')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0010-email-receive-quotation-care-label', false);
    await page.evaluate(() => { document.getElementById('emailQuotationModalClose')?.click(); });
    await page.waitForTimeout(500);

    // Transfer
    await page.evaluate(() => { document.querySelector('[data-testid="quotation-transfer-btn"]')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0011-email-receive-quotation-transfer', false);
    await page.evaluate(() => { document.getElementById('emailQuotationModalClose')?.click(); });
    await page.waitForTimeout(500);

    // Outsource
    await page.evaluate(() => { document.querySelector('[data-testid="quotation-outsource-btn"]')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0012-email-receive-quotation-outsource', false);
    await page.evaluate(() => { document.getElementById('emailQuotationModalClose')?.click(); });
    await page.waitForTimeout(500);

    // Image Lib
    await page.evaluate(() => { document.getElementById('imageLibBtn')?.click(); });
    await page.waitForTimeout(WAIT);
    await cap(page, '01-0013-email-receive-image-lib', false);
  } else {
    console.log('  ! No emails in inbox — skipping modal captures');
  }
  await page.close();

  // ── 01 EMAIL SEND ──
  console.log('\n[01] Email Send');
  const emailSendNav = [{ click: '#menuEmail' }, { wait: 300 }, { click: '#emailSendBtn' }];
  page = await goToPanel(ctx, emailSendNav);
  await cap(page, '01-0014-email-send');
  await safeClick(page, '#composeSendBtn');
  await cap(page, '01-0015-email-send-compose');
  if (await safeClick(page, '#dummyFillSendComposeBtn'))
    await cap(page, '01-0016-email-send-compose-dummy-fill');
  if (await safeClick(page, '#cancelSendBtn'))
    await cap(page, '01-0017-email-send-compose-cancel');
  await page.close();

  page = await goToPanel(ctx, emailSendNav);
  await safeClick(page, '#testSendEmailBtn');
  await cap(page, '01-0018-email-send-test-send');
  await safeClick(page, '#testSmtpConnectionBtn');
  await cap(page, '01-0019-email-send-test-smtp');
  await safeClick(page, '#refreshSentEmailsBtn');
  await cap(page, '01-0020-email-send-refresh');
  await page.close();

  // ── 02 CUSTOMER CREATE ──
  console.log('\n[02] Customer Create');
  const custCreateNav = [{ click: '#menuCustomer' }, { wait: 300 }, { click: '#customerCreateBtn' }];
  page = await goToPanel(ctx, custCreateNav);
  await cap(page, '02-0001-customer-create');
  await safeClick(page, '#dummyInputBtn');
  await cap(page, '02-0002-customer-create-dummy-input');
  await safeClick(page, '#saveCustomerBtn');
  await cap(page, '02-0003-customer-create-save');
  if (await safeClick(page, '#addMemberBtn'))
    await cap(page, '02-0004-customer-create-add-member');
  if (await safeClick(page, '#dummyMemberBtn'))
    await cap(page, '02-0005-customer-create-dummy-member');
  await page.close();

  // ── 02 CUSTOMER VIEW ──
  console.log('\n[02] Customer View');
  const custViewNav = [{ click: '#menuCustomer' }, { wait: 300 }, { click: '#customerViewBtn' }];
  page = await goToPanel(ctx, custViewNav);
  await cap(page, '02-0006-customer-view');
  await safeClick(page, '#refreshCustomersBtn');
  await cap(page, '02-0007-customer-view-refresh');
  await page.close();

  // ── 03 SUPPLIER CREATE ──
  console.log('\n[03] Supplier Create');
  const suppCreateNav = [{ click: '#menuSupplier' }, { wait: 300 }, { click: '#supplierCreateBtn' }];
  page = await goToPanel(ctx, suppCreateNav);
  await cap(page, '03-0001-supplier-create');
  await safeClick(page, '#supplierDummyInputBtn');
  await cap(page, '03-0002-supplier-create-dummy-input');
  await safeClick(page, '#saveSupplierBtn');
  await cap(page, '03-0003-supplier-create-save');
  if (await safeClick(page, '#addSupplierMemberBtn'))
    await cap(page, '03-0004-supplier-create-add-member');
  if (await safeClick(page, '#dummySupplierMemberBtn'))
    await cap(page, '03-0005-supplier-create-dummy-member');
  await page.close();

  // ── 03 SUPPLIER VIEW ──
  console.log('\n[03] Supplier View');
  const suppViewNav = [{ click: '#menuSupplier' }, { wait: 300 }, { click: '#supplierViewBtn' }];
  page = await goToPanel(ctx, suppViewNav);
  await cap(page, '03-0006-supplier-view');
  await safeClick(page, '#refreshSuppliersBtn');
  await cap(page, '03-0007-supplier-view-refresh');
  await page.close();

  // ── 04 TASK LIST ──
  console.log('\n[04] Task List');
  page = await goToPanel(ctx, [{ click: '#menuTasks' }]);
  await cap(page, '04-0001-task-list');
  await page.close();

  // ── 05 SKILLS ──
  console.log('\n[05] Skills');
  page = await goToPanel(ctx, [{ click: '#menuSkills' }]);
  await cap(page, '05-0001-skills');
  await safeClick(page, '#addSkillBtn');
  await cap(page, '05-0002-skills-create');
  await page.close();

  page = await goToPanel(ctx, [{ click: '#menuSkills' }]);
  await safeClick(page, '#refreshSkillsBtn');
  await cap(page, '05-0003-skills-refresh');
  await page.close();

  // ── 06 QUOTATION CREATE ──
  console.log('\n[06] Quotation Create');
  const quotCreateNav = [{ click: '#menuQuotation' }, { wait: 300 }, { click: '#quotationCreateBtn' }];
  page = await goToPanel(ctx, quotCreateNav);
  await cap(page, '06-0001-quotation-create');
  await safeClick(page, '#hangTagBtn');
  await cap(page, '06-0002-quotation-create-hang-tag');
  await safeClick(page, '#wovenLabelBtn');
  await cap(page, '06-0003-quotation-create-woven-label');
  await safeClick(page, '#careLabelBtn');
  await cap(page, '06-0004-quotation-create-care-label');
  await safeClick(page, '#heatTransferBtn');
  await cap(page, '06-0005-quotation-create-heat-transfer');
  await safeClick(page, '#othersBtn');
  await cap(page, '06-0006-quotation-create-others');
  await page.close();

  // Quotation dummy fill flow
  page = await goToPanel(ctx, quotCreateNav);
  await safeClick(page, '#hangTagBtn');
  if (await safeClick(page, 'button[onclick*="fillDummyQuotationForm"]'))
    await cap(page, '06-0007-quotation-create-dummy-fill');
  if (await safeClick(page, 'button[onclick*="fillDummyQuotationData"]'))
    await cap(page, '06-0008-quotation-create-dummy2');
  if (await safeClick(page, 'button[onclick*="clearQuotationForm"]'))
    await cap(page, '06-0009-quotation-create-clear');
  await page.close();

  // ── 06 QUOTATION VIEW ──
  console.log('\n[06] Quotation View');
  const quotViewNav = [{ click: '#menuQuotation' }, { wait: 300 }, { click: '#quotationViewBtn' }];
  page = await goToPanel(ctx, quotViewNav);
  await cap(page, '06-0010-quotation-view');
  await safeClick(page, '#refreshQuotationsBtn');
  await cap(page, '06-0011-quotation-view-refresh');
  await safeClick(page, '#selectAllQuotationsBtn');
  await cap(page, '06-0012-quotation-view-select-all');
  await safeClick(page, '#deselectAllQuotationsBtn');
  await cap(page, '06-0013-quotation-view-deselect-all');
  await page.close();

  // ── 07 OUTSOURCING CREATE ──
  console.log('\n[07] Outsourcing Create');
  const outCreateNav = [{ click: '#menuOutsourcing' }, { wait: 300 }, { click: '#outsourcingCreateBtn' }];
  page = await goToPanel(ctx, outCreateNav);
  await cap(page, '07-0001-outsourcing-create');
  await page.close();

  // ── 07 OUTSOURCING VIEW ──
  console.log('\n[07] Outsourcing View');
  const outViewNav = [{ click: '#menuOutsourcing' }, { wait: 300 }, { click: '#outsourcingViewBtn' }];
  page = await goToPanel(ctx, outViewNav);
  await cap(page, '07-0002-outsourcing-view');
  await safeClick(page, '#refreshOutsourcingBtn');
  await cap(page, '07-0003-outsourcing-view-refresh');
  await safeClick(page, '#selectAllOutsourcingBtn');
  await cap(page, '07-0004-outsourcing-view-select-all');
  await safeClick(page, '#deselectAllOutsourcingBtn');
  await cap(page, '07-0005-outsourcing-view-deselect-all');
  if (await safeClick(page, '#generateOutsourcingDummyBtn')) {
    await page.waitForTimeout(2000); // extra wait for dummy generation
    await cap(page, '07-0006-outsourcing-view-generate-dummy');
  }
  await page.close();

  // ── 08 SETTING ──
  console.log('\n[08] Setting');
  page = await goToPanel(ctx, [{ click: '#menuSettings' }]);
  await cap(page, '08-0001-setting');
  if (await safeClick(page, '#dummyFillSettingsBtn'))
    await cap(page, '08-0002-setting-auto-fill');
  if (await safeClick(page, '#togglePassword'))
    await cap(page, '08-0003-setting-toggle-password');
  await safeClick(page, '#saveConfigBtn');
  await cap(page, '08-0004-setting-save');
  await page.close();

  await browser.close();
  console.log('\nAll done!');
})();
