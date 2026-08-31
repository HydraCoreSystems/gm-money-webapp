import crypto from 'node:crypto';

export default async function handler(req, res) {
  // Enable CORS if accessed across environments
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  if (!accessUrl) {
    return res.status(500).json({
      success: false,
      error: 'SIMPLEFIN_ACCESS_URL is not configured in environment variables'
    });
  }

  if (req.method === 'GET') {
    return res.json({
      success: true,
      configured: true,
      institution: 'PNC Bank'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const days = parseInt(req.body?.days || req.query?.days || '7', 10);
    const parsedUrl = new URL(accessUrl);
    const username = parsedUrl.username;
    const password = parsedUrl.password;
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const startTimestamp = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    const queryParams = new URLSearchParams({
      'start-date': startTimestamp.toString(),
      'pending': '1'
    });

    const apiUrl = `${parsedUrl.origin}${parsedUrl.pathname}/accounts?${queryParams.toString()}`;
    const response = await fetch(apiUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `SimpleFIN API returned HTTP ${response.status}: ${errText}`
      });
    }

    const data = await response.json();
    const accounts = [];

    for (const rawAcc of (data.accounts || [])) {
      const rawTxList = rawAcc.transactions || [];
      const filteredTx = rawTxList.filter(t => {
        const txTime = t.posted || t.transacted_at;
        return txTime && txTime >= startTimestamp;
      });

      const occurrenceMap = new Map();

      const normalizedTransactions = filteredTx.map(t => {
        const txTime = t.posted || t.transacted_at;
        const dateStr = new Date(txTime * 1000).toISOString().split('T')[0];
        const amount = parseFloat(t.amount);
        const payee = (t.payee || t.description || 'Unknown Payee').trim();
        const originalDesc = (t.description || payee).trim();

        const baseKey = `${rawAcc.id}|${dateStr}|${amount.toFixed(2)}|${payee.toUpperCase()}`;
        const occ = (occurrenceMap.get(baseKey) || 0) + 1;
        occurrenceMap.set(baseKey, occ);

        const fingerprint = crypto
          .createHash('sha256')
          .update(`${baseKey}|${occ}`)
          .digest('hex');

        let txType = 'expense';
        if (amount > 0) txType = 'income';
        if (payee.toLowerCase().includes('transfer') || originalDesc.toLowerCase().includes('transfer')) {
          txType = 'transfer';
        }

        return {
          reference_id: t.id,
          date: dateStr,
          amount,
          payee,
          original_description: originalDesc,
          memo: t.memo || '',
          transaction_type: txType,
          fingerprint
        };
      });

      accounts.push({
        id: rawAcc.id,
        name: rawAcc.name,
        currency: rawAcc.currency || 'USD',
        balance: parseFloat(rawAcc.balance) || 0,
        institution: rawAcc.org?.name || 'PNC Bank',
        transactions: normalizedTransactions
      });
    }

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      days_synced: days,
      accounts
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
