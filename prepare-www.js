/**
 * Build script to package web assets into the www directory for Capacitor / Android
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const WWW_DIR = path.join(ROOT_DIR, 'www');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('📦 Preparando pasta www para compilação Android/Capacitor...');

if (fs.existsSync(WWW_DIR)) {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });

// Copy essential files and folders
const itemsToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css',
  'js',
  'icons'
];

itemsToCopy.forEach(item => {
  const src = path.join(ROOT_DIR, item);
  const dest = path.join(WWW_DIR, item);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, dest);
    console.log(`  ✓ Copiado: ${item}`);
  }
});

console.log('✅ Diretório www gerado com sucesso!');
