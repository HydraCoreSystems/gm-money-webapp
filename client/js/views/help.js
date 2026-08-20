export function renderHelp(container) {
  container.innerHTML = `
    <div style="max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
      <div>
        <h3 style="font-size: 19px; font-weight: 800;">Gathering Moss Financial Center Guide & Primer</h3>
        <div style="font-size: 13.5px; color: var(--text-muted); margin-top: 4px;">
          A complete walkthrough of the modernized Microsoft Money experience built for Gathering Moss LLC.
        </div>
      </div>

      <!-- Section 1: Philosophy -->
      <div class="card">
        <h4 style="font-size: 15px; font-weight: 700; color: var(--moss-light); margin-bottom: 8px;">
          1. Core Philosophy: Modernize Microsoft Money, Don't Reinvent It
        </h4>
        <p style="font-size: 13.5px; color: var(--text-main); margin-bottom: 10px;">
          This application brings back the direct, reliable, and uncluttered desktop workflow of classic Microsoft Money while replacing fragile spreadsheet formulas with a dedicated, local SQLite database.
        </p>
        <div style="background: var(--bg-surface-raised); padding: 12px 16px; border-radius: var(--radius-md); font-size: 13px; border-left: 3px solid var(--moss-primary);">
          <strong>Key Improvements Over Spreadsheets:</strong>
          <ul style="margin-left: 20px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; color: var(--text-muted);">
            <li><strong>No Cloud Subscriptions:</strong> Zero dependency on paid third-party bank-scraping services.</li>
            <li><strong>Cryptographic Deduplication:</strong> Overlapping bank downloads never create duplicate entries.</li>
            <li><strong>Intuitive Positive Amounts:</strong> You type <code>48.99</code> for an expense — no negative sign gymnastics.</li>
            <li><strong>Clean Hierarchy:</strong> The old confusing "Business Area" concept has been completely removed in favor of standard <code>Category → Subcategory</code>.</li>
          </ul>
        </div>
      </div>

      <!-- Section 2: CSV Import Workflow -->
      <div class="card">
        <h4 style="font-size: 15px; font-weight: 700; color: var(--moss-light); margin-bottom: 8px;">
          2. Universal CSV Import & Review
        </h4>
        <ol style="margin-left: 20px; font-size: 13.5px; display: flex; flex-direction: column; gap: 8px; color: var(--text-main);">
          <li>
            <strong>Download CSV from your Bank:</strong> Log into Chase, Capital One, Discover, PayPal, or any financial institution and download your latest transaction activity as a CSV.
          </li>
          <li>
            <strong>Drag & Drop:</strong> Go to the <strong>CSV Import</strong> screen, choose your account, and drop the CSV file.
          </li>
          <li>
            <strong>Auto-Detection & Deduplication:</strong> The system automatically recognizes your bank's column headers, normalizes amounts, and checks each row against existing records using a unique cryptographic hash. Duplicate rows are clearly identified and safely skipped.
          </li>
          <li>
            <strong>Review Queue Triage:</strong> High-confidence transactions are auto-categorized by <em>Merchant Memory</em>. Any new or unclassified transactions appear in the <strong>Review Queue</strong> where you can approve them individually or in batches.
          </li>
        </ol>
      </div>

      <!-- Section 3: Merchant Memory -->
      <div class="card">
        <h4 style="font-size: 15px; font-weight: 700; color: var(--moss-light); margin-bottom: 8px;">
          3. How Merchant Memory Learns
        </h4>
        <p style="font-size: 13.5px; color: var(--text-main); margin-bottom: 10px;">
          Banks often format descriptions with messy store numbers, dates, and noise (e.g. <code>CHICK-FIL-A #02891 ATLANTA GA</code>).
        </p>
        <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 10px;">
          When you categorize a transaction and approve it, Gathering Moss automatically extracts the core merchant name and creates or updates a rule in <strong>Merchant Memory</strong>. Future imports from that merchant will automatically receive suggested Category and Subcategory classifications.
        </p>
      </div>

      <!-- Section 4: Register & Running Balance -->
      <div class="card">
        <h4 style="font-size: 15px; font-weight: 700; color: var(--moss-light); margin-bottom: 8px;">
          4. Register & Reconciliation
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13.5px;">
          <div style="background: var(--bg-surface-raised); padding: 12px 14px; border-radius: var(--radius-md);">
            <strong style="color: var(--text-main);">The Register</strong>
            <p style="color: var(--text-muted); font-size: 12.5px; margin-top: 4px;">
              View all transactions chronologically with live running balances. Click the cleared badge to toggle between <strong>Uncleared (·)</strong> and <strong>Cleared (C)</strong>.
            </p>
          </div>
          <div style="background: var(--bg-surface-raised); padding: 12px 14px; border-radius: var(--radius-md);">
            <strong style="color: var(--text-main);">Statement Reconciliation</strong>
            <p style="color: var(--text-muted); font-size: 12.5px; margin-top: 4px;">
              Enter your monthly statement ending balance. Check off cleared transactions until the live <strong>Difference equals $0.00</strong>, locking them as <strong>Reconciled (R)</strong>.
            </p>
          </div>
        </div>
      </div>

      <!-- Section 5: Backups & Portability -->
      <div class="card">
        <h4 style="font-size: 15px; font-weight: 700; color: var(--moss-light); margin-bottom: 8px;">
          5. Backups & Data Ownership
        </h4>
        <p style="font-size: 13.5px; color: var(--text-main);">
          All data is stored in standard SQLite (<code>data/gathering_moss.db</code>). You can click <strong>Backup</strong> in the top header or visit <strong>Backups & Settings</strong> to download a complete copy of your database or export all transactions to CSV at any time.
        </p>
      </div>
    </div>
  `;
}
