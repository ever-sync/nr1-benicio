/**
 * POST /api/nr1-lead
 * Valida o cadastro, notifica a equipe e envia os dois acessos ao lead via Resend.
 */

const DEFAULT_TO = 'carolina.guglielmi@benicio.com.br';
const DEFAULT_FROM = 'Benicio Advogados <site@benicio.com.br>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function isAsciiEmail(value) {
  return /^[\x00-\x7f]+$/.test(value) && EMAIL_RE.test(value);
}

function extractAsciiEmail(value) {
  const raw = String(value || '').trim();
  const bracketed = raw.match(/<\s*([^<>]+)\s*>$/);
  const email = (bracketed ? bracketed[1] : raw).trim().toLowerCase();
  return isAsciiEmail(email) ? email : '';
}

function extractAsciiEmails(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(/[,;\n]+/);

  return [...new Set(entries.map(extractAsciiEmail).filter(Boolean))];
}

function normalizeFrom(value) {
  const raw = String(value || '').trim();
  const email = extractAsciiEmail(raw);
  if (!email) return DEFAULT_FROM;

  const bracketed = raw.match(/<\s*([^<>]+)\s*>$/);
  if (!bracketed) return email;

  const label = raw
    .slice(0, raw.lastIndexOf('<'))
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[<>"]/g, '')
    .trim();

  return label ? `${label} <${email}>` : email;
}

const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter((time) => now - time < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 6;
}

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function validate(body) {
  const data = {
    nome: String(body.nome || '').trim(),
    empresa: String(body.empresa || '').trim(),
    cargo: String(body.cargo || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    telefone: String(body.telefone || '').trim(),
  };
  data.digits = data.telefone.replace(/\D/g, '');

  const errors = [];
  if (data.nome.length < 5 || data.nome.split(/\s+/).length < 2) errors.push('nome');
  if (data.empresa.length < 2) errors.push('empresa');
  if (data.cargo.length < 2) errors.push('cargo');
  if (!isAsciiEmail(data.email)) errors.push('email');
  if (data.digits.length < 10 || data.digits.length > 11) errors.push('telefone');
  if (body.lgpd !== true && body.lgpd !== 'true') errors.push('lgpd');

  return { data, errors };
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const candidate = configured || (vercelHost ? `https://${vercelHost}` : '') || req.headers.origin;

  try {
    const url = new URL(candidate || 'https://benicio.com.br');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_protocol');
    return url.origin;
  } catch (_) {
    return 'https://benicio.com.br';
  }
}

function emailFrame(content) {
  return `<!doctype html><html><body style="margin:0;padding:30px 14px;background:#f4f2ed;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #ddd9d1;">
      <tr><td style="padding:30px 36px;border-top:7px solid #f8ad00;border-bottom:1px solid #e4e1da;">
        <div style="font:600 19px/1.1 Montserrat,Arial,sans-serif;letter-spacing:.08em;color:#171717;">BENÍCIO</div>
        <div style="font:500 8px/1.5 Arial,sans-serif;letter-spacing:.35em;color:#74746f;margin-top:4px;">ADVOGADOS ASSOCIADOS</div>
      </td></tr>
      <tr><td style="padding:38px 36px 42px;">${content}</td></tr>
    </table>
  </body></html>`;
}

function leadEmail(data, links) {
  return emailFrame(`
    <div style="font:500 10px/1.5 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#74746f;">Saúde mental no trabalho · NR-1</div>
    <h1 style="margin:14px 0 16px;font:500 30px/1.18 Montserrat,Arial,sans-serif;letter-spacing:-.03em;color:#171717;">Tudo certo, ${escapeHtml(data.nome.split(/\s+/)[0])}.</h1>
    <p style="margin:0 0 28px;font:400 15px/1.75 Arial,sans-serif;color:#454543;">Seus dois e-books estão disponíveis. Use os botões abaixo para baixar cada volume.</p>
    <p style="margin:0 0 10px;"><a href="${escapeHtml(links.volume1)}" style="display:block;padding:16px 20px;background:#171717;color:#fff;text-decoration:none;font:500 12px/1.4 Arial,sans-serif;letter-spacing:.05em;">Volume 1 — Guia de Conformidade à NR-1</a></p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(links.volume2)}" style="display:block;padding:16px 20px;background:#f8ad00;color:#171717;text-decoration:none;font:500 12px/1.4 Arial,sans-serif;letter-spacing:.05em;">Volume 2 — Decisões Difíceis de RH</a></p>
    <p style="margin:0;font:400 11px/1.7 Arial,sans-serif;color:#74746f;">Material exclusivamente informativo, sem custo e sem compromisso.</p>
  `);
}

function notificationEmail(data, meta) {
  const row = (label, value) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e4e1da;width:150px;font:500 10px/1.5 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#74746f;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:11px 0;border-bottom:1px solid #e4e1da;font:400 14px/1.5 Arial,sans-serif;color:#171717;">${value}</td></tr>`;
  return emailFrame(`
    <div style="font:500 10px/1.5 Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#74746f;">Novo lead · E-books NR-1</div>
    <h1 style="margin:14px 0 22px;font:500 28px/1.18 Montserrat,Arial,sans-serif;letter-spacing:-.03em;color:#171717;">${escapeHtml(data.empresa)}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row('Nome', escapeHtml(data.nome))}
      ${row('Empresa', escapeHtml(data.empresa))}
      ${row('Cargo / área', escapeHtml(data.cargo))}
      ${row('E-mail', `<a href="mailto:${escapeHtml(data.email)}" style="color:#171717;">${escapeHtml(data.email)}</a>`)}
      ${row('Telefone', `<a href="tel:+55${escapeHtml(data.digits)}" style="color:#171717;">${escapeHtml(data.telefone)}</a>`)}
      ${row('LGPD', 'Consentimento aceito')}
    </table>
    <p style="margin:24px 0 0;font:400 10px/1.7 Arial,sans-serif;color:#74746f;">${escapeHtml(meta.when)}<br>Origem: ${escapeHtml(meta.origin)}<br>IP: ${escapeHtml(meta.ip)}</p>
  `);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  // Honeypot: bots recebem uma resposta neutra sem disparar e-mails.
  if (String(body.website || '').trim()) return res.status(200).json({ ok: true });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';
  if (tooMany(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const { data, errors } = validate(body);
  if (errors.length) return res.status(400).json({ ok: false, error: 'invalid', fields: errors });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY ausente');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  const baseUrl = publicBaseUrl(req);
  const links = {
    volume1: process.env.NR1_EBOOK_1_URL || `${baseUrl}/guia-conformidade-nr1-benicio.pdf`,
    volume2: process.env.NR1_EBOOK_2_URL || `${baseUrl}/decisoes-dificeis-rh-benicio.pdf`,
  };
  const meta = {
    when: `${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)`,
    origin: req.headers.referer || req.headers.origin || 'direto',
    ip,
  };
  const from = normalizeFrom(process.env.LEAD_FROM || DEFAULT_FROM);
  const configuredTo = process.env.NR1_LEAD_TO || process.env.LEAD_TO;
  const configuredRecipients = extractAsciiEmails(configuredTo);
  const internalTo = configuredRecipients.length ? configuredRecipients : [DEFAULT_TO];
  if (configuredTo && !configuredRecipients.length) {
    console.warn('Destinatario interno invalido; usando o endereco padrao');
  }
  const messages = [
    {
      from,
      to: [data.email],
      subject: 'Seus e-books sobre saúde mental no trabalho e NR-1',
      html: leadEmail(data, links),
      text: `Olá, ${data.nome.split(/\s+/)[0]}.\n\nSeus e-books estão disponíveis:\nVolume 1 — ${links.volume1}\nVolume 2 — ${links.volume2}\n\nBenício Advogados Associados`,
    },
    {
      from,
      to: internalTo,
      reply_to: data.email,
      subject: `Novo lead — ${data.empresa} — E-books NR-1`,
      html: notificationEmail(data, meta),
      text: `Novo lead — E-books NR-1\n\nNome: ${data.nome}\nEmpresa: ${data.empresa}\nCargo / área: ${data.cargo}\nE-mail: ${data.email}\nTelefone: ${data.telefone}\nLGPD: aceito\n\n${meta.when}\nOrigem: ${meta.origin}\nIP: ${meta.ip}`,
    },
  ];
  if (process.env.LEAD_BCC) messages[1].bcc = [process.env.LEAD_BCC];

  try {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.error('Resend', response.status, await response.text());
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Resend exception', error);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
