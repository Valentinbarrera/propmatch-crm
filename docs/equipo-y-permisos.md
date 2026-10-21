# Equipo y permisos por vendedor

Una inmobiliaria tiene un administrador y varios agentes. El rol vive en
`agency_members.role` de la base de la app (`admin` | `agente`, ya lo admite el
check de la tabla: no hace falta tocar esa base).

## Qué ve cada rol

| | admin | agente |
|---|---|---|
| Propiedades, fotos, equipo, ofertas y visitas de la app | todo | todo |
| Contactos, oportunidades, agenda, tareas | todo | solo donde `owner_id` es él |
| Operaciones | todo | donde es responsable, co-agente o la creó |
| Requisitos y actividad | todo | los de sus contactos |
| Configuración → Equipo (invitar, roles, sacar) | sí | no |

El filtro vive en el servidor (`api/_lib/crm/routes.ts`, reglas puras en
`shared/crmVisibility.ts`, pruebas: `npm run test:team`): el navegador nunca
consulta la base, así que ocultar en pantalla no protegería nada.

- **pull**: al agente se le descartan los registros ajenos; el cursor de versión
  avanza igual con lo leído.
- **push**: lo que un agente intenta guardar a nombre de otro, o sobre un
  registro ajeno, se descarta sin romper el lote (`skipped` en la respuesta). Lo
  nuevo sin dueño queda a su nombre.
- Los leads que llegan de la app quedan a nombre del agente responsable de la
  propiedad (`owner_agent_id`), no de quien tenga el CRM abierto.

## Invitar a un vendedor

`Configuración → Equipo → Sumar un vendedor` (nombre, email, rol). El servidor
(`/api/saas/invite`) crea la cuenta sin contraseña, la suma a `agency_members` y
devuelve un link para elegirla (el que ya maneja `PasswordRecovery`). **No manda
mails**: el administrador pasa el link por WhatsApp. Si el email ya tiene cuenta
en PropMatch (la app de búsqueda u otra inmobiliaria) se rechaza con `email_exists`.

Otras acciones (todas solo admin): `members`, `invite-link` (link nuevo),
`set-role`, `remove` (borra la membresía, no la cuenta). No se puede dejar la
inmobiliaria sin admin ni sacarse a uno mismo.

## Límites conocidos

- Reasignar un contacto a otro agente desde el formulario del contacto: el
  agente anterior conserva su copia local hasta que borre los datos del navegador
  (el servidor ya no le manda cambios).
- Sin comisiones por vendedor: queda pendiente hasta validar el esquema con una
  inmobiliaria real.
