import axios from 'axios';

function buildApiUrl(pathname, apiKey) {
  return `https://api-mainnet.helius-rpc.com${pathname}?api-key=${encodeURIComponent(apiKey)}`;
}

function buildPayload({ addresses, webhookUrl, secret, txnStatus }) {
  return {
    webhookURL: webhookUrl,
    transactionTypes: ['ANY'],
    accountAddresses: addresses,
    webhookType: 'enhanced',
    authHeader: secret,
    txnStatus,
    encoding: 'jsonParsed',
  };
}

export async function listHeliusWebhooks(apiKey) {
  const response = await axios.get(buildApiUrl('/v0/webhooks', apiKey), {
    timeout: 15000,
    headers: { Accept: 'application/json' },
  });
  return response.data;
}

export async function createHeliusWebhook({ apiKey, addresses, webhookUrl, secret, txnStatus = 'all' }) {
  const response = await axios.post(
    buildApiUrl('/v0/webhooks', apiKey),
    buildPayload({ addresses, webhookUrl, secret, txnStatus }),
    {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  return response.data;
}

export async function updateHeliusWebhook({ apiKey, webhookId, addresses, webhookUrl, secret, txnStatus = 'all' }) {
  const response = await axios.put(
    buildApiUrl(`/v0/webhooks/${webhookId}`, apiKey),
    buildPayload({ addresses, webhookUrl, secret, txnStatus }),
    {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  return response.data;
}

export async function deleteHeliusWebhook({ apiKey, webhookId }) {
  const response = await axios.delete(buildApiUrl(`/v0/webhooks/${webhookId}`, apiKey), {
    timeout: 15000,
    headers: { Accept: 'application/json' },
  });

  return response.data;
}
