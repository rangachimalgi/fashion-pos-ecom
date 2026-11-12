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
| `014_roles_discount_caps_delete_requests.sql` | Adds the `manager` role, per-role discount caps (admin 100% / manager 5% / staff 2%), and approval-based bill deletion | Run after 013, with the matching app deploy |
| `015_min_margin_price_floor.sql` | A discounted POS line can never sell below cost + 5% (all roles) | Run after 014, with the matching app deploy |
| `016_sales_team.sql` | Sales team list (admin-managed), "attended by" saved on every POS bill, per-person sales report | Run after 015, with the matching app deploy |
| `017_sales_reports.sql` | Admin-only sales / GST / profit report by day or month, with the cost price saved on every bill line | Run after 016, with the matching app deploy |
| `018_petty_cash_ledger.sql` | Cash counter by note/coin (admin-only to view and edit); cash POS bills must record notes received and change given, and edits/deletes reverse it | Run after 017, with the matching app deploy |
| `019_purchases.sql` | Supplier purchase entry: suppliers, purchase bills, lines. Saving creates products, sizes, barcodes and stock; cost = rate - discount + GST; profit % sets the MRP. Admin only. To continue the old software's numbering: `select setval('public.purchase_entry_seq', 116);` | Run after 018, with the matching app deploy |
| `020_margin_report.sql` | Item-wise margin report (one row per bill line: cost, sale value, discount, net, margin). Admin only | Run after 019, with the matching app deploy |
| `021_gst_hsn_summary.sql` | GST report: sales by HSN code (qty, value, discount, taxable, CGST/SGST). HSN comes from the latest purchase entry. Admin only | Run after 020, with the matching app deploy |
| `024_fix_is_admin_null.sql` | **Security fix. Run first.** `is_admin()` returned null (not false) for a signed-in user with no staff profile, so such a user could run the admin-only functions from 016 to 021 (reports, cash counter, suppliers, purchases) | Run now, even if you skip the rest |
| `025_employees_attendance_leave.sql` | Employees (login created by an admin), check in / check out, leave requests with approve / reject. Employees have no POS or admin access. Needs `SUPABASE_SECRET_KEY` on the server | Run after 024, with the matching app deploy |
| `026_sales_targets.sql` | Monthly salary and sales target per salesperson (target = salary x %), admin-only, with a month progress function | Run after 024 |
| `027_incentives_employee_target.sql` | Incentive % on sales above target, link from an employee login to a sales name, and the employee's own target / salary / incentive view | Run after 026 |
| `028_admin_attendance.sql` | Admin can check an employee in/out, add or correct any day, or remove it (marks who edited) | Run after 025 |
| `029_performance_standing.sql` | Performance colour from targets: green met, yellow missed 1 month, red missed 2 in a row (finished months only) | Run after 027 |
| `030_checkin_location.sql` | Employee check-in only within a radius of the shop pin (admin sets location; distance checked in the database) | Run after 025 |

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

## POS roles (after 014)

| Role | Max line discount | Delete a bill |
|------|-------------------|---------------|
| admin | 100% (never above MRP) | directly |
| manager | 5% | sends a request with a reason; admin approves |
| staff | 2% | sends a request with a reason; admin approves |

Add a login: create the user in Supabase Auth, then
`insert into public.profiles (user_id, role) select id, 'manager' from auth.users where email = '...' on conflict (user_id) do update set role = excluded.role;`
