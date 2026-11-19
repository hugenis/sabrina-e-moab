# Sabrina & Moab — Site de Casamento / RSVP

Site recuperado do projeto antigo do Hostinger e preparado para rodar no Coolify/VPS.

## Conteúdo

- `public/index.html` — página de confirmação de presença (Sabrina & Moab)
- `public/images/` — fotos do ensaio
- `server.mjs` — servidor Node com:
  - `/rsvp` (página)
  - `/rsvp-members?id=...` (lista de convidados da família)
  - `/rsvp-submit` (grava confirmações em `data/rsvps.json`)
  - `/capa-aleatoria.php` (capa rotativa para OpenGraph/WhatsApp)
  - `/health`
- `data/guests.json` — dados das famílias (a ser importado do banco antigo)
- `data/rsvps.json` — confirmações recebidas

## Importante

O backend PHP/MySQL original foi perdido com a exclusão do site no Hostinger.
O front-end e as fotos foram recuperados do histórico local. O banco MySQL antigo
continua no Hostinger (`u683396017_wmstore`) e pode ser exportado via phpMyAdmin
para importar a lista real de famílias em `data/guests.json`.

Formato esperado de `guests.json`:

```json
{
  "ID_DO_CONVIDADO": [
    { "id_acompanhante": "ID-1", "nome": "Nome", "parentesco": "Titular" }
  ]
}
```

## Rodar localmente

```bash
PORT=3010 node server.mjs
# http://localhost:3010/rsvp?id=SEU_ID
```

## Docker

```bash
docker build -t sabrina-e-moab .
docker run -p 3010:3000 -v sabrina-data:/app/data sabrina-e-moab
```

Em produção, monte um volume persistente em `/app/data` para não perder as confirmações.
