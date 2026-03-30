import fs from 'fs';
import path from 'path';

export function ensureJsonFile(filePath, fallbackValue) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2), 'utf8');
  }
}

export function readJson(filePath, fallbackValue) {
  try {
    ensureJsonFile(filePath, fallbackValue);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || JSON.stringify(fallbackValue));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    return fallbackValue;
  }
}

export function writeJson(filePath, value) {
  try {
    ensureJsonFile(filePath, value);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error.message);
    throw error;
  }
}
