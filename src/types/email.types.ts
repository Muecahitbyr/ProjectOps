export interface Email {
  id: number;
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
  read: boolean;
  createdAt: string;
}
