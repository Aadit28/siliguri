const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';

function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function graphSend(payload) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${response.status}).`);
  }
  return data;
}

// Meta "authentication" template: code goes in the body and in the
// copy-code button, both as the first text parameter.
async function sendOtp(phone, code) {
  return graphSend({
    to: phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: process.env.WHATSAPP_OTP_TEMPLATE || 'saathi_login_code',
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  });
}

// Free-form text only delivers inside the 24h window after the user last
// messaged the business; outside it Meta requires an approved template.
async function sendText(phone, body) {
  return graphSend({
    to: phone.replace(/^\+/, ''),
    type: 'text',
    text: { body },
  });
}

async function sendTemplate(phone, templateName, lang, bodyParams = []) {
  return graphSend({
    to: phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang || process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
      components: bodyParams.length
        ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })) }]
        : undefined,
    },
  });
}

module.exports = { whatsappConfigured, sendOtp, sendText, sendTemplate };
