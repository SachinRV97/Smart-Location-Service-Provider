# Smart Location Service Provider

Smart Location Service Provider is a Node.js + Express + MongoDB web platform that helps customers discover verified local stores by state, city, category, and name, with owner onboarding and admin moderation.

## Stack

- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose
- Frontend: HTML, CSS, vanilla JavaScript
- Maps: Leaflet + OpenStreetMap
- Auth: JWT

## Implemented Modules

### 1. Home / Discovery Module

- State and city dropdown filters (city loads dynamically by selected state)
- Store/shop search by name, city, state, and category
- Advanced filters:
  - Open now
  - Top rated
  - Nearest first
- Auto location detection
- Interactive map with live markers
- Marker/list click opens full store detail view

### 2. Store Module (Owner)

- Full store registration:
  - Store name, owner name, email, phone
  - State, city, full address
  - Latitude and longitude (map pin + geolocation)
  - Category
  - Opening and closing time
  - Description, images, GST
- Every new store is created with `Pending` status
- Only admin-approved stores are shown to customers

### 3. Admin Module

- Admin-protected dashboard
- Store moderation:
  - Approve / reject
  - Block / unblock
- User management:
  - List users
  - Block / unblock users
- Review moderation:
  - Approve / reject customer reviews
- Analytics:
  - Total stores, active stores, pending stores
  - Total customers, total owners
  - Search count
  - Approved and pending review counts
  - Most searched city
  - Most viewed store
  - Monthly growth chart (stores vs customers)
  - Top categories
- Category management
- State/city management

### 4. Customer Module

- Register/login
- Search approved stores
- View store details
- Save/remove favorites
- Add ratings and reviews
- View approved ratings/reviews
- Call store and open directions

### 5. Notifications

- In-app notifications for:
  - New store submitted (to admins)
  - Store approved/rejected/blocked/unblocked (to owner)
  - New review added (to owner)
  - Review moderated (to customer and owner)
- Optional email delivery via webhook integration

## Project Structure

```
public/        # HTML/CSS/JS frontend
src/
  config/      # DB config
  controllers/ # Route handlers
  middleware/  # Auth and RBAC middleware
  models/      # Mongoose schemas
  routes/      # API route definitions
  services/    # Ratings and notification services
  utils/       # JWT utility
tests/         # Node test files
```

## Environment Variables

Create `.env`:

```env
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
JWT_EXPIRES_IN=7d

# Optional notification email webhook
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_AUTH=
EMAIL_FROM_NAME=Smart Location Service Provider
```

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Start server

```bash
npm run dev
```

### Optional: Seed Demo Data

To quickly load sample users and data for all modules:

```bash
npm run seed:demo
```

Demo login credentials:

- Admin: `admin.demo@slsp.local` / `Admin@123`
- Owner: `owner.demo@slsp.local` / `Owner@123`
- Customer: `customer.demo@slsp.local` / `Customer@123`

3. Open in browser

- Home: `http://localhost:5000/index.html`
- Auth: `http://localhost:5000/auth.html`
- Discovery: `http://localhost:5000/stores.html`
- Owner: `http://localhost:5000/owner.html`
- Admin: `http://localhost:5000/admin.html`

## API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Meta

- `GET /api/meta/states`
- `GET /api/meta/cities?state=...`
- `GET /api/meta/categories`

### Stores

- `GET /api/stores`
- `GET /api/stores/:id`
- `GET /api/stores/mine` (owner/admin)
- `POST /api/stores` (owner/admin)

### Favorites

- `GET /api/favorites/me` (customer)
- `POST /api/favorites/:storeId` (customer)
- `DELETE /api/favorites/:storeId` (customer)

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

### Notifications

- `GET /api/notifications/me`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/:id/read`
