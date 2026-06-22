# 📋 PRD — Product Requirements Document

# Long River Label ERP

> **The "explain it like I'm 5" summary:**
> This is a website that helps a factory that makes **clothing labels and tags** (the little printed tags sewn onto shirts, the woven brand labels, the heat-transfer prints) do its **whole job** in one place — answer customer emails, **price** the work, **ask outside suppliers** for competing quotes, **pick the winner**, **make the product**, and **track it** on the factory floor using QR codes, until it ships. Think of it as the company's **digital brain + filing cabinet + telephone + production clipboard**, all combined into one screen.

---

## Table of Contents

1. [The Baby Version (1-minute read)](#1-the-baby-version-1-minute-read)
2. [5W1H Framework](#2-5w1h-framework)
   - [Who](#who)
   - [What](#what)
   - [When](#when)
   - [Where](#where)
   - [Why](#why)
   - [How](#how)
3. [The Big Picture (End-to-End Story)](#3-the-big-picture-end-to-end-story)
4. [Modules & Features (Detailed)](#4-modules--features-detailed)
5. [User Roles](#5-user-roles)
6. [Key Workflows](#6-key-workflows)
7. [Business Rules](#7-business-rules)
8. [Technology Stack](#8-technology-stack)
9. [Glossary](#9-glossary)

---

## 1. The Baby Version (1-minute read)

Imagine you run a shop that makes **stickers and tags for clothes**. Every day these things happen:

1. A clothing brand **emails** you: *"Can you make 10,000 woven labels for us? How much?"*
2. You need to **figure out the price** and send them a quote.
3. Sometimes you make it yourself. Sometimes you **ask 3 outside factories** to give you their best price, then you **compare** and pick the cheapest/best.
4. Once the customer says **"yes, go"**, you turn the quote into an **order**.
5. Your factory floor makes it, and workers **scan a QR code** at each step so the boss always knows *"where is this order right now?"*
6. When it's done, it **ships**.

This website does **all of that** — emails, quotes, supplier comparisons, orders, and floor tracking — in **one place**, so nobody loses paperwork and nothing falls through the cracks.

**In one sentence:** A web app that runs a clothing-label factory's entire sales-to-production pipeline — from the first customer email to the final shipped order.

---

## 2. 5W1H Framework

### Who
**Who uses this system?**

| Role | What they do in the app |
|------|--------------------------|
| **Internal staff** (sales, CS, merchandisers, managers) | The main users. They read customer emails, build quotes, contact suppliers, compare prices, create orders, and watch production. There is **no login screen for staff** — the app runs on a private company computer, so "whoever can open it can use it." |
| **Customers / Garment Factories / Brands** | The buyers. They don't log in. They just **receive emails** (quotes, PDFs) and reply. |
| **Suppliers / Agents** (outside factories) | They get a **special private web link** (a "token" URL) that lets them open a simple page, see what's being asked, and **type in their price**. No account, no password — just a secure link that expires. |
| **Factory-floor workers** | They use a **separate Android scanner app** to scan QR codes on orders as the product moves through the workshop. |

### What
**What is this product?**

A single-page **web application** (one big screen, many tabs) that manages:

- **Emails** (read incoming / send outgoing)
- **Quotations** (price quotes to customers)
- **Outsourcing** (asking outside suppliers for prices)
- **Supplier Portal** (suppliers reply with prices via a link)
- **Orders** (turning a won quote into a production job)
- **Production Tracking** (QR-scan progress through factory departments)
- **Databases** for: Brands, Garment Factories (customers), Agents (suppliers), Workshops (factories), Currencies, Pricing Tiers, Product Profiles
- **Dashboard** (charts showing how the business is doing)

The products being quoted and made are **clothing labels & accessories**:
- 🏷️ **Hang Tags** (the cardboard tags hanging off clothes)
- 🧵 **Woven Labels** (fabric brand labels)
- 🔥 **Heat Transfer** (prints ironed onto fabric)
- 📄 **Printed Labels** (printed fabric labels)
- ❓ **Other** (anything custom)

### When
**When is it used?**

- **All day, every working day** — it's the company's daily operating tool.
- **When a customer emails** a request → staff opens the email tab and starts a quote.
- **When staff needs a supplier's price** → generates a portal link, supplier replies when convenient.
- **When a quote is approved** → an order is created.
- **As the product moves through the factory** → workers scan at each department (real-time, as it happens).
- Supplier links **expire after 30 days** and can only be used **once**.

### Where
**Where does it live / run?**

- It runs on a **company server or computer** (Node.js + Express).
- Staff open it in a **web browser** at an address like `http://localhost:5999` (default port 5999, configurable).
- Suppliers open their **private link** from **anywhere in the world** (their own office, phone, etc.) — that's the "portal" pages.
- Data is stored in a **single local file database** (`erp.db`, SQLite) — no cloud, no external database server.
- Uploaded files (images, attachments, logos, factory photos) are saved in an `uploads/` folder on the same machine.
- The **Android scanner app** runs on factory-floor phones/tablets and talks to this same server over the local network.

### Why
**Why does this exist? What problem does it solve?**

Without it, a label factory drowns in **mess**:

- ❌ Customer requests scattered across inboxes.
- ❌ Quotes scribbled in Excel files that get lost or duplicated.
- ❌ No way to compare 3 suppliers' prices side-by-side — lots of back-and-forth emails.
- ❌ When a customer says "where is my order?", nobody knows — production status lives in people's heads.
- ❌ Pricing mistakes, currency confusion, MOQ surprises.

**This app fixes all of that** by giving the company:

- ✅ **One inbox** for all customer emails.
- ✅ **One place** to build, store, and email professional quotes (with PDF + images).
- ✅ **Automatic supplier comparison** — every supplier fills the same form, prices line up.
- ✅ **A live production map** — scan a QR code, and the boss instantly sees which department has the order.
- ✅ **Multi-currency** accuracy (HKD base, USD, EUR, etc.).
- ✅ **Volume pricing tiers, MOQ & surcharge** handling built in.
- ✅ **An audit trail** — every status change is recorded with a timestamp.

**The bottom-line "why":** turn a chaotic, email-and-spreadsheet factory into a calm, tracked, measurable business where nothing gets lost.

### How
**How does it work (the mechanics)?**

- The **backend** is a Node.js **Express** web server that exposes **REST API endpoints** (e.g. `GET /api/quotations`, `POST /api/orders`).
- The **frontend** is a single large **HTML page** (`public/index.html`) that uses vanilla **JavaScript** to call those APIs and redraw the screen. (No React/Angular — it's a classic server-rendered style app with client JS.)
- **Data** lives in **SQLite** (a file-based database) via the `tasksDb.js` module.
- **Email** is handled two ways:
  - **IMAP** = *reading* incoming customer mail.
  - **SMTP** = *sending* outgoing mail (quotes, supplier links, notifications).
- **File uploads** go through **Multer**.
- **PDFs** are generated with **PDFKit**; **QR codes** with the `qrcode` library; **Excel exports** with **ExcelJS**; **charts** with **Chart.js**.
- **Supplier collaboration** happens via **unique secret tokens** in the URL — no login system needed.
- **Production tracking** uses a QR code printed on each order; the **Android app** scans it and calls `/api/orders/progress/scan`.

---

## 3. The Big Picture (End-to-End Story)

Here is the full life of one job, from first contact to shipped box:

```
  📧 Customer email arrives
            │
            ▼
  🆕 Staff creates a QUOTATION
     (pick customer, brand, product type, qty tiers, price)
            │
            ├── Make it ourselves? ──► 📤 Email quote PDF to customer
            │
            └── Need to outsource? ──► 🔗 Send private links to suppliers
                                          │
                                          ▼
                                  💬 Suppliers reply with prices
                                          │
                                          ▼
                                  ⚖️ Compare all quotes side-by-side
                                          │
                                          ▼
                                  🏆 Pick the winning supplier
                                          │
                                          ▼
                                  🧪 Request a SAMPLE (supplier gives ready-date)
                                          │
                                          ▼
                                  📤 Send final quote to customer
                                          │
                                          ▼
                                  ✅ Customer confirms price
                                          │
                                          ▼
                                  📦 Convert quote → ORDER
                                          │
                                          ▼
                                  🏭 Factory floor: workers scan QR
                                     CS → PMC → Material → Production
                                     → Cut/Fold → QC → Shipment → Account
                                          │
                                          ▼
                                  🚚 Order COMPLETED & shipped
```

Every arrow above is a feature in this app. Every box is a screen. Nothing happens outside the system.

---

## 4. Modules & Features (Detailed)

### 4.1 📊 Dashboard (the home screen)
A bird's-eye view of the whole business with expandable charts:
- **Quotation Distribution** — how many in-house quotes at each status.
- **Outsourcing Distribution** — how many outsourced jobs at each status.
- **Brand Distribution** — jobs grouped by customer brand.
- **Brand vs Total (HKD)** — revenue analysis per brand.
- **Order Distribution** — orders grouped by country/region.
- **Insights panel** — summary metrics (total quotes, active orders, conversion rate, pending reviews).
- A `TYPE` multi-select filter to show/hide chart groups.

> 🍼 *Baby words:* "A dashboard of pie charts that tells the boss how busy the company is and where everything is stuck."

---

### 4.2 📧 Email Management
Built-in email client so staff never leave the app:
- **Receive** emails via IMAP (inbox list, pagination).
- **Read** full email + attachments.
- **Send** emails via SMTP (compose modal, rich HTML, embedded images, BCC, attachments).
- **Sent folder** history (synced with IMAP "Sent").
- **Multiple email profiles** — several company mailboxes (e.g. `sales@`, `cs@`), switch the active one.
- **Auto-detect customer** — incoming email is matched to a known customer by email domain.
- **Connection tests** for IMAP and SMTP.

> 🍼 *Baby words:* "Your email program is glued to the side of the quoting program, so you can read a request and start quoting in one click."

---

### 4.3 🏷️ Brand Database
Master list of customer **brands** (e.g. "Nike", "Adidas"):
- Create / edit / delete brand.
- Upload brand **logo**.
- Set brand currency.
- View all quotes & orders belonging to a brand.

---

### 4.4 👕 Garment Factory Database (Customers)
Master list of **customers** (the garment factories buying labels):
- Multi-tab create form:
  - **Company info** — name, address, type, currency, yearly turnover.
  - **Contacts (members)** — many contact persons per company (name, title, email prefix, phone).
  - **Documents** — upload company files.
- Advanced **filtering**, multi-select, batch delete.
- Email **domain** stored for auto-matching incoming mail.

---

### 4.5 🤝 Agent Database (Suppliers)
Master list of **outside suppliers / agents** who can produce labels:
- Multi-tab create form:
  - Company info + currency.
  - **Service capabilities** (checkboxes): Hang Tags, Woven Labels, Printed Labels, Transfer, Other.
  - Contact persons.
  - Company documents.
- Filter, multi-select, batch operations.
- Suppliers get **linked** to outsourcing quotes.

---

### 4.6 📝 PRE-PRODUCTION — Quotations (In-House)
The core of the app: **price quotes made by the company itself**.

**Status workflow:**
```
Pending → Send to Customer → Price Confirmed → Sampling
→ Await Sample Ready Date → Await Approval → Approved → Complete
                                                (or → Rejected)
```

**What you can do:**
- Create a quote (auto-numbered `IP0000001`, `IP0000002`, …).
- Pick customer + brand.
- Choose product type (Hang Tag / Woven / Heat Transfer / Printed / Other) → type-specific spec fields appear (size, material, thickness, density, weave method, print method, etc.).
- Define **quantity tiers** (e.g. 1k / 5k / 10k) each with its own unit price.
- Set **currency**, **markup %**, **MOQ**, **surcharge**.
- Upload **profile image** (product photo) + **attachments** (artwork/specs).
- **Generate PDF**, **email to customer** (with embedded image).
- **Batch** send / delete / update-status.
- **Export** to Excel / CSV / PDF.
- Full **status history** audit trail (who changed what, when, with note).
- **QR code** generated per quote.
- "Dummy data" generator for testing.

---

### 4.7 🌐 PRE-PRODUCTION — Outsourcing
When the company needs **outside suppliers** to produce a job, and wants to **compare prices**.

**Status workflow:**
```
Pending → Send to Outsourcing Supplier → Await Quotation
→ Compare Quotation → Send to Customer → Await Customer Confirm Price
→ Price Confirmed → Sampling → Await Sample Ready Date
→ Await Approval → Approved → Complete
   (branches: → Rejected, or → Sample Delivered)
```

**What's different from in-house:**
- Auto-numbered `OS0000001`, `OS0000002`, …
- **Link multiple suppliers** to one quote.
- **Generate portal links** → emailed to each supplier member automatically.
- Suppliers **submit prices** via the portal (tier prices, delivery days, MOQ, surcharge, notes).
- System **auto-advances** the status to `Compare Quotation` the moment **all** suppliers have replied.
- **Side-by-side comparison** screen.
- **Select winning supplier**.
- **Sampling flow** — request a sample, supplier submits a "ready date", chase reminders (#1, #2, #3 …), approve/reject.
- **Reminder system** for suppliers who haven't replied.
- **Resend / resubmit** counters tracked.

---

### 4.8 🔗 Supplier Portal (external, no-login)
Two public pages that suppliers reach via their secret link:

**A. Quotation Portal** (`/supplier-portal/:token`)
- Shows the job: customer, product specs, photo, attachments, quantities, currency.
- Supplier fills in **unit price per quantity tier**, **delivery days**, **MOQ**, **surcharge below MOQ**, **notes**.
- One-time submission. Token expires in 30 days.

**B. Sampling Portal** (`/supplier-sampling/:token`)
- Shows the previously quoted pricing (read-only).
- Supplier enters a **sample ready date**.
- One-time submission; notifies both parties by email.

> 🍼 *Baby words:* "Instead of asking suppliers to make an account, the company sends each one a secret link. They click it, type their price, done. Like a one-question survey."

---

### 4.9 📦 BULK PRODUCTION — Orders
When a quote is **approved**, it becomes a **production order**.

**Status workflow:**
```
Pending → In Production → Completed
```

**What you can do:**
- Convert approved quote → order (auto-numbered `PO0000001`, …).
- Assign **factory/workshop**.
- Generate **order PDF** with **QR code**.
- **Bulk** generate PDFs / QR codes / scan-updates / cancel / delete.
- **Export** to Excel (with embedded images).
- Track progress by **department scans** (see below).
- **Android scanner** integration (`/api/orders/seq/:orderSeq/qr`, `/api/orders/progress/scan`).

**The 8-step factory floor journey (enforced in strict order — no skipping, no going back):**
```
1. CS Team        5. Cut & Fold
2. PMC            6. QC
3. Material       7. Shipment
4. Production     8. Account  →  🏁 Completed
```

> 🍼 *Baby words:* "Every order gets a barcode. A worker scans it at each station, like a relay race baton, and the boss always knows which station has it."

---

### 4.10 🏭 Workshop Database
Deep registration form for **factories** (production partners), 10 sections:
1. Company basics
2. Contacts
3. Location & facility
4. **Production capabilities** (per type: monthly capacity, MOQ, lead time, machinery)
5. Departments & workflow
6. **Quality & certifications** (ISO, OEKO-TEX, GOTS …)
7. Sustainability & compliance
8. Capacity & reliability (utilization slider, on-time rate)
9. **Photo uploads** (factory exterior, interior, machinery, QC room, sample room) + product catalog PDFs + audit reports
10. Registration details, bank info, **digital signature**, declaration

Card-based browsing with filters.

---

### 4.11 ⚙️ Settings
System configuration:
- **Email Profiles** — IMAP/SMTP credentials, set active profile, send test email.
- **Currencies** — add/edit/delete (code, name, symbol, **base currency** flag). Seeded with HKD (base), USD, EUR.
- **Product Profiles** — reusable product-spec templates ("Standard Hang Tag").
- **Pricing Tier Tables** — quantity/price break tables, scoped to a **brand** or a **customer**.
- **Quotation defaults**.

---

### 4.12 ✅ Task Management (lightweight)
A small to-do/task table linked to emails (e.g. "follow up on this RFQ"). Status update + notes.

---

## 5. User Roles

| Role | Access method | Main powers |
|------|---------------|-------------|
| **Staff (internal)** | Opens the app URL on the company machine | Full control of everything — emails, quotes, orders, settings, all databases |
| **Customer** | Doesn't log in | Receives quote emails + PDFs; replies by email |
| **Supplier** | Secret token link (emailed) | Fills in one price form (quotation) and/or one sample-ready-date form |
| **Factory worker** | Android scanner app | Scans order QR codes to move them through departments |

> 🔐 **Security model:** There is **no password login** for staff. Security comes from (a) the app living on a private company computer, and (b) suppliers only getting in via 32-byte secret tokens that expire in 30 days and work once.

---

## 6. Key Workflows

### 6.1 In-House Quote → Order
1. Customer email arrives → open it.
2. Click **New Quotation** → fill customer/brand/product/qty/price.
3. Save (status: **Pending**).
4. **Send to Customer** → email + PDF generated.
5. Customer replies → set **Price Confirmed**.
6. (Optional **Sampling** loop.)
7. **Approved**.
8. **Convert to Order** → assign workshop → print QR → floor production → ship.

### 6.2 Outsourcing (multi-supplier bidding)
1. Create **Outsourcing** quote (`OS...`).
2. **Link** several suppliers.
3. **Generate & Notify** → portal links emailed to all.
4. Each supplier submits tier prices / delivery / MOQ / surcharge.
5. System auto-flips status to **Compare Quotation** when all replied.
6. Staff **selects winner**.
7. **Sampling** → supplier gives ready-date.
8. **Send to Customer** → confirm → **Convert to Order**.

### 6.3 Production Tracking
1. Order created → **QR code** printed.
2. Floor worker scans at each department (CS → … → Account) via Android app.
3. Each scan calls `/api/orders/progress/scan` — server validates order, rejects skips/repeats, auto-sets "In Production" then "Completed".
4. Boss sees live progress on the Orders screen.

### 6.4 Reminder / Chase loops
- Suppliers who haven't quoted → **Reminder #1, #2, #3…** emails (count tracked).
- Sample ready-date overdue → **chase** emails (`chaseSampleCount` tracked).
- Customer can be **resent** the quote (`resendCount` tracked).

---

## 7. Business Rules

| Rule | Detail |
|------|--------|
| **Quotation numbering** | In-house = `IP0000001…`; Outsourcing = `OS0000001…` |
| **Order numbering** | `PO0000001…` |
| **Currency** | One **base** currency (default HKD); every quote/order carries its own currency code |
| **Pricing tiers** | Quantity breakpoints; unit price per tier; total auto-derived (qty × unit price) |
| **MOQ** | Minimum Order Quantity (pieces); optional per supplier response |
| **Surcharge** | Flat fee applied when order qty is below MOQ; currency-aligned |
| **Auto-advance (outsourcing)** | Status → `Compare Quotation` once **all** linked suppliers responded (idempotent, sticky) |
| **Order floor sequence** | Strict 8-department chain; first scan must be CS Team; no skip, no repeat, no backtrack; Account scan = Completed |
| **Supplier tokens** | 32-byte hex, 30-day expiry, **one-time use**, per-supplier-member |
| **Status audit** | Every quote status change written to `quotation_status_history` with timestamp + note |
| **Soft delete / cancel** | Orders use cancel; most entities support delete with confirmation |

---

## 8. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (ES Modules) |
| **Web server** | Express 4 |
| **Database** | SQLite (`sqlite3` / `sqlite`), single file `erp.db` |
| **Email in** | IMAP via `imapflow` |
| **Email out** | SMTP via `nodemailer` |
| **File uploads** | `multer` |
| **PDF generation** | `pdfkit` |
| **Excel export** | `exceljs` |
| **QR codes** | `qrcode` |
| **Charts** | `chart.js` |
| **Validation** | `ajv` (JSON schema) |
| **Frontend** | Single HTML page + vanilla JS + Chart.js + ExcelJS (browser bundle) |
| **Mobile** | Companion **Android scanner app** (separate folder `android-order-scanner/`) |

**How to run:** `npm install` → set the `env` file (email creds + `PORT`) → `npm start` → open `http://localhost:5999`.

---

## 9. Glossary

| Term | Plain meaning |
|------|---------------|
| **RFQ** | Request For Quote — a customer asking "how much?" |
| **Quotation (IP)** | A price quote the company makes itself (In-house Production) |
| **Outsourcing (OS)** | A job the company will have an outside supplier make |
| **Order (PO)** | A confirmed, in-production job (Purchase Order) |
| **MOQ** | Minimum Order Quantity — the fewest pieces a supplier will accept |
| **Surcharge** | Extra fee if you order below the MOQ |
| **Pricing Tier** | A price break for volume (buy more = cheaper each) |
| **Markup %** | Profit % added on top of cost |
| **Brand** | The customer's label brand (e.g. the logo going on the tag) |
| **Garment Factory** | The customer (a clothing maker buying labels) |
| **Agent / Supplier** | An outside factory that can produce labels for the company |
| **Workshop** | A registered production factory (detailed profile) |
| **Token** | A secret code in a supplier's link that lets them in once |
| **Sampling** | Making a physical sample for approval before mass production |
| **CS / PMC / QC** | Customer Service / Production Material Control / Quality Control — factory departments |
| **Base Currency** | The "home" money unit everything is measured against (default HKD) |

---

> **Final baby-summary:** This app is the **all-in-one control center** for a clothing-label factory. It reads the mail, writes the quotes, shops around for the best supplier, remembers every price, turns wins into orders, and watches every order move across the factory floor — so the company never loses track of a job again. 🏷️📦✅
