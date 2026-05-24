const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = /bánh cá bốn mùa/gi;
    if (regex.test(content)) {
      const newContent = content.replace(regex, 'Bạn Cá Bán Matcha');
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  } catch (e) {
    console.error(`Error reading ${filePath}: ${e.message}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else {
      const ext = path.extname(fullPath);
      if (['.ts', '.tsx', '.md', '.json', '.js'].includes(ext)) {
        replaceInFile(fullPath);
      }
    }
  }
}

// Replace in root md files
const rootDir = path.join(__dirname, '../');
const rootFiles = fs.readdirSync(rootDir);
for (const file of rootFiles) {
  if (file.endsWith('.md')) {
    replaceInFile(path.join(rootDir, file));
  }
}

// Replace in src and .agents
walkDir(path.join(rootDir, 'src'));
walkDir(path.join(rootDir, '.agents'));
