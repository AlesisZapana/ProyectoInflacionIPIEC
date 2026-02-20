// db.js
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, writeFileSync } from 'fs'

// Para obtener __dirname en ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ruta del archivo JSON
const file = join(__dirname, 'db_estructurada.json')

// Si no existe, lo crea con un objeto inicial
if (!existsSync(file)) {
  writeFileSync(file, JSON.stringify({ formularios: [] }, null, 2))
}

// Adaptador de archivo JSON
const adapter = new JSONFile(file)
const defaultData = { formularios: [] }

// PASÁ defaultData al constructor de Low
const db = new Low(adapter, defaultData)

export async function initDBEstructurada() {
  await db.read()
  return db
}
