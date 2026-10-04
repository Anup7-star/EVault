// scripts/check-no-mocks.js
// Guard script to prevent mock data, fallback APIs, and insecure local storage patterns from being committed.

const fs = require('fs');
const path = require('path');

const TARGET_DIRS = ['app', 'components', 'lib'];
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];

const FORBIDDEN_PATTERNS = [
  { pattern: /mockApiFallback/i, name: 'mockApiFallback' },
  { pattern: /mock_jwt/i, name: 'mock_jwt' },
  { pattern: /DEFAULT_GRANTS/i, name: 'DEFAULT_GRANTS' },
  { pattern: /Production DB Credentials/i, name: 'Production DB Credentials' },
  { pattern: /AWS KMS Root Tokens/i, name: 'AWS KMS Root Tokens' },
  { pattern: /localStorage\s*\.\s*setItem/i, name: 'localStorage.setItem' },
  { pattern: /sessionStorage\s*\.\s*setItem/i, name: 'sessionStorage.setItem' },
];

let totalViolations = 0;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    FORBIDDEN_PATTERNS.forEach(({ pattern, name }) => {
      if (pattern.test(line)) {
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        console.error(`[VIOLATION] Forbidden pattern '${name}' detected at ${relativePath}:${index + 1}`);
        console.error(`  > ${line.trim()}`);
        totalViolations++;
      }
    });
  });
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        walkDir(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        scanFile(fullPath);
      }
    }
  }
}

console.log('Running no-mocks guard check across app/, components/, lib/ ...');
for (const dir of TARGET_DIRS) {
  walkDir(path.resolve(process.cwd(), dir));
}

if (totalViolations > 0) {
  console.error(`\nFAILED: Found ${totalViolations} forbidden pattern violation(s).`);
  process.exit(1);
} else {
  console.log('PASSED: No mock or fake-data patterns detected.');
  process.exit(0);
}
