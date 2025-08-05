import { Pool } from "@neondatabase/serverless";

export async function getUserById(db: Pool, userId: string) {
  const result = await db.query(
    'SELECT id, email, name, image FROM "user" WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getAccountByUserIdAndProvider(db: Pool, userId: string, providerId: string) {
  const result = await db.query(
    'SELECT * FROM account WHERE "userId" = $1 AND "providerId" = $2',
    [userId, providerId]
  );
  return result.rows[0] || null;
}

export async function getAccountById(db: Pool, accountId: string) {
  const result = await db.query(
    'SELECT * FROM account WHERE id = $1',
    [accountId]
  );
  return result.rows[0] || null;
}

export async function getUserByEmail(db: Pool, email: string) {
  const result = await db.query(
    'SELECT * FROM "user" WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function getSessionByUserId(db: Pool, userId: string) {
  const result = await db.query(
    'SELECT "mcpAccessToken" FROM session WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function deleteAccount(db: Pool, userId: string, providerId: string) {
  const result = await db.query(
    'DELETE FROM account WHERE "userId" = $1 AND "providerId" = $2',
    [userId, providerId]
  );
  return result.rowCount || 0;
}

export async function getAccountsByUserId(db: Pool, userId: string) {
  const result = await db.query(
    'SELECT * FROM account WHERE "userId" = $1',
    [userId]
  );
  return result.rows;
}

export async function isProviderConnected(db: Pool, userId: string, providerId: string): Promise<{ connected: boolean; accountId?: string }> {
  const account = await getAccountByUserIdAndProvider(db, userId, providerId);
  
  if (account && account.accessToken) {
    return { connected: true, accountId: account.id };
  }
  
  return { connected: false };
}

export async function updateAccountTokens(
  db: Pool, 
  userId: string, 
  providerId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
  }
) {
  const query = tokens.refreshToken 
    ? `UPDATE account 
       SET "accessToken" = $1, "refreshToken" = $2, "accessTokenExpiresAt" = $3, "updatedAt" = NOW()
       WHERE "userId" = $4 AND "providerId" = $5`
    : `UPDATE account 
       SET "accessToken" = $1, "accessTokenExpiresAt" = $2, "updatedAt" = NOW()
       WHERE "userId" = $3 AND "providerId" = $4`;
  
  const params = tokens.refreshToken
    ? [tokens.accessToken, tokens.refreshToken, tokens.expiresAt, userId, providerId]
    : [tokens.accessToken, tokens.expiresAt, userId, providerId];
  
  const result = await db.query(query, params);
  return result.rowCount || 0;
}