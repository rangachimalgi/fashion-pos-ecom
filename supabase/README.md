# Database schema (source of truth)

All Supabase schema changes live in this folder — **not** in chat, not only in the dashboard.

```
supabase/
  migrations/          ← numbered SQL files (run in order)
  README.md            ← this file
```

## Rule

1. Need a new column, table, policy, or index? → **add a new migration file** here.
2. Name it `00N_short_snake_name.sql` (next number after the last one).
3. Open [Supabase SQL Editor](https://supabase.com/dashboard) → paste that file → **Run**.
4. App code that depends on it ships in the **same PR/commit**.

Never change schema only in the dashboard without a matching file here.

## Apply pending migrations

| File | What it does | Status you should check |
|------|----------------|-------------------------|
| `001_rls_product_inserts.sql` | Allow anon insert on products/variants | Likely already applied |
| `002_product_department_category.sql` | Adds `department` + `category` columns | **Run this if category filter is empty** |
| `013_secure_rls_and_order_functions.sql` | Replaces every anonymous policy with staff-only writes; moves checkout / POS edit / POS delete into transactional functions | **Run together with the matching app deploy** (see below) |

## Security model (after 013)

- Catalog tables: public read, staff-only write (`is_staff()` = row in `profiles`).
- `orders` / `order_items`: no anonymous access, no direct writes. Only the
  `place_order`, `update_pos_order`, `delete_pos_order` functions change them.
- Online checkout goes through `POST /api/checkout` (forces ONLINE + catalog prices).
- New auth users get **no** access until added to `profiles`.
- Older migrations (001, 004, 005, 006, 009, 012) still contain the open
  policies; 013 drops them, so always run 013 last.

## App ↔ DB mapping

| UI | DB column | Values |
|----|-----------|--------|
| Header Men / Women / Kids | `products.department` | `Men`, `Women`, `Kids` |
| Tshirts / Shirts / Jeans / Hoodies | `products.category` | `Tshirts`, `Shirts`, `Jeans`, `Hoodies` |

Defined in code: `src/lib/categories.ts`  
Saved from: `src/app/billing/add-product/page.tsx`
