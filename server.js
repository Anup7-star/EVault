const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { SiweMessage } = require("siwe");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || "evault_jwt_production_secret_2026_key";

// 256-bit (32 bytes = 64 hex chars) AES-GCM encryption key
let ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY_HEX;
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
  ENCRYPTION_KEY_HEX = crypto.randomBytes(32).toString("hex");
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, "hex");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Persistent Disk Database Engine ──────────────────────────────────────────
const DB_FILE = path.join(__dirname, "evault_db_store.json");

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading database file, initializing fresh store:", e);
  }
  return {
    nonces: {},      // address -> { nonce, expiresAt }
    vaults: [],      // array of vault objects
    permissions: [], // array of permission objects
  };
}

function saveDb(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving database file:", e);
  }
}

let db = loadDb();

// Seed initial default vaults if DB is brand new
if (db.vaults.length === 0) {
  const initialVaults = [
    {
      id: "v-demo-1",
      blockchainVaultId: 0,
      name: "Production DB Credentials",
      description: "Primary database connection strings & TLS keys.",
      storageReference: "s3://evault-secure/prod-db",
      creatorAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(),
      encryptedSecretHex: "",
      ivHex: "",
      authTagHex: "",
      plainSecret: "postgres://admin:SuperSecretKey2026@prod-db.evault.internal:5432/main",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "v-demo-2",
      blockchainVaultId: 1,
      name: "AWS KMS Root Master Key",
      description: "Root cryptographic key for cloud infrastructure.",
      storageReference: "kms://arn:aws:kms:us-east-1:1234567890:key/root-master",
      creatorAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase(),
      encryptedSecretHex: "",
      ivHex: "",
      authTagHex: "",
      plainSecret: "AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  // Encrypt secrets with AES-256-GCM
  initialVaults.forEach((v) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(v.plainSecret, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    v.encryptedSecretHex = encrypted;
    v.ivHex = iv.toString("hex");
    v.authTagHex = authTag;
    delete v.plainSecret;
  });

  db.vaults = initialVaults;
  saveDb(db);
}

// Helper: AES-256-GCM Encrypt
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedSecretHex: encrypted,
    ivHex: iv.toString("hex"),
    authTagHex: authTag,
  };
}

// Helper: AES-256-GCM Decrypt
function decryptSecret(encryptedSecretHex, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ENCRYPTION_KEY,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedSecretHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Middleware: Authenticate Bearer JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing authentication token" });

  jwt.verify(token, SESSION_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired session token" });
    req.user = user; // { walletAddress }
    next();
  });
}

// ── Real SIWE Authentication Endpoints ───────────────────────────────────────

// 1. GET /auth/nonce?address=0x...
app.get("/auth/nonce", (req, res) => {
  const address = (req.query.address || "").toString().toLowerCase();
  if (!address || !address.startsWith("0x")) {
    return res.status(400).json({ error: "Invalid wallet address parameter" });
  }

  // EIP-4361 compliant 16-character alphanumeric nonce (no underscores)
  const nonce = crypto.randomBytes(8).toString("hex");
  db.nonces[address] = {
    nonce,
    expiresAt: Date.now() + 300000, // 5 minutes validity
  };
  saveDb(db);

  res.json({ nonce });
});

// 2. POST /auth/verify { message, signature }
app.post("/auth/verify", async (req, res) => {
  const { message, signature } = req.body;
  if (!message || !signature) {
    return res.status(400).json({ error: "Missing message or signature payload" });
  }

  try {
    const siweMessage = new SiweMessage(message);
    const { data: fields } = await siweMessage.verify({ signature });

    const normalizedAddress = fields.address.toLowerCase();
    const storedNonceObj = db.nonces[normalizedAddress];

    if (!storedNonceObj || storedNonceObj.nonce !== fields.nonce) {
      return res.status(422).json({ error: "Invalid or expired SIWE nonce" });
    }

    if (storedNonceObj.expiresAt < Date.now()) {
      delete db.nonces[normalizedAddress];
      saveDb(db);
      return res.status(422).json({ error: "SIWE nonce expired" });
    }

    // Consume nonce to prevent replay attacks
    delete db.nonces[normalizedAddress];
    saveDb(db);

    // Issue real signed JWT session token (12h validity)
    const token = jwt.sign(
      { walletAddress: normalizedAddress },
      SESSION_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token, walletAddress: normalizedAddress });
  } catch (e) {
    console.error("SIWE signature verification failed:", e);
    res.status(400).json({ error: e.message || "Cryptographic signature verification failed" });
  }
});

// ── Real Vault & Permissions Management API ─────────────────────────────────

