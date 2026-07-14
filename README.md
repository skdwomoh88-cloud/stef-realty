# Stef Realty Backend

The backend API for **Stef Realty**, a modern real estate platform built to manage property listings, property submissions, viewing requests, user authentication, and administrative workflows.

---

# Features

- User Authentication (JWT)
- User Registration & Login
- Property Management
- Property Search & Filtering
- Property Submission Workflow
- Property Approval & Rejection
- Property Image Uploads
- Viewing Request Management
- Dashboard Statistics API
- MongoDB Database Integration
- Protected API Routes

---

# Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Token (JWT)
- Bcrypt.js
- Multer
- Dotenv

---

# Project Structure

```
backend/

├── config/
│   └── db.js
│
├── controllers/
│   ├── authController.js
│   ├── dashboardController.js
│   ├── propertyController.js
│   ├── propertySubmissionController.js
│   └── viewingRequestController.js
│
├── middleware/
│   ├── authMiddleware.js
│   └── uploadMiddleware.js
│
├── models/
│   ├── Property.js
│   ├── PropertySubmission.js
│   ├── User.js
│   └── ViewingRequest.js
│
├── routes/
│   ├── auth.js
│   ├── dashboardRoutes.js
│   ├── propertyRoutes.js
│   ├── propertySubmissionRoutes.js
│   └── viewingRequestRoutes.js
│
├── uploads/
│
├── .env
├── package.json
├── server.js
└── README.md
```

---

# Installation

Clone the repository.

```bash
git clone <repository-url>
```

Move into the backend directory.

```bash
cd backend
```

Install dependencies.

```bash
npm install
```

---

# Environment Variables

Create a `.env` file in the root of the backend.

Example:

```env
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_secret_key
```

---

# Running the Server

Development

```bash
npm run dev
```

Production

```bash
npm start
```

The server runs on:

```
http://localhost:5000
```

---

# Authentication

The backend uses **JSON Web Tokens (JWT)**.

Protected routes require the Authorization header:

```
Authorization: Bearer <JWT_TOKEN>
```

---

# API Endpoints

## Authentication

### Register

```
POST /auth/register
```

### Login

```
POST /auth/login
```

---

## Properties

### Get All Properties

```
GET /properties
```

### Get Property By ID

```
GET /properties/:id
```

### Create Property

```
POST /properties
```

### Update Property

```
PUT /properties/:id
```

### Delete Property

```
DELETE /properties/:id
```

### Upload Property Images

```
POST /properties/upload
```

---

## Property Submissions

### Submit Property

```
POST /property-submissions
```

### Get All Submissions

```
GET /property-submissions
```

### Get Submission

```
GET /property-submissions/:id
```

### Approve Submission

```
PUT /property-submissions/:id/approve
```

### Reject Submission

```
PUT /property-submissions/:id/reject
```

---

## Viewing Requests

### Submit Viewing Request

```
POST /viewing-requests
```

---

## Dashboard

### Dashboard Statistics

```
GET /dashboard/stats
```

---

# Database Models

Current models include:

- User
- Property
- PropertySubmission
- ViewingRequest

---

# Current Features

- User authentication
- Property listings
- Property search
- Property filtering
- Property image uploads
- Property submissions
- Property approval workflow
- Viewing request management
- Dashboard statistics

---

# Planned Features

- User Roles (Admin, Agent, Property Owner)
- Property Favorites
- Email Notifications
- WhatsApp Integration
- Inspection Scheduling
- Property Analytics
- Reports
- Agent Management
- Maps Integration
- Mortgage Calculator

---

# Security

Current security features:

- Password hashing using Bcrypt
- JWT authentication
- Protected routes
- Environment variables
- Input validation

---

# Version

Current Version

```
v0.5.0
```

---

# License

This project is licensed under the MIT License.

---

# Author

**Stefan Dwomoh-Kesse**

Stef Realty