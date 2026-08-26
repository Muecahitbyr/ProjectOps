import { pool } from "./pool";
import type { Email } from "../types/email.types";

interface EmailRow {
  id: string | number;
  message_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | Date;
  read: boolean;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: EmailRow): Email {
  return {
    id: Number(row.id),
    messageId: row.message_id,
    fromAddress: row.from_address,
    fromName: row.from_name,
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: toIsoString(row.received_at),
    read: row.read,
    createdAt: toIsoString(row.created_at),
  };
}

const EMAIL_COLUMNS = `id, message_id, from_address, from_name, subject, snippet, received_at, read, created_at`;

export async function listEmails(limit = 50): Promise<Email[]> {
  const { rows } = await pool.query<EmailRow>(`SELECT ${EMAIL_COLUMNS} FROM emails ORDER BY received_at DESC LIMIT $1`, [limit]);
  return rows.map(mapRow);
}

export async function getEmailByMessageId(messageId: string): Promise<Email | undefined> {
  const { rows } = await pool.query<EmailRow>(`SELECT ${EMAIL_COLUMNS} FROM emails WHERE message_id = $1`, [messageId]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// ON CONFLICT DO NOTHING statt vorherigem SELECT - message_id ist UNIQUE,
// wiederholtes Polling derselben IMAP-Nachricht legt keine zweite Zeile an.
// Gibt undefined zurueck, wenn die Mail bereits bekannt war (kein neues
// Realtime-Event noetig).
export async function insertEmailIfNew(input: {
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
}): Promise<Email | undefined> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (message_id, from_address, from_name, subject, snippet, received_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING ${EMAIL_COLUMNS}`,
    [input.messageId, input.fromAddress, input.fromName, input.subject, input.snippet, input.receivedAt],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function markEmailRead(id: number, read: boolean): Promise<Email | undefined> {
  const { rows } = await pool.query<EmailRow>(`UPDATE emails SET read = $1 WHERE id = $2 RETURNING ${EMAIL_COLUMNS}`, [read, id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
