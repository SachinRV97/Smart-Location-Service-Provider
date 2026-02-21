# Smart Location Service Provider

A Node.js + Express + MongoDB backend plus a built-in web UI for discovering verified local stores by state, city, and name with role-based flows for customers, owners, and admins.

## Implemented foundation

- JWT authentication for customers, owners, and admins
- Store registration workflow with moderation status (`Pending`, `Approved`, `Rejected`)
- Public store discovery endpoints with filters (`state`, `city`, `category`, text query, `openNow`, `topRated`, nearest)
- Admin approval/rejection/blocking and dashboard metrics
- MongoDB geospatial indexing (`2dsphere`) for nearest-store queries
- Browser UI split into dedicated pages: `/auth.html`, `/stores.html`, `/owner.html`, and `/admin.html` (home at `/`)

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

3. Run server:

   ```bash
   npm run dev
   ```

## API routes

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/stores`
- `GET /api/stores/:id`
- `POST /api/stores` (owner/admin)
- `GET /api/admin/dashboard` (admin)
- `GET /api/admin/stores/pending` (admin)
- `PATCH /api/admin/stores/:id/approve` (admin)
- `PATCH /api/admin/stores/:id/reject` (admin)
- `PATCH /api/admin/stores/:id/block` (admin)

## Notes

- To use nearest search, send `nearestLat` and `nearestLng` query params.
- `openNow=true` expects store opening/closing time stored in `HH:MM` 24h format.
- This is an initial backend scaffold aligned with the project synopsis and ready for frontend/map integration.
