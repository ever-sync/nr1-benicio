const esc = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (_) { body = {}; }
  body = body || {};
  if (String(body.website || '').trim()) return res.status(200).json({ ok: true });
  const nome = String(body.nome || '').trim();
  const empresa = String(body.empresa || '').trim();
  const email = String(body.email || '').trim();
  const tel = String(body.tel || '').trim();
  const mensagem = String(body.mensagem || '').trim().slice(0, 3000);
  if (nome.length < 3 || empresa.length < 2 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || tel.replace(/\D/g, '').length < 10 || body.lgpd !== true) return res.status(400).json({ ok: false, error: 'invalid' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ ok: false, error: 'not_configured' });
  const html = `<h2>Novo pedido de consultoria — Reforma Tributária</h2><p><strong>Nome:</strong> ${esc(nome)}</p><p><strong>Empresa:</strong> ${esc(empresa)}</p><p><strong>E-mail:</strong> ${esc(email)}</p><p><strong>Telefone:</strong> ${esc(tel)}</p><p><strong>Mensagem:</strong><br>${esc(mensagem).replace(/\n/g, '<br>')}</p><p><small>Consentimento LGPD aceito.</small></p>`;
  const payload = {from: process.env.LEAD_FROM || 'Site Benício <site@benicio.com.br>',to:[process.env.LEAD_TO || 'novosnegocios@benicio.com.br'],reply_to:email,subject:`Consultoria Reforma Tributária — ${empresa}`,html};
  if (process.env.LEAD_BCC) payload.bcc = [process.env.LEAD_BCC];
  try { const r = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}); if (!r.ok) return res.status(502).json({ok:false}); return res.status(200).json({ok:true}); } catch (_) { return res.status(502).json({ok:false}); }
};
