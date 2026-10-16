-- Ejecutar UNA vez (después de schema.sql) si ya entraste con las 12 categorías antiguas.
-- Reduce a 9 categorías, conserva tus gastos moviéndolos y agrega los emoji.
--   Bencina            → Transporte
--   Arriendo, Celular  → Cuentas

begin;

update public.expenses e
set category_id = t.id
from public.categories s
join public.categories t on t.user_id = s.user_id and t.name = 'Transporte'
where e.category_id = s.id and s.name = 'Bencina';

update public.expenses e
set category_id = t.id
from public.categories s
join public.categories t on t.user_id = s.user_id and t.name = 'Cuentas'
where e.category_id = s.id and s.name in ('Arriendo', 'Celular');

delete from public.categories where name in ('Bencina', 'Arriendo', 'Celular');

update public.categories set icon = case name
  when 'Comida' then '🛒'
  when 'Chatarra' then '🍟'
  when 'Transporte' then '🚌'
  when 'Cuentas' then '🧾'
  when 'Entretenimiento' then '🎮'
  when 'Ropa' then '👕'
  when 'Salud' then '💊'
  when 'Estudios' then '📚'
  when 'Otros' then '📦'
end
where icon is null;

commit;
