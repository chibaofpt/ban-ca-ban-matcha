const fs = require('fs');
const files = [
  'AGENTS.md',
  'SCHEMA.md',
  'STRUCTURE.md',
  'API.md',
  'ADMIN_PLAN.md',
  'NOTES.md',
  '.agents/skills/order-flow/SKILL.md',
  '.agents/skills/pricing-logic/SKILL.md',
  '.agents/skills/voucher-flow/SKILL.md',
  '.agents/skills/api-layer/SKILL.md'
];

let out = '# BẠN CÁ BÁN MATCHA - COMPLETE AGENT KNOWLEDGE BASE\n\n';
out += 'This document contains the complete context, rules, schema, and logic for the project \'Bạn Cá Bán Matcha\'.\nRead this document entirely before starting any work.\n\n---\n\n';

for (const file of files) {
  if (fs.existsSync(file)) {
    out += '## ==========================================================\n';
    out += '## CONTENT FROM: ' + file + '\n';
    out += '## ==========================================================\n\n';
    out += fs.readFileSync(file, 'utf8') + '\n\n';
  } else {
    out += '## File ' + file + ' not found!\n\n';
  }
}

fs.writeFileSync('d:/ban-ca-ban-matcha/AGENT_KNOWLEDGE_BASE.md', out, 'utf8');
console.log('Knowledge Base regenerated');
