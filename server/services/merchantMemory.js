import { db } from '../db.js';

export class MerchantMemoryService {
  /**
   * Cleans and normalizes noisy bank description strings
   * Examples:
   * "CHICK-FIL-A #02891 ATLANTA GA" -> "CHICK-FIL-A"
   * "SQ *GARDEN SUPPLY CO" -> "GARDEN SUPPLY CO"
   * "TST* URBAN FOREST CAFE" -> "URBAN FOREST CAFE"
   * "PAYPAL *BAMBULAB" -> "BAMBULAB"
   * "DEBIT CARD PURCHASE 10/14 USPS PO 13245" -> "USPS"
   */
  static normalizeRawDescription(raw) {
    if (!raw || typeof raw !== 'string') return '';

    let cleaned = raw.toUpperCase().trim();

    // Remove common bank noise prefixes
    const prefixes = [
      /^CHECKCARD\s+\d*\s*/i,
      /^DEBIT CARD PURCHASE\s+(\d{1,2}\/\d{1,2})?\s*/i,
      /^PURCHASE AUTHORIZED ON\s+(\d{1,2}\/\d{1,2})?\s*/i,
      /^POS DEBIT\s+/i,
      /^POS PURCHASE\s+/i,
      /^ACH DEBIT\s+/i,
      /^ACH CREDIT\s+/i,
      /^RECURRING PAYMENT\s+/i,
      /^SQ\s*\*\s*/i,
      /^TST\s*\*\s*/i,
      /^PAYPAL\s*\*\s*/i,
      /^AMZN\s+Mktp\s+US\*/i,
      /^SP\s*\*\s*/i,
      /^VENMO\s*\*\s*/i
    ];

    prefixes.forEach(rx => {
      cleaned = cleaned.replace(rx, '');
    });

    // Remove store numbers, phone numbers, website endings, city/state codes
    cleaned = cleaned
      .replace(/#\s*\d+/g, '') // e.g. #02891
      .replace(/\b\d{4,}\b/g, '') // standalone long reference numbers
      .replace(/\.COM\b/g, '')
      .replace(/\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b\s*(\d{5})?$/i, '')
      .replace(/[\*\_\-\:\#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || raw.trim();
  }

  /**
   * Matches a raw description against learned merchant memory rules
   * Returns best match with category, subcategory, display payee, and confidence
   */
  static match(rawDescription) {
    if (!rawDescription) return null;

    const normalized = this.normalizeRawDescription(rawDescription);
    const rules = db.prepare(`
      SELECT m.*, c.name as category_name, s.name as subcategory_name
      FROM merchant_memory m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN subcategories s ON m.subcategory_id = s.id
      ORDER BY m.confidence DESC, m.times_seen DESC
    `).all();

    // 1. Try Exact match
    for (const rule of rules) {
      if (rule.match_type === 'exact' && normalized.toUpperCase() === rule.match_pattern.toUpperCase()) {
        return {
          display_payee: rule.display_payee,
          category_id: rule.category_id,
          subcategory_id: rule.subcategory_id,
          category_name: rule.category_name,
          subcategory_name: rule.subcategory_name,
          confidence: rule.confidence,
          rule_id: rule.id,
          match_type: 'exact'
        };
      }
    }

    // 2. Try Contains / Normalized Substring match
    for (const rule of rules) {
      const pattern = rule.match_pattern.toUpperCase();
      if (
        normalized.toUpperCase().includes(pattern) ||
        rawDescription.toUpperCase().includes(pattern)
      ) {
        return {
          display_payee: rule.display_payee,
          category_id: rule.category_id,
          subcategory_id: rule.subcategory_id,
          category_name: rule.category_name,
          subcategory_name: rule.subcategory_name,
          confidence: Math.min(1.0, rule.confidence * 0.95),
          rule_id: rule.id,
          match_type: 'contains'
        };
      }
    }

    // 3. Try Regex match
    for (const rule of rules) {
      if (rule.match_type === 'regex') {
        try {
          const rx = new RegExp(rule.match_pattern, 'i');
          if (rx.test(rawDescription) || rx.test(normalized)) {
            return {
              display_payee: rule.display_payee,
              category_id: rule.category_id,
              subcategory_id: rule.subcategory_id,
              category_name: rule.category_name,
              subcategory_name: rule.subcategory_name,
              confidence: Math.min(1.0, rule.confidence * 0.9),
              rule_id: rule.id,
              match_type: 'regex'
            };
          }
        } catch (e) {
          // Invalid regex ignored
        }
      }
    }

    // If no rule matched, propose a cleaned display name with 0 confidence
    return {
      display_payee: this.formatProperTitle(normalized),
      category_id: null,
      subcategory_id: null,
      category_name: null,
      subcategory_name: null,
      confidence: 0.0,
      rule_id: null,
      match_type: 'none'
    };
  }

  /**
   * Converts ALL CAPS to clean Title Case for display payees
   */
  static formatProperTitle(str) {
    if (!str) return '';
    // Preserve known acronyms
    const acronyms = ['USPS', 'UPS', 'LLC', 'INC', 'IRS', 'ACH', 'POS', 'ATM', '3D', 'AI', 'API', 'AWS', 'PC'];
    return str
      .toLowerCase()
      .split(' ')
      .map(w => {
        const up = w.toUpperCase();
        if (acronyms.includes(up)) return up;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }

  /**
   * Learns from a user's confirmed transaction classification
   */
  static learn(rawDescription, displayPayee, categoryId, subcategoryId) {
    if (!rawDescription || !categoryId) return;

    const normalized = this.normalizeRawDescription(rawDescription);
    const pattern = normalized.slice(0, 40).trim();

    if (!pattern) return;

    const existing = db.prepare(`
      SELECT * FROM merchant_memory
      WHERE normalized_merchant = ? OR match_pattern = ?
    `).get(pattern, pattern);

    if (existing) {
      // Check if user changed the category
      const sameCategory = existing.category_id === categoryId && existing.subcategory_id === subcategoryId;
      const newConfidence = sameCategory
        ? Math.min(1.0, Number((existing.confidence + 0.05).toFixed(2)))
        : 0.85; // reset confidence on correction

      db.prepare(`
        UPDATE merchant_memory
        SET category_id = ?,
            subcategory_id = ?,
            display_payee = ?,
            confidence = ?,
            times_seen = times_seen + 1,
            last_seen = CURRENT_TIMESTAMP,
            last_confirmed = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(categoryId, subcategoryId || null, displayPayee || existing.display_payee, newConfidence, existing.id);
    } else {
      // Create new learned rule
      db.prepare(`
        INSERT INTO merchant_memory (
          normalized_merchant, match_pattern, match_type, display_payee,
          category_id, subcategory_id, confidence, times_seen, last_seen, last_confirmed
        )
        VALUES (?, ?, 'contains', ?, ?, ?, 0.90, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        pattern,
        pattern,
        displayPayee || this.formatProperTitle(normalized),
        categoryId,
        subcategoryId || null
      );
    }
  }

  /**
   * Re-evaluates all pending review transactions against current merchant rules
   */
  static reclassifyPendingTransactions() {
    const pending = db.prepare(`
      SELECT id, original_description, payee, category_id, subcategory_id
      FROM transactions
      WHERE review_status = 'pending_review'
    `).all();

    let updatedCount = 0;
    const updateStmt = db.prepare(`
      UPDATE transactions
      SET payee = ?, category_id = ?, subcategory_id = ?
      WHERE id = ?
    `);

    pending.forEach(t => {
      const match = this.match(t.original_description || t.payee);
      if (match && match.category_id && match.confidence >= 0.7) {
        updateStmt.run(match.display_payee || t.payee, match.category_id, match.subcategory_id, t.id);
        updatedCount++;
      }
    });

    return updatedCount;
  }
}
