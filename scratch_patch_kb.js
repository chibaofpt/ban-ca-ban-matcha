const fs = require('fs');

let out = fs.readFileSync('d:/ban-ca-ban-matcha/AGENT_KNOWLEDGE_BASE.md', 'utf8');

// Fix 1: api-layer error code
out = out.replace(
  "| 422 | BUSINESS_RULE_VIOLATION | Insufficient points, expired voucher, ... |",
  "| 422 | Domain Specific Codes | INSUFFICIENT_POINTS, VOUCHER_EXPIRED, PRICE_CHANGED, etc. |"
);

// Fix 2: order-flow Store Settings UI
out = out.replace(
  "- Schedule edits: PUT /api/admin/store-schedule sends full week, server does deleteMany + createMany in one transaction.",
  "- Schedule edits: PUT /api/admin/store-schedule sends full week, server does deleteMany + createMany in one transaction.\n\n### Store Settings UI Specs\n- **Admin modal**: icon ⚙️ in top bar (ADMIN only) → StoreSettingsModal — 2 sections: weekly schedule + temporary closure with optional customer note.\n- **Customer banner on homepage**: amber banner, dismissible, shown when is_open = false."
);

// Fix 3: pricing-logic soft delete
out = out.replace(
  "- If eference_latte_item_id IS NULL → Premium_Latte = 0 (safe fallback, favors customer).",
  "- If eference_latte_item_id IS NULL → Premium_Latte = 0 (safe fallback, favors customer).\n  - **Important Database Rule**: The schema uses SET NULL on hard delete of the referenced item. However, since we strictly soft-delete Latte items, soft-deleting a Latte item **does NOT** set eference_latte_item_id to NULL. The reference remains intact."
);

// Fix 4: pricing-logic Addon override
out = out.replace(
  "- ddon_options.price_vnd is global — changing it affects all items immediately.",
  "- ddon_options.price_vnd is global — changing it affects all items immediately.\n- **No Per-Item Addon Override**: If addon behavior or availability needs to differ per item (e.g., \"Item A doesn't allow Extra Matcha\"), do NOT create junction tables or flag columns. The correct pattern is to **create a new addon group** and assign it to the item."
);

fs.writeFileSync('d:/ban-ca-ban-matcha/AGENT_KNOWLEDGE_BASE.md', out, 'utf8');
console.log('Knowledge Base directly patched');
