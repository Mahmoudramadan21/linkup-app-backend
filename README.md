# LinkUp Social Media Application

## Overview

LinkUp is a modern social media platform built with Node.js, Express, and PostgreSQL, designed to facilitate user interactions through posts, stories, highlights, real-time messaging, and more. The application provides a robust API for user authentication, profile management, content creation, and administrative functionalities.

## Features

- **User Authentication**: Secure signup, login, password reset, and token refresh.
- **Profile Management**: Update profiles, manage privacy settings, follow/unfollow users, and handle follow requests.
- **Posts**: Create, update, delete, like, comment, save, and report posts with media support.
- **Stories & Highlights**: Share temporary stories and organize them into highlights.
- **Real-Time Messaging**: One-on-one conversations with reactions, typing indicators, and media attachments.
- **Notifications**: Manage user notifications with customizable preferences.
- **Admin Controls**: Manage reported posts, user roles, bans, and perform administrative actions.
- **API Documentation**: Interactive Swagger UI for exploring and testing endpoints.

## Repository

- **Main Repository**: https://github.com/Mahmoudramadan21/14.LinkUp
- **Backend Source Code**: https://github.com/Mahmoudramadan21/14.LinkUp/tree/main/05_Implementation/Source_Code/backend/
- **Main Branch**: `main`

## Project Structure

```
backend/
├── node_modules/          # Node.js dependencies
├── src/                  # Source code
│   ├── controllers/      # Business logic for handling requests
│   ├── middleware/       # Custom middleware (auth, validation, upload, etc.)
│   ├── models/           # Database models and Prisma schema
│   │   └── prisma/
│   │       └── schema.prisma # Prisma schema file
│   ├── routes/           # API routes
│   │   ├── adminRoutes.js    # Admin management endpoints
│   │   ├── authRoutes.js     # Authentication endpoints
│   │   ├── highlightRoutes.js# Story highlights management
│   │   ├── index.js          # Route aggregator
│   │   ├── messageRoutes.js  # Real-time messaging endpoints
│   │   ├── notificationRoutes.js # Notification management
│   │   ├── postRoutes.js     # Post management endpoints
│   │   ├── profileRoutes.js  # User profile management
│   │   └── storyRoutes.js    # Story management endpoints
│   ├── validators/       # Input validation schemas
│   └── docs/
│       └── swagger.js    # Swagger configuration for API documentation
├── uploads/              # Temporary storage for media uploads
├── .env                  # Environment variables
├── package.json          # Project dependencies and scripts
├── package-lock.json     # Dependency lock file
└── README.md             # Project documentation
```

## Prerequisites

- **Node.js**: v14 or higher
- **npm**: For dependency management
- **PostgreSQL**: Database (e.g., Supabase or local PostgreSQL)
- **Prisma**: For database migrations and ORM
- **Redis**: For real-time features (e.g., typing indicators)
- **Cloudinary**: For media storage
- **SendGrid**: For email services
- **Hugging Face**: For AI-related features (optional)

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Mahmoudramadan21/14.LinkUp.git
   cd 14.LinkUp/05_Implementation/Source_Code/backend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up environment variables**: Create a `.env` file in the `backend/` directory and add the following variables with your own values:

   ```env
   # Database
   DATABASE_URL=your_supabase_or_postgresql_connection_string_with_pgbouncer
   DIRECT_URL=your_direct_postgresql_connection_string_for_migrations

   # Server
   PORT=your_server_port
   FRONTEND_URL=your_frontend_url

   # Authentication
   JWT_SECRET=your_jwt_secret_key
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_key

   # Email
   SENDGRID_API_KEY=your_sendgrid_api_key
   EMAIL_FROM=your_email_address

   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret

   # Redis
   REDIS_URL=your_redis_connection_string

   # Hugging Face
   HF_TOKEN=your_hugging_face_api_token
   ```

4. **Set up the database**:

   - Ensure your PostgreSQL database is running (e.g., via Supabase or local setup).

   - Navigate to the Prisma directory:

     ```bash
     cd src/models/prisma
     ```

   - Run Prisma migrations to set up the database schema:

     ```bash
     npx prisma migrate dev
     ```

   - Generate Prisma client:

     ```bash
     npx prisma generate
     ```

5. **Run the application**:

   ```bash
   npm start
   ```

6. **Access the API**:

   - API base URL: `http://localhost:3000/api/`
   - Swagger UI: `http://localhost:3000/api-docs`
   - Raw Swagger JSON: `http://localhost:3000/api-docs.json`

## API Documentation

The API is documented using Swagger/OpenAPI 3.0. Key endpoints include:

- **Authentication** (`/auth`):
  - `POST /signup`: Register a new user
  - `POST /login`: Authenticate and get tokens
  - `POST /refresh`: Refresh access token
  - `POST /forgot-password`: Request password reset
  - `POST /verify-code`: Verify reset code
  - `POST /reset-password`: Reset password
- **Profile** (`/profile`):
  - `GET /`: Get user profile
  - `PUT /edit`: Update profile details
  - `PUT /privacy`: Update privacy settings
  - `POST /follow/{userId}`: Follow a user
  - `GET /followers/{userId}`: Get followers list
- **Posts** (`/posts`):
  - `POST /`: Create a new post
  - `GET /`: Get public posts
  - `POST /{postId}/like`: Like/unlike a post
  - `POST /{postId}/report`: Report a post
- **Highlights** (`/highlights`):
  - `POST /`: Create a highlight
  - `GET /user/{userId}`: Get user highlights
  - `PUT /{highlightId}`: Update a highlight
- **Messages** (`/messanger`):
  - `GET /conversations`: Get user conversations
  - `POST /conversations`: Start a new conversation
  - `POST /conversations/{conversationId}/messages`: Send a message
- **Notifications** (`/notifications`):
  - `GET /`: Fetch user notifications
  - `PUT /{notificationId}/read`: Mark notification as read
  - `PUT /preferences`: Update notification preferences
- **Admin** (`/admin`):
  - `GET /reports`: Get reported posts
  - `GET /users`: Get all users
  - `PUT /users/{userId}`: Update user role/ban status
  - `POST /actions`: Perform admin actions (delete post, ban user, etc.)

Explore the full API documentation at `/api-docs`.

## Security

- **JWT Authentication**: All protected routes require a Bearer token.
- **Rate Limiting**: Applied to prevent abuse (e.g., login attempts, post creation).
- **Content Moderation**: Middleware to filter inappropriate content.
- **Role-Based Access**: Admin routes restricted to users with `ADMIN` role.
- **Input Validation**: Joi-based validation for all inputs.

## Development

- **Database Migrations**:
  - Update `src/models/prisma/schema.prisma` for schema changes.
  - Run migrations: `npx prisma migrate dev`.
  - Generate Prisma client: `npx prisma generate`.
- **Linting**: Use ESLint for code consistency (`npm run lint`).
- **Swagger**: Update API specs in `src/docs/swagger.js` and route files.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit changes (`git commit -m 'Add your feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the LICENSE for details.

## Contact

- **Developer**: Mahmoud Ramadan
- **Email**: mahmoud.fci25@gmail.com
- **LinkedIn**: [Mahmoud Ramadan](https://www.linkedin.com/in/mahmoud-ramadan-9a6618250/)
- **Support**: For additional support, contact mahmoud.fci25@gmail.com.
