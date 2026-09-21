const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Helper for local storage mock store persistence when backend is offline
const STORAGE_KEYS = {
  VAULTS: "evault_mock_vaults_v1",
  PERMISSIONS: "evault_mock_permissions_v1",
};

function getLocalStore<T>(key: string, defaultVal: T): T {
  if (typeof window === "undefined") return defaultVal;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocalStore<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error("Failed to write to localStorage:", e);
  }
}

// Initial demo data for fallback mode
const INITIAL_MOCK_VAULTS = [
  {
    id: "v-demo-1",
    blockchainVaultId: 0,
    name: "Production DB Credentials",
    description: "Primary database connection strings & TLS keys.",
    storageReference: "s3://evault-secure/prod-db",
    secret: "postgres://admin:SuperSecretKey2026@prod-db.evault.internal:5432/main",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "v-demo-2",
    blockchainVaultId: 1,
    name: "AWS KMS Root Master Key",
    description: "Root cryptographic key for cloud infrastructure.",
    storageReference: "kms://arn:aws:kms:us-east-1:1234567890:key/root-master",
    secret: "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

async function mockApiFallback(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method || "GET").toUpperCase();
  let body: any = {};
  if (options.body) {
    try {
      body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    } catch {
      body = {};
    }
  }

  // 1. GET /auth/nonce?address=0x...
  if (endpoint.startsWith("/auth/nonce")) {
    // EIP-4361 requires nonce to be purely alphanumeric (minimum 8 characters, no underscores or special chars)
    const nonce = (Math.random().toString(36).substring(2, 12) + Date.now().toString(36)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
    return { nonce };
  }

  // 2. POST /auth/verify
  if (endpoint.startsWith("/auth/verify")) {
    let walletAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    if (body.message) {
      const match = body.message.match(/0x[a-fA-F0-9]{40}/);
      if (match) walletAddress = match[0];
    }
    const token = "mock_jwt_token_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    return { token, walletAddress };
  }

  // Ensure mock vaults store exists
  let vaults = getLocalStore(STORAGE_KEYS.VAULTS, INITIAL_MOCK_VAULTS);
  let permissions = getLocalStore<any[]>(STORAGE_KEYS.PERMISSIONS, []);

  // 3. GET /vaults
  if (endpoint === "/vaults" && method === "GET") {
    return vaults;
  }

  // 4. POST /vaults (create vault)
  if (endpoint === "/vaults" && method === "POST") {
    const newVault = {
      id: `v-${Date.now()}`,
      blockchainVaultId: Number(body.blockchainVaultId ?? vaults.length),
      name: body.name || "Untitled Vault",
      description: body.description || "",
      storageReference: body.storageReference || "",
      secret: body.secret || "",
      createdAt: new Date().toISOString(),
    };
    vaults.unshift(newVault);
    setLocalStore(STORAGE_KEYS.VAULTS, vaults);
    return newVault;
  }

  // 5. GET /vaults/:id/secret
  const secretMatch = endpoint.match(/^\/vaults\/([^/]+)\/secret$/);
  if (secretMatch && method === "GET") {
    const vaultId = secretMatch[1];
    const vault = vaults.find((v) => v.id === vaultId || String(v.blockchainVaultId) === vaultId);
    if (!vault) throw new Error("Vault secret not found or access denied");
    return { secret: vault.secret };
  }

  // 6. GET /vaults/:id/permissions
  const listPermsMatch = endpoint.match(/^\/vaults\/([^/]+)\/permissions$/);
  if (listPermsMatch && method === "GET") {
    const vaultId = listPermsMatch[1];
    return permissions.filter((p) => p.vaultId === vaultId);
  }

  // 7. POST /vaults/:id/permissions (grant)
  if (listPermsMatch && method === "POST") {
    const vaultId = listPermsMatch[1];
    const newPerm = {
      id: `perm-${Date.now()}`,
      vaultId,
      walletAddress: (body.walletAddress || "").toLowerCase(),
      role: body.role ?? 2,
      expiresAt: body.expiresAt || new Date(Date.now() + 86400000).toISOString(),
      grantedAt: new Date().toISOString(),
    };
    permissions.push(newPerm);
    setLocalStore(STORAGE_KEYS.PERMISSIONS, permissions);
    return newPerm;
  }

  // 8. DELETE /vaults/:id/permissions/:wallet (revoke)
  const revokePermMatch = endpoint.match(/^\/vaults\/([^/]+)\/permissions\/([^/]+)$/);
  if (revokePermMatch && method === "DELETE") {
    const vaultId = revokePermMatch[1];
    const wallet = revokePermMatch[2].toLowerCase();
    permissions = permissions.filter((p) => !(p.vaultId === vaultId && p.walletAddress.toLowerCase() === wallet));
    setLocalStore(STORAGE_KEYS.PERMISSIONS, permissions);
    return { success: true };
  }

  // 9. GET /vaults/:id
  const getVaultMatch = endpoint.match(/^\/vaults\/([^/]+)$/);
  if (getVaultMatch && method === "GET") {
    const vaultId = getVaultMatch[1];
    const vault = vaults.find((v) => v.id === vaultId || String(v.blockchainVaultId) === vaultId);
    if (!vault) throw new Error(`Vault #${vaultId} not found`);
    return vault;
  }

  return { success: true };
}

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  try {
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
  } catch (err: any) {
    // If backend server is unreachable (Failed to fetch / connection refused), use mock fallback
    if (
      err instanceof TypeError ||
      err?.message?.includes("Failed to fetch") ||
      err?.message?.includes("fetch failed") ||
      err?.message?.includes("NetworkError")
    ) {
      console.warn(`[EVault API Client] Remote backend unreachable (${url}). Switched to local fallback API.`);
      return mockApiFallback(endpoint, options);
    }
    throw err;
  }
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
