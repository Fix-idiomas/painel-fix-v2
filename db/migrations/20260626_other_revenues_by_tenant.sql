-- Cron de lançamentos mensais multi-tenant.
-- O cron roda com service role (sem JWT), então current_tenant_id() é NULL.
-- Criamos um OVERLOAD de ensure_other_revenues_for_month que recebe o tenant
-- explicitamente. A versão de 1 argumento (p_ym) — usada pelo botão "Prévia" no
-- browser — fica INTACTA. Corpo idêntico ao de (p_ym), trocando current_tenant_id()
-- por p_tenant. SECURITY DEFINER; grant só p/ service_role (o cron).

create or replace function public.ensure_other_revenues_for_month(p_tenant uuid, p_ym text)
returns json
language plpgsql
security definer
as $function$
declare
  t record;
  v_tenant uuid := p_tenant;
  v_month  date := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_due    date;
  v_created int := 0;
  v_kind text;
  v_idx int;
  v_total int;
  v_months_between int;
  v_years_between int;
begin
  if v_tenant is null then
    raise exception 'ensure_other_revenues_for_month: p_tenant é obrigatório';
  end if;

  for t in
    select *
      from public.other_revenue_templates
     where tenant_id = v_tenant
       and active
       and (
            (frequency = 'monthly')
         or (frequency = 'yearly'
             and extract(month from v_month) = coalesce(due_month, extract(month from v_month)))
       )
       and (start_month is null or start_month <= v_month)
       and (end_month   is null or end_month   >= v_month)
  loop
    if t.frequency = 'yearly' then
      v_due := make_date(extract(year from v_month)::int,
                         coalesce(t.due_month, extract(month from v_month))::int,
                         t.due_day);
    else
      v_due := make_date(extract(year from v_month)::int,
                         extract(month from v_month)::int,
                         t.due_day);
    end if;

    v_kind  := coalesce(t.recurrence_type, 'indefinite');
    v_total := case when v_kind = 'installments' then nullif(t.total_installments, 0) else null end;

    v_idx := null;
    if v_kind = 'installments' and v_total is not null then
      if t.start_month is not null then
        v_months_between := (extract(year from v_month) - extract(year from t.start_month))::int * 12
                          + (extract(month from v_month) - extract(month from t.start_month))::int;
        if t.frequency = 'yearly' then
          v_years_between := (extract(year from v_month) - extract(year from t.start_month))::int;
          v_idx := v_years_between + 1;
        else
          v_idx := v_months_between + 1;
        end if;
        if v_idx < 1 or v_idx > v_total then
          continue;
        end if;
      else
        v_idx := 1;
      end if;
    end if;

    if v_idx is not null then
      begin
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, installment_index, installments_total,
           recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_idx, v_total,
           v_kind, t.end_month)
        on conflict on constraint uniq_other_rev_gen_install do nothing;
        if found then v_created := v_created + 1; end if;
      exception when undefined_object then
        if not exists (
          select 1 from public.other_revenues r
           where r.tenant_id = v_tenant
             and r.generated_from = t.id
             and r.installment_index = v_idx
        ) then
          insert into public.other_revenues
            (tenant_id, title, category, amount, competence_month, due_date,
             status, paid_at, canceled_at, cancel_note, cost_center, created_at,
             generated_from, installment_index, installments_total,
             recurrence_kind, recurrence_until)
          values
            (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
             'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
             t.id, v_idx, v_total,
             v_kind, t.end_month);
          v_created := v_created + 1;
        end if;
      end;
    else
      if not exists (
        select 1 from public.other_revenues r
         where r.tenant_id = v_tenant
           and r.due_date  = v_due
           and r.title     = t.title
      ) then
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_kind, t.end_month);
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  return json_build_object('created', v_created);
end
$function$;

revoke execute on function public.ensure_other_revenues_for_month(uuid, text) from anon, authenticated, public;
grant  execute on function public.ensure_other_revenues_for_month(uuid, text) to service_role;
