const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  console.error(`MooVN tests require Node.js >= 22.6.0; found ${process.versions.node}. Install a supported Node version before running npm test.`);
  process.exit(1);
}
