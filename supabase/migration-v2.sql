-- ============================================================
-- TITIK JENUH — Migrasi v2 (panel admin baru)
--
-- CARA PAKAI:
--   Supabase → SQL Editor → New query → tempel isi file ini → Run
--
-- Berisi:
--   • Kolom foto menu (image_url)
--   • Bucket penyimpanan foto menu + aturan aksesnya
--   • Fungsi statistik tambahan untuk halaman Keuangan
--
-- Aman dijalankan berulang kali.
-- ============================================================

-- ------------------------------------------------------------
-- 1. KOLOM FOTO MENU
-- ------------------------------------------------------------
alter table public.menu_items
  add column if not exists image_url text not null default '';

-- ------------------------------------------------------------
-- 2. BUCKET FOTO MENU
--
-- Bucket publik untuk dibaca (supaya foto tampil di halaman
-- pengunjung), tetapi hanya admin yang boleh menulis/menghapus.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Baca bebas (foto menu memang untuk dipublikasikan)
drop policy if exists menu_photos_public_read on storage.objects;
create policy menu_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-photos');

-- Hanya admin yang boleh mengunggah
drop policy if exists menu_photos_admin_insert on storage.objects;
create policy menu_photos_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-photos' and public.is_admin());

-- Hanya admin yang boleh menimpa
drop policy if exists menu_photos_admin_update on storage.objects;
create policy menu_photos_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-photos' and public.is_admin())
  with check (bucket_id = 'menu-photos' and public.is_admin());

-- Hanya admin yang boleh menghapus
drop policy if exists menu_photos_admin_delete on storage.objects;
create policy menu_photos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-photos' and public.is_admin());

-- ------------------------------------------------------------
-- 3. FUNGSI KEUANGAN (halaman Keuangan)
--
-- Laba dihitung otomatis dari (harga jual − harga modal) pada
-- setiap item pesanan yang sudah di-ACC.
-- ------------------------------------------------------------
create or replace function public.finance_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross        integer := 0;
  v_cogs         integer := 0;
  v_expenses     integer := 0;
  v_profit       integer := 0;
  v_paid         integer := 0;
  v_paid_count   integer := 0;
  v_unpaid       integer := 0;
  v_unpaid_count integer := 0;
  v_approved     integer := 0;
  v_items_sold   integer := 0;
  v_daily        jsonb;
  v_top          jsonb;
begin
  if not public.is_admin() then
    raise exception 'Akses ditolak.';
  end if;

  select coalesce(sum(total), 0), count(*)
    into v_gross, v_approved
    from public.orders
   where status = 'approved';

  select coalesce(sum(oi.cost * oi.qty), 0), coalesce(sum(oi.qty), 0)
    into v_cogs, v_items_sold
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status = 'approved';

  select coalesce(sum(amount), 0) into v_expenses from public.expenses;

  -- Laba kotor = harga jual − harga modal
  v_profit := v_gross - v_cogs;

  select coalesce(sum(total), 0), count(*)
    into v_paid, v_paid_count
    from public.orders
   where status = 'approved' and payment_status = 'paid';

  select coalesce(sum(total), 0), count(*)
    into v_unpaid, v_unpaid_count
    from public.orders
   where status = 'approved' and payment_status <> 'paid';

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'day', day, 'gross', gross, 'cogs', cogs, 'profit', profit
           ) order by day),
           '[]'::jsonb)
    into v_daily
    from (
      select to_char(o.created_at::date, 'YYYY-MM-DD') as day,
             sum(o.total)::int                          as gross,
             sum(oi.cost * oi.qty)::int                 as cogs,
             (sum(o.total) - sum(oi.cost * oi.qty))::int as profit
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.status = 'approved'
         and o.created_at >= (now() - interval '13 days')
       group by o.created_at::date
    ) t;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'name', name, 'qty', qty, 'revenue', revenue, 'profit', profit
           ) order by revenue desc),
           '[]'::jsonb)
    into v_top
    from (
      select oi.name,
             sum(oi.qty)::int                     as qty,
             sum(oi.subtotal)::int                as revenue,
             (sum(oi.subtotal - (oi.cost * oi.qty)))::int as profit
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where o.status = 'approved'
       group by oi.name
       order by sum(oi.subtotal) desc
       limit 10
    ) t;

  return jsonb_build_object(
    'gross',        v_gross,
    'cogs',         v_cogs,
    'expenses',     v_expenses,
    'profit',       v_profit,
    'net',          v_profit - v_expenses,
    'paid',         jsonb_build_object('amount', v_paid,   'count', v_paid_count),
    'unpaid',       jsonb_build_object('amount', v_unpaid, 'count', v_unpaid_count),
    'approved',     v_approved,
    'itemsSold',    v_items_sold,
    'daily',        v_daily,
    'topItems',     v_top
  );
end;
$$;

grant execute on function public.finance_report() to authenticated;
