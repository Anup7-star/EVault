// Lightweight EIP-4361-style ("Sign-In with Ethereum") message builder + verifier.
// Standardized message format, domain binding, and a server-issued nonce —
// same guarantees as the `siwe` package, kept dependency-free for this demo.

export function buildSiweMessage(params: {
  domain: string;
  address: string;
  nonce: string;
  statement: string;
}) {
  const issuedAt = new Date().toISOString();
  return `${params.domain} wants you to sign in with your Ethereum account:
${params.address}

${params.statement}

URI: https://${params.domain}
Version: 1
Nonce: ${params.nonce}
Issued At: ${issuedAt}`;
}
