const swaggerJsDoc = require("swagger-jsdoc");
const express = require("express");
const path = require("path");
const glob = require("glob");

// Define the project root relative to this file (docs/swagger.js)
const projectRoot = path.resolve(__dirname, "../../");
console.log("Project root:", projectRoot);

// Define paths for routes and controllers
const routeFilesPattern = path.join(projectRoot, "src/routes/*.js");
const nestedRouteFilesPattern = path.join(
  projectRoot,
  "src/routes/search/*.js"
);
const controllerFilesPattern = path.join(projectRoot, "src/controllers/*.js");

// Log the patterns to debug
console.log("Route files pattern:", routeFilesPattern);
console.log("Nested route files pattern:", nestedRouteFilesPattern);
console.log("Controller files pattern:", controllerFilesPattern);

// Scan for route and controller files
const routeFiles = glob.sync(routeFilesPattern);
const nestedRouteFiles = glob.sync(nestedRouteFilesPattern);
const controllerFiles = glob.sync(controllerFilesPattern);

const allRouteFiles = [...routeFiles, ...nestedRouteFiles];

console.log("Swagger scanned route files:", allRouteFiles);
console.log("Swagger scanned controller files:", controllerFiles);

if (!allRouteFiles.length && !controllerFiles.length) {
  console.error("Swagger failed to load route or controller files");
}

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LinkUp API",
      version: "1.0.0",
      description:
        "API for LinkUp Social Media Application. Authentication tokens are provided and managed as secure cookies.",
      contact: {
        name: "API Support",
        email: "linkup.101203@gmail.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://52.200.206.235:3000/api/",
        description: "Production server",
      },
      { url: "http://localhost:3000/api/", description: "Development server" },
    ],
    tags: [
      {
        name: "Authentication",
        description: "User authentication and account management",
      },
      {
        name: "Profile",
        description: "User profile management",
      },
      {
        name: "Posts",
        description: "User posts management",
      },
      {
        name: "Stories",
        description: "Story management endpoints",
      },
      {
        name: "Highlights",
        description: "Story highlights management",
      },
      {
        name: "Messages",
        description: "Real-time messaging and conversations",
      },
      { name: "Test", description: "Test endpoints" },
      { name: "Admin", description: "Admin management endpoints" },
      {
        name: "Notifications",
        description: "Notification management endpoints",
      },
      {
        name: "Search",
        description: "Search for users and posts",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Authentication is handled via secure cookies. After login, accessToken and refreshToken are set as HttpOnly cookies and should be sent automatically with each request.",
        },
      },
      schemas: {
        Highlight: {
          type: "object",
          properties: {
            HighlightID: { type: "integer", example: 1 },
            Title: { type: "string", example: "Summer Adventures" },
            CoverImage: {
              type: "string",
              example: "https://example.com/cover.jpg",
            },
            UserID: { type: "integer", example: 1 },
            CreatedAt: {
              type: "string",
              format: "date-time",
              example: "2023-01-01T00:00:00Z",
            },
            Stories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  StoryID: { type: "integer", example: 1 },
                  MediaURL: {
                    type: "string",
                    example: "https://example.com/story1.jpg",
                  },
                },
              },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            UserID: { type: "integer", example: 1 },
            Username: { type: "string", example: "john_doe" },
            Email: { type: "string", example: "john@example.com" },
            ProfilePicture: {
              type: "string",
              example: "https://example.com/john.jpg",
            },
            bio: { type: "string", example: "I love coding!" },
            IsPrivate: { type: "boolean", example: false },
            CreatedAt: { type: "string", format: "date-time" },
          },
        },
        Post: {
          type: "object",
          properties: {
            postId: { type: "integer", example: 1 },
            content: { type: "string", example: "This is my post!" },
            imageUrl: {
              type: "string",
              example: "https://example.com/image.jpg",
              nullable: true,
            },
            videoUrl: {
              type: "string",
              example: "https://example.com/video.mp4",
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            user: {
              type: "object",
              properties: {
                UserID: { type: "integer", example: 1 },
                Username: { type: "string", example: "john_doe" },
                isPrivate: { type: "boolean", example: false },
              },
            },
          },
        },
        Follower: {
          type: "object",
          properties: {
            UserID: { type: "integer", example: 1 },
            Username: { type: "string", example: "johndoe" },
            ProfilePicture: {
              type: "string",
              example: "https://example.com/profile.jpg",
            },
          },
        },
        FollowRequest: {
          type: "object",
          properties: {
            FollowerID: { type: "integer", example: 1 },
            UserID: { type: "integer", example: 2 },
            FollowerUser: { $ref: "#/components/schemas/User" },
            Status: {
              type: "string",
              enum: ["PENDING", "ACCEPTED", "REJECTED"],
              example: "PENDING",
            },
            CreatedAt: { type: "string", format: "date-time" },
            UpdatedAt: { type: "string", format: "date-time" },
          },
        },
        UserAuth: {
          type: "object",
          required: [
            "profileName",
            "username",
            "email",
            "password",
            "gender",
            "dateOfBirth",
          ],
          properties: {
            profileName: {
              type: "string",
              minLength: 3,
              maxLength: 50,
              pattern: "^[a-zA-Z0-9\\s\\-']+$",
              example: "John Doe",
              description:
                "User's profile name (3-50 characters, letters, numbers, spaces, hyphens, apostrophes)",
            },
            username: {
              type: "string",
              minLength: 3,
              maxLength: 30,
              pattern: "^[a-zA-Z0-9_]+$",
              example: "john_doe",
              description:
                "Unique username (alphanumeric and underscores only)",
            },
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
              description: "Valid email address",
            },
            password: {
              type: "string",
              minLength: 8,
              example: "P@ssw0rd123",
              description:
                "Password with minimum 8 characters, must include at least one uppercase letter, one lowercase letter, one number, and one special character",
            },
            gender: {
              type: "string",
              enum: ["MALE", "FEMALE"],
              example: "MALE",
              description: "User's gender",
            },
            dateOfBirth: {
              type: "string",
              format: "date",
              example: "2000-01-01",
              description:
                "User's date of birth (ISO 8601 format, e.g., 2000-01-01, user must be at least 13 years old)",
            },
          },
        },
        LoginCredentials: {
          type: "object",
          required: ["usernameOrEmail", "password"],
          properties: {
            usernameOrEmail: { type: "string", example: "john_doe" },
            password: {
              type: "string",
              format: "password",
              example: "P@ssw0rd123",
            },
          },
        },
        PasswordResetRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
            },
          },
        },
        VerifyCodeRequest: {
          type: "object",
          required: ["email", "code"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "john@example.com",
            },
            code: {
              type: "string",
              pattern: "^[0-9]{4}$",
              example: "1234",
            },
          },
        },
        PasswordResetWithToken: {
          type: "object",
          required: ["resetToken", "newPassword"],
          properties: {
            resetToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            newPassword: {
              type: "string",
              minLength: 8,
              example: "NewP@ssw0rd123",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            codeSent: { type: "boolean" },
            resetToken: { type: "string" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Error message" },
            error: { type: "string", example: "Detailed error message" },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  msg: { type: "string", example: "Error message" },
                },
              },
            },
          },
          example: {
            message: "Invalid registration data",
            errors: [
              {
                msg: "Invalid date of birth format",
              },
            ],
          },
        },
        ReportedPost: {
          type: "object",
          properties: {
            postId: { type: "integer" },
            content: { type: "string" },
            reportCount: { type: "integer" },
            reporterUsernames: {
              type: "array",
              items: { type: "string" },
            },
            createdAt: { type: "string", format: "date-time" },
            owner: { type: "string" },
          },
        },
        UserDetails: {
          type: "object",
          properties: {
            userId: { type: "integer" },
            username: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["USER", "ADMIN", "BANNED"] },
            isBanned: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            postCount: { type: "integer" },
            filedReportCount: { type: "integer" },
            reportedPostCount: { type: "integer" },
          },
        },
        AdminAction: {
          type: "object",
          properties: {
            actionType: {
              type: "string",
              enum: ["DELETE_POST", "WARN_USER", "BAN_USER", "DISMISS_REPORT"],
            },
            postId: { type: "integer" },
            userId: { type: "integer" },
            reason: { type: "string" },
          },
        },
        UpdateUser: {
          type: "object",
          properties: {
            userId: { type: "integer" },
            role: { type: "string", enum: ["USER", "ADMIN", "BANNED"] },
            isBanned: { type: "boolean" },
            reason: { type: "string" },
          },
        },
      },
      parameters: {
        userIdParam: {
          in: "path",
          name: "userId",
          required: true,
          schema: { type: "integer" },
          description: "ID of the user",
        },
        requestIdParam: {
          in: "path",
          name: "requestId",
          required: true,
          schema: { type: "integer" },
          description: "ID of the follow request",
        },
        conversationIdParam: {
          in: "path",
          name: "conversationId",
          required: true,
          schema: { type: "string" },
          description: "ID of the conversation",
        },
        messageIdParam: {
          in: "path",
          name: "messageId",
          required: true,
          schema: { type: "string" },
          description: "ID of the message",
        },
        highlightIdParam: {
          in: "path",
          name: "highlightId",
          required: true,
          schema: { type: "integer" },
          description: "ID of the highlight",
        },
        postIdParam: {
          name: "postId",
          in: "path",
          required: true,
          schema: { type: "integer" },
          description: "ID of the post",
        },
        storyIdParam: {
          in: "path",
          name: "storyId",
          required: true,
          schema: { type: "integer" },
          description: "ID of the story",
        },
      },
      responses: {
        UnauthorizedError: {
          description:
            "Unauthorized - Authentication token is missing or invalid",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                message: "Unauthorized",
                error: "Authentication token is missing or invalid",
              },
            },
          },
        },
        NotFoundError: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              example: {
                message: "Not Found",
                error: "The requested resource was not found",
              },
            },
          },
        },
        UserResponse: {
          description: "User registration response",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "User registered successfully",
                  },
                  userId: { type: "integer", example: 1 },
                },
              },
            },
          },
        },
        PasswordResetResponse: {
          description: "Password reset response",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Password reset link has been sent",
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    path.join(__dirname, "../../src/routes/*.js"),
    path.join(__dirname, "../../src/routes/search/*.js"),
    path.join(__dirname, "../../src/controllers/*.js"),
  ],
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

console.log("Swagger scanned routes:", Object.keys(swaggerDocs.paths));

module.exports = (app) => {
  app.use(
    "/swagger-ui",
    express.static(path.join(__dirname, "../../node_modules/swagger-ui-dist"))
  );

  app.get("/api-docs", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LinkUp API Documentation</title>
        <link rel="stylesheet" href="/swagger-ui/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="/swagger-ui/swagger-ui-bundle.js"></script>
        <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
        <script>
          window.onload = () => {
            try {
              window.ui = SwaggerUIBundle({
                url: '/api-docs.json',
                dom_id: '#swagger-ui',
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIStandalonePreset
                ],
                layout: "StandaloneLayout"
              });
            } catch (error) {
              console.error('Swagger UI initialization failed:', error);
            }
          };
        </script>
      </body>
      </html>
    `);
  });

  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerDocs);
  });
};
