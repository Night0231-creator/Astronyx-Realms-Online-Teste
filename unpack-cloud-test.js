'use strict';
// Extrai a versão de teste enviada como um único ZIP ao repositório.
// Aceita apenas arquivos do jogo, sem credenciais e sem bancos de dados.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const zipFile = path.join(__dirname, 'Astronyx_Jogo_V1_6_Enviar_GitHub.zip');
if (!fs.existsSync(zipFile)) {
  console.log('[ASTRONYX] ZIP do jogo ainda não enviado. Iniciando página de preparação.');
  process.exit(0);
}
const zip = fs.readFileSync(zipFile);
const valid = (p) => p === 'server.js' || /^lib\/[a-z0-9_./-]+\.js$/i.test(p) || /^public\/[a-z0-9_./-]+\.(?:js|css|html|png|jpg|jpeg|svg|webp|ico)$/i.test(p);
function fail(msg) { throw new Error('[ASTRONYX] ZIP inválido: ' + msg); }
let eocd = -1;
for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
  if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) fail('diretório central ausente');
const count = zip.readUInt16LE(eocd + 10);
let cursor = zip.readUInt32LE(eocd + 16);
if (count < 1 || count > 150 || cursor >= zip.length) fail('índice de arquivos incorreto');
let loaded = 0, total = 0, hasServer = false, hasIndex = false;
for (let i = 0; i < count; i++) {
  if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) fail('entrada inválida');
  const flags = zip.readUInt16LE(cursor + 8);
  const method = zip.readUInt16LE(cursor + 10);
  const compressed = zip.readUInt32LE(cursor + 20);
  const expected = zip.readUInt32LE(cursor + 24);
  const nameLength = zip.readUInt16LE(cursor + 28);
  const extraLength = zip.readUInt16LE(cursor + 30);
  const commentLength = zip.readUInt16LE(cursor + 32);
  const localOffset = zip.readUInt32LE(cursor + 42);
  const next = cursor + 46 + nameLength + extraLength + commentLength;
  if (next > zip.length) fail('cabeçalho truncado');
  const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
  cursor = next;
  if (name.endsWith('/')) continue;
  if (!valid(name) || name.includes('..') || name.includes('\\') || name.startsWith('/')) fail('caminho não permitido: ' + name);
  if ((flags & 1) || ![0, 8].includes(method)) fail('criptografia/compressão não suportada');
  total += expected;
  if (expected > 6 * 1024 * 1024 || total > 20 * 1024 * 1024) fail('tamanho excessivo');
  if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) fail('dados locais inválidos');
  const offset = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  if (offset + compressed > zip.length) fail('conteúdo truncado');
  const raw = zip.subarray(offset, offset + compressed);
  const output = method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: expected || 1 }) : raw;
  if (output.length !== expected) fail('tamanho divergente: ' + name);
  const target = path.join(__dirname, ...name.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  loaded++;
  if (name === 'server.js') hasServer = true;
  if (name === 'public/index.html') hasIndex = true;
}
if (!hasServer || !hasIndex) fail('jogo incompleto');
console.log('[ASTRONYX] Jogo V1.6 extraído:', loaded, 'arquivos; iniciando servidor multiplayer.');
