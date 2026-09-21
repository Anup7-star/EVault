const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    if (!isJson) {
      const text = await res.text();
      throw new Error(text || `Request failed with status ${res.status}`);
    }
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export const apiClient = {
  getNonce: (address: string) => fetchApi(`/auth/nonce?address=${address}`),
  verifySiwe: (message: string, signature: string) =>
    fetchApi(`/auth/verify`, {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    }),
  listVaults: (token: string) =>
    fetchApi(`/vaults`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getVault: (token: string, vaultId: string) =>
    fetchApi(`/vaults/${vaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  getSecret: (token: string, vaultId: string) =>
    fetchApi(`/vaults/${vaultId}/secret`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  createVault: (
    token: string,
    payload: { blockchainVaultId: number; name: string; description: string; storageReference: string; secret: string }
  ) =>
    fetchApi(`/vaults`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
  listPermissions: (token: string, vaultId: string) =>
    fetchApi(`/vaults/${vaultId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  grantPermission: (
    token: string,
    vaultId: string,
    payload: { walletAddress: string; role: number; expiresAt: string }
  ) =>
    fetchApi(`/vaults/${vaultId}/permissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),
  revokePermission: (token: string, vaultId: string, wallet: string) =>
    fetchApi(`/vaults/${vaultId}/permissions/${wallet}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
};
