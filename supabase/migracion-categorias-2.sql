-- Ejecutar UNA vez, después de migracion-categorias.sql.
-- Chatarra pasa a llamarse Bajón; Estudios se elimina y sus gastos pasan a Otros.

begin;

update public.categories set name = 'Bajón' where name = 'Chatarra';

update public.expenses e
set category_id = t.id
from public.categories s
join public.categories t on t.user_id = s.user_id and t.name = 'Otros'
where e.category_id = s.id and s.name = 'Estudios';

delete from public.categories where name = 'Estudios';

commit;
