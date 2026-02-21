# Smart Location Service Provider

Smart Location Service Provider is a Node.js + Express + MongoDB web application for discovering verified stores by state, city, and store name with role-based flows for customers, owners, and admins.

## Technology stack

- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose
- Frontend: HTML, CSS, vanilla JS
- Map integration: Leaflet + OpenStreetMap tiles
- Authentication: JWT

## Implemented modules (aligned to synopsis)

### Home / Discovery module

- State and city dropdown filters (dynamic API based)
- Store name/category search
- Advanced filters: open now, top rated, nearest first
- Auto location detection for nearest stores
- Interactive map with store markers and focus behavior

### Store module (owner)

- Store registration with full fields:
  - store name, owner name, email, phone
  - state, city, full address
  - latitude/longitude
  - category, opening/closing, description, images, GST
- Submitted stores default to `Pending`
- Owner view for submitted stores and their statuses

### Admin module

- Admin login (JWT role)
- Dashboard analytics:
  - total stores, active stores, pending stores
  - total customers, total searches, total approved reviews
  - most searched city
  - most viewed store
  - monthly growth (stores/customers)
- Store moderation: approve/reject/block/unblock
- User management: list/block/unblock
- Review moderation: approve/reject pending reviews
- Category management
- State/city management

### Customer module

- Register/login
- Search stores and view full details
- Favorite stores (save/remove/list)
- Rate and review stores (admin moderation flow)
- Store detail includes call now + direction link

## Quick start

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables in `.env`

   ```env
   PORT=5000
   MONGODB_URI=...
   JWT_SECRET=...
   JWT_EXPIRES_IN=7d
   ```

3. Run

   ```bash
   npm run dev
   ```

## API overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Meta (state/city/category)

- `GET /api/meta/states`
- `GET /api/meta/cities?state=...`
- `GET /api/meta/categories`

### Stores

- `GET /api/stores`
- `GET /api/stores/:id`
- `GET /api/stores/mine` (owner/admin)
- `POST /api/stores` (owner/admin)

### Favorites (customer)

- `GET /api/favorites/me`
- `POST /api/favorites/:storeId`
- `DELETE /api/favorites/:storeId`

### Reviews

- `GET /api/reviews/:storeId`
- `POST /api/reviews/:storeId` (customer)

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/stores`
- `GET /api/admin/stores/pending`
- `PATCH /api/admin/stores/:id/approve`
- `PATCH /api/admin/stores/:id/reject`
- `PATCH /api/admin/stores/:id/block`
- `PATCH /api/admin/stores/:id/unblock`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/block`
- `PATCH /api/admin/users/:id/unblock`
- `GET /api/admin/reviews/pending`
- `PATCH /api/admin/reviews/:id/moderate`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `GET /api/admin/locations`
- `POST /api/admin/locations`

## Notes

- Store search only returns `Approved` and unblocked stores.
- Submitted reviews are `Pending` until admin moderation.
- Store details include approved reviews and favorite status when customer is logged in.
