import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

// ─── Brands ───────────────────────────────────────────────────────────────────
// Only these 9 brands run a Strapi CMS. Any other brand has no CMS to check.

export const STRAPI_BRANDS = ['GC', 'I36', 'LP', 'MC', 'PC', 'PSL', 'SC', 'SNG', 'ZI'] as const;
export type StrapiBrand = typeof STRAPI_BRANDS[number];

type AuthMode = 'token' | 'admin-login';

// ─── Client ──────────────────────────────────────────────────────────────────
// Auth is resolved per brand from .env:
//   Preferred: STRAPI_<BRAND>_TOKEN            → Bearer token against the public /api/ routes
//   Fallback:  STRAPI_<BRAND>_USERNAME/_PASSWORD → admin panel login against /content-manager/ routes
// Never hardcode either here — both come from the caller's local .env only.

export class StrapiClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private brand: StrapiBrand;
  private authMode: AuthMode;
  private username?: string;
  private password?: string;
  private jwt: string | null = null;

  constructor(brand: StrapiBrand) {
    const prefix = `STRAPI_${brand}`;
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const token = process.env[`${prefix}_TOKEN`];
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];

    if (!baseUrl) {
      throw new Error(`Missing ${prefix}_BASE_URL in .env`);
    }
    if (!token && !(username && password)) {
      throw new Error(
        `Missing Strapi credentials for ${brand}. Set either ${prefix}_TOKEN, ` +
        `or ${prefix}_USERNAME + ${prefix}_PASSWORD in .env`
      );
    }

    this.brand = brand;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authMode = token ? 'token' : 'admin-login';
    this.username = username;
    this.password = password;

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });

    if (token) {
      this.http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }

  // ── Admin login (only used when no API token is configured for this brand) ──
  private async ensureAdminSession(): Promise<void> {
    if (this.authMode !== 'admin-login' || this.jwt) return;

    const res = await this.http.post('/admin/login', {
      email: this.username,
      password: this.password,
    });
    this.jwt = res.data?.data?.token ?? null;
    if (!this.jwt) {
      throw new Error(`Strapi admin login failed for brand ${this.brand}`);
    }
    this.http.defaults.headers.common['Authorization'] = `Bearer ${this.jwt}`;
  }

  // ── Verify credentials work, without exposing them ──────────────────────────
  // Returns true/false only. Never logs the token, JWT, email, or password —
  // safe to call from a diagnostic script.
  async verifyAuth(): Promise<{ ok: boolean; mode: AuthMode; error?: string }> {
    try {
      if (this.authMode === 'token') {
        await this.http.get('/api', { validateStatus: () => true });
      } else {
        await this.ensureAdminSession();
      }
      return { ok: true, mode: this.authMode };
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      const message = status ? `HTTP ${status}` : (e instanceof Error ? e.message : 'Unknown error');
      return { ok: false, mode: this.authMode, error: message };
    }
  }

  // ── List all registered content types (admin-login mode only) ───────────────
  // Used to discover real content-type UIDs (e.g. "api::promotion.promotion")
  // so getEntries/getEntry can be wired up correctly per brand.
  async listContentTypes(): Promise<{ uid: string; displayName: string; kind: string }[]> {
    await this.ensureAdminSession();
    if (this.authMode !== 'admin-login') {
      throw new Error('listContentTypes() requires admin-login mode (no equivalent public /api/ route)');
    }
    const res = await this.http.get('/content-manager/content-types');
    return (res.data?.data ?? [])
      .filter((ct: any) => ct.uid?.startsWith('api::'))
      .map((ct: any) => ({
        uid: ct.uid,
        displayName: ct.info?.displayName ?? ct.uid,
        kind: ct.kind ?? 'unknown',
      }));
  }

  // ── List entries of a content type ───────────────────────────────────────────
  // `contentTypeUid` must match how the collection is actually registered in
  // Strapi (e.g. "api::promo-banner.promo-banner") — confirm the real UIDs per
  // brand before wiring this into the QA agent; the two auth modes hit different
  // route families so the UID format below is a placeholder, not verified yet.
  async getEntries(contentTypeUid: string, params: Record<string, unknown> = {}): Promise<any[]> {
    await this.ensureAdminSession();
    if (this.authMode === 'token') {
      const res = await this.http.get(`/api/${contentTypeUid}`, { params });
      return res.data.data;
    }
    const res = await this.http.get(`/content-manager/collection-types/${contentTypeUid}`, { params });
    return res.data.results;
  }

  // ── Fetch a single entry by id ────────────────────────────────────────────────
  async getEntry(contentTypeUid: string, id: string | number): Promise<any> {
    await this.ensureAdminSession();
    if (this.authMode === 'token') {
      const res = await this.http.get(`/api/${contentTypeUid}/${id}`);
      return res.data.data;
    }
    const res = await this.http.get(`/content-manager/collection-types/${contentTypeUid}/${id}`);
    return res.data;
  }
}