// 3. GET /vaults — List all accessible vaults
app.get("/vaults", authenticateToken, (req, res) => {
  const wallet = req.user.walletAddress.toLowerCase();
  
  // Return vaults created by wallet OR granted to wallet
  const userVaults = db.vaults.filter((v) => {
    if (v.creatorAddress.toLowerCase() === wallet) return true;
    const hasPerm = db.permissions.some(
      (p) =>
        p.vaultId === v.id &&
        p.walletAddress.toLowerCase() === wallet &&
        new Date(p.expiresAt).getTime() > Date.now()
    );
    return hasPerm;
  });

  // Strip secret payload fields from list response
  const sanitized = userVaults.map(({ encryptedSecretHex, ivHex, authTagHex, ...rest }) => rest);
  res.json(sanitized);
});

// 4. POST /vaults — Create & AES-GCM Encrypt Vault
app.post("/vaults", authenticateToken, (req, res) => {
  const { blockchainVaultId, name, description, storageReference, secret } = req.body;
  if (!name || secret === undefined) {
    return res.status(400).json({ error: "Missing required vault name or secret" });
  }

  const { encryptedSecretHex, ivHex, authTagHex } = encryptSecret(secret);
  const newVault = {
    id: `v-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    blockchainVaultId: Number(blockchainVaultId ?? db.vaults.length),
    name,
    description: description || "",
    storageReference: storageReference || "",
    creatorAddress: req.user.walletAddress.toLowerCase(),
    encryptedSecretHex,
    ivHex,
    authTagHex,
    createdAt: new Date().toISOString(),
  };

  db.vaults.unshift(newVault);
  saveDb(db);

  const { encryptedSecretHex: _, ivHex: __, authTagHex: ___, ...sanitized } = newVault;
  res.status(201).json(sanitized);
});

// 5. GET /vaults/:id — Get Vault Metadata
app.get("/vaults/:id", authenticateToken, (req, res) => {
  const vault = db.vaults.find(
    (v) => v.id === req.params.id || String(v.blockchainVaultId) === req.params.id
  );
  if (!vault) return res.status(404).json({ error: `Vault ${req.params.id} not found` });

  const { encryptedSecretHex, ivHex, authTagHex, ...sanitized } = vault;
  res.json(sanitized);
});

// 6. GET /vaults/:id/secret — Decrypt Secret (Permission-Guarded)
app.get("/vaults/:id/secret", authenticateToken, (req, res) => {
  const wallet = req.user.walletAddress.toLowerCase();
  const vault = db.vaults.find(
    (v) => v.id === req.params.id || String(v.blockchainVaultId) === req.params.id
  );
  if (!vault) return res.status(404).json({ error: "Vault not found" });

  const isCreator = vault.creatorAddress.toLowerCase() === wallet;
  const perm = db.permissions.find(
    (p) =>
      p.vaultId === vault.id &&
      p.walletAddress.toLowerCase() === wallet &&
      new Date(p.expiresAt).getTime() > Date.now()
  );

  if (!isCreator && !perm) {
    return res.status(403).json({ error: "Access denied: missing or expired grant permission" });
  }

  try {
    const plainSecret = decryptSecret(vault.encryptedSecretHex, vault.ivHex, vault.authTagHex);
    res.json({ secret: plainSecret });
  } catch (e) {
    console.error("Decryption error:", e);
    res.status(500).json({ error: "Cryptographic payload decryption failed" });
  }
});

// 7. GET /vaults/:id/permissions — List Permissions
app.get("/vaults/:id/permissions", authenticateToken, (req, res) => {
  const perms = db.permissions.filter((p) => p.vaultId === req.params.id);
  res.json(perms);
});

// 8. POST /vaults/:id/permissions — Grant Permission
app.post("/vaults/:id/permissions", authenticateToken, (req, res) => {
  const { walletAddress, role, expiresAt } = req.body;
  if (!walletAddress || !expiresAt) {
    return res.status(400).json({ error: "Missing walletAddress or expiresAt" });
  }

  const newPerm = {
    id: `perm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    vaultId: req.params.id,
    walletAddress: walletAddress.toLowerCase(),
    role: Number(role ?? 2),
    expiresAt: new Date(expiresAt).toISOString(),
    grantedAt: new Date().toISOString(),
  };

  db.permissions.push(newPerm);
  saveDb(db);
  res.status(201).json(newPerm);
});

// 9. DELETE /vaults/:id/permissions/:wallet — Revoke Permission
app.delete("/vaults/:id/permissions/:wallet", authenticateToken, (req, res) => {
  const vaultId = req.params.id;
  const wallet = req.params.wallet.toLowerCase();

  db.permissions = db.permissions.filter(
    (p) => !(p.vaultId === vaultId && p.walletAddress.toLowerCase() === wallet)
  );
  saveDb(db);
  res.json({ success: true, message: `Access revoked for ${wallet}` });
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "EVault API Backend", timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`=======================================================`);
  console.log(` 🔐 EVault Real API Backend Server Listening on port ${PORT}`);
  console.log(` 🔑 AES-256-GCM Secret Encryption: ACTIVE`);
  console.log(` 📜 EIP-4361 SIWE Signature Authentication: ACTIVE`);
  console.log(`=======================================================`);
});
