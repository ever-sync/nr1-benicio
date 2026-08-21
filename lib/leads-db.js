const { Pool } = require('pg');

let pool;
let schemaReady;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS benicio_leads (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        nome text NOT NULL,
        empresa text NOT NULL,
        cnpj text NOT NULL,
        email text NOT NULL,
        telefone text NOT NULL,
        mensagem text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_contato','convertido','arquivado')),
        notas text NOT NULL DEFAULT '',
        report_html text NOT NULL,
        email_sent boolean NOT NULL DEFAULT false,
        source text NOT NULL DEFAULT 'reforma_tributaria',
        cargo text NOT NULL DEFAULT '',
        regime text NOT NULL DEFAULT ''
      );
      ALTER TABLE benicio_leads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'reforma_tributaria';
      ALTER TABLE benicio_leads ADD COLUMN IF NOT EXISTS cargo text NOT NULL DEFAULT '';
      ALTER TABLE benicio_leads ADD COLUMN IF NOT EXISTS regime text NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS benicio_leads_created_at_idx ON benicio_leads (created_at DESC);
      CREATE INDEX IF NOT EXISTS benicio_leads_status_idx ON benicio_leads (status);
      CREATE INDEX IF NOT EXISTS benicio_leads_source_idx ON benicio_leads (source);
    `).catch((error) => { schemaReady = undefined; throw error; });
  }
  return schemaReady;
}

async function saveLead(lead) {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO benicio_leads (id,nome,empresa,cnpj,email,telefone,mensagem,report_html,email_sent,source,cargo,regime)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [lead.id, lead.nome, lead.empresa, '', lead.email, lead.telefone, lead.mensagem, lead.reportHtml, false, 'nr1', lead.cargo, '']
  );
}

async function markEmailSent(id) {
  await ensureSchema();
  await getPool().query('UPDATE benicio_leads SET email_sent=true, updated_at=now() WHERE id=$1', [id]);
}

module.exports = { markEmailSent, saveLead };
