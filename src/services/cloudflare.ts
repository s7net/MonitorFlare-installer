export interface CloudflareAccount {
  id: string;
  name: string;
}

/**
 * CORS Proxy Worker URL — routes all Cloudflare API calls through this Worker
 * to bypass browser CORS restrictions.
 *
 * Set VITE_CORS_PROXY_URL in the .env file to configure this address.
 * After changing .env, run "npm run build" to apply.
 */
const PROXY_BASE = `${import.meta.env.VITE_CORS_PROXY_URL}/proxy`;

/**
 * Build a proxied URL for a given Cloudflare API path.
 * e.g. cfUrl('/client/v4/accounts') → https://proxy.../proxy/client/v4/accounts
 */
function cfUrl(path: string): string {
  // path should start with /client/v4/...
  return `${PROXY_BASE}${path}`;
}

/**
 * Wrapper fetch that always includes the Authorization header
 * and routes through the CORS proxy.
 */
async function cfFetch(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token.trim()}`);
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(cfUrl(path), {
    ...options,
    headers,
  });
}

export class CloudflareService {
  /**
   * Verifies if the provided Cloudflare API Token is valid.
   */
  static async verifyToken(apiToken: string): Promise<boolean> {
    const cleanToken = apiToken.trim();
    if (!cleanToken) return false;

    // Primary: /user/tokens/verify
    try {
      const res = await cfFetch(cleanToken, '/client/v4/user/tokens/verify');
      if (res.ok) {
        const data = (await res.json()) as { success: boolean };
        if (data.success) return true;
      }
    } catch {}

    // Fallback: check accounts list
    try {
      const accs = await this.getAccounts(cleanToken);
      return accs.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetches the user's Cloudflare Accounts.
   */
  static async getAccounts(apiToken: string): Promise<CloudflareAccount[]> {
    const cleanToken = apiToken.trim();
    const res = await cfFetch(cleanToken, '/client/v4/accounts');
    const data = (await res.json()) as {
      success: boolean;
      result?: CloudflareAccount[];
      errors?: Array<{ message: string }>;
    };
    if (res.ok && data.success && data.result) {
      return data.result.map((acc) => ({ id: acc.id, name: acc.name }));
    }
    throw new Error(
      data.errors?.[0]?.message ||
        'Failed to retrieve Cloudflare Accounts. Ensure API token has Account Read permissions.'
    );
  }

  /**
   * Fetches the user's Workers subdomain for the specified Cloudflare account.
   * e.g. "ahsvip" for "ahsvip.workers.dev"
   */
  static async getWorkersSubdomain(apiToken: string, accountId: string): Promise<string> {
    const cleanToken = apiToken.trim();
    try {
      const res = await cfFetch(cleanToken, `/client/v4/accounts/${accountId}/workers/subdomain`);
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          result?: { subdomain?: string };
        };
        if (data.success && data.result?.subdomain) {
          return data.result.subdomain;
        }
      }
    } catch {}
    return '';
  }

  /**
   * Provisions a new D1 Serverless Database.
   */
  static async createD1Database(
    apiToken: string,
    accountId: string,
    name: string = 'monitorflare'
  ): Promise<string> {
    const cleanToken = apiToken.trim();
    const res = await cfFetch(
      cleanToken,
      `/client/v4/accounts/${accountId}/d1/database`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      }
    );

    const data = (await res.json()) as {
      success: boolean;
      result?: { uuid: string };
      errors?: Array<{ message: string }>;
    };

    if (res.ok && data.success && data.result?.uuid) {
      return data.result.uuid;
    }

    // If database already exists, list databases to find uuid
    if (data.errors && data.errors.some((e) => e.message.includes('already exists'))) {
      const listRes = await cfFetch(
        cleanToken,
        `/client/v4/accounts/${accountId}/d1/database`
      );
      const listData = (await listRes.json()) as {
        success: boolean;
        result?: Array<{ uuid: string; name: string }>;
      };
      const existing = listData.result?.find((d) => d.name === name);
      if (existing) return existing.uuid;
    }

    throw new Error(data.errors?.[0]?.message || 'Failed to create Cloudflare D1 Database');
  }

  /**
   * Executes SQL Statements on Cloudflare D1 via REST API.
   */
  static async executeD1Query(
    apiToken: string,
    accountId: string,
    databaseId: string,
    sql: string,
    params: unknown[] = []
  ): Promise<unknown> {
    const cleanToken = apiToken.trim();
    const res = await cfFetch(
      cleanToken,
      `/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({ sql, params }),
      }
    );

    const data = (await res.json()) as {
      success: boolean;
      errors?: Array<{ message: string }>;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.errors?.[0]?.message || 'D1 SQL Query execution failed');
    }
    return data;
  }

  /**
   * Executes all D1 Table Migrations (0000 - 0004) directly from browser.
   */
  static async applyAllMigrations(
    apiToken: string,
    accountId: string,
    databaseId: string
  ): Promise<void> {
    const migrations = [
      // 1. Services Table
      `CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        method TEXT DEFAULT 'GET' NOT NULL,
        timeout INTEGER DEFAULT 10000 NOT NULL,
        expected_status INTEGER DEFAULT 200 NOT NULL,
        created_at INTEGER NOT NULL,
        check_type TEXT NOT NULL DEFAULT 'direct',
        check_regions TEXT,
        show_url INTEGER NOT NULL DEFAULT 1,
        last_checked_at INTEGER,
        last_status TEXT,
        globalping_type TEXT NOT NULL DEFAULT 'http',
        headers TEXT,
        keyword TEXT,
        group_name TEXT,
        ssl_check INTEGER NOT NULL DEFAULT 0,
        heartbeat_token TEXT,
        heartbeat_interval INTEGER,
        max_retries INTEGER NOT NULL DEFAULT 1,
        consecutive_fails INTEGER NOT NULL DEFAULT 0
      );`,

      // 2. Health Checks Table
      `CREATE TABLE IF NOT EXISTS health_checks (
        id TEXT PRIMARY KEY NOT NULL,
        service_id TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time INTEGER NOT NULL,
        status_code INTEGER,
        error TEXT,
        timestamp INTEGER NOT NULL,
        region TEXT
      );`,

      // 3. Notifications Table
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER DEFAULT 1 NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );`,

      // 4. Settings Table
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`,

      // 5. Incidents Table
      `CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'warning',
        is_active INTEGER NOT NULL DEFAULT 1,
        start_at INTEGER NOT NULL,
        end_at INTEGER,
        created_at INTEGER NOT NULL
      );`,
    ];

    for (const sql of migrations) {
      await this.executeD1Query(apiToken, accountId, databaseId, sql);
    }
  }

  /**
   * Seeds initial settings into D1.
   */
  static async seedSettings(
    apiToken: string,
    accountId: string,
    databaseId: string,
    settings: Record<string, string>
  ): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.executeD1Query(
        apiToken,
        accountId,
        databaseId,
        `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [key, value]
      );
    }

    // Mark as installed
    await this.executeD1Query(
      apiToken,
      accountId,
      databaseId,
      `INSERT INTO settings (key, value) VALUES ('installed', '1') ON CONFLICT(key) DO UPDATE SET value = '1';`
    );
  }

  /**
   * Tests Telegram Bot Token & Chat ID directly from client.
   */
  static async testTelegramBot(botToken: string, chatId: string): Promise<boolean> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '⚡️ MonitorFlare Auto-Installer Test Message\n\nYour Telegram Alert Bot connection is verified!',
        parse_mode: 'HTML',
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    return res.ok && data.ok;
  }

  /**
   * Uploads and deploys the pre-compiled Worker script with D1 Database binding via REST API.
   */
  static async deployWorkerScript(
    apiToken: string,
    accountId: string,
    scriptName: string,
    databaseId: string,
    scriptContent: string
  ): Promise<boolean> {
    const cleanToken = apiToken.trim();
    const cleanScriptName = scriptName.trim().toLowerCase();

    const metadata = {
      main_module: 'index.js',
      compatibility_date: '2024-09-23',
      compatibility_flags: ['nodejs_compat_v2'],
      bindings: [
        {
          name: 'DB',
          type: 'd1',
          id: databaseId,
        },
      ],
    };

    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    formData.append(
      'index.js',
      new Blob([scriptContent], { type: 'application/javascript+module' }),
      'index.js'
    );

    const res = await fetch(cfUrl(`/client/v4/accounts/${accountId}/workers/scripts/${cleanScriptName}`), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
      body: formData,
    });

    const data = (await res.json()) as { success: boolean; errors?: Array<{ message: string }> };
    if (res.ok && data.success) {
      return true;
    }
    throw new Error(data.errors?.[0]?.message || 'Failed to deploy Worker script to Cloudflare');
  }

  /**
   * Enables the workers.dev subdomain route for the deployed script.
   */
  static async enableWorkerSubdomain(
    apiToken: string,
    accountId: string,
    scriptName: string
  ): Promise<boolean> {
    const cleanToken = apiToken.trim();
    const cleanScriptName = scriptName.trim().toLowerCase();

    const res = await cfFetch(
      cleanToken,
      `/client/v4/accounts/${accountId}/workers/scripts/${cleanScriptName}/subdomain`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      }
    );

    const data = (await res.json()) as { success: boolean };
    return res.ok && data.success;
  }

  /**
   * Configures cron triggers (* * * * *) so health checks run automatically every minute.
   */
  static async enableWorkerCronTriggers(
    apiToken: string,
    accountId: string,
    scriptName: string
  ): Promise<boolean> {
    const cleanToken = apiToken.trim();
    const cleanScriptName = scriptName.trim().toLowerCase();

    try {
      const res = await cfFetch(
        cleanToken,
        `/client/v4/accounts/${accountId}/workers/scripts/${cleanScriptName}/schedules`,
        {
          method: 'PUT',
          body: JSON.stringify([{ cron: '* * * * *' }]),
        }
      );
      const data = (await res.json()) as { success: boolean };
      return res.ok && data.success;
    } catch {
      return false;
    }
  }
}

