/**
 * Computes SHA-256 hash using browser native Web Crypto API.
 */
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a secure random string of specified length.
 */
export function generateRandomString(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

/**
 * Generates random credentials bundle.
 */
export function generateRandomCredentials() {
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const randPathNum = Math.floor(1000 + Math.random() * 9000);
  
  return {
    adminUsername: `admin_${randNum}`,
    adminPassword: generateRandomString(16),
    adminPath: `/manage-x${randPathNum}`,
  };
}
