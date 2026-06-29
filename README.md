# DriveFleet Server

Backend API for DriveFleet Car Rental Platform.

## Tech Stack

- Express.js
- MongoDB with Mongoose
- JWT Authentication with HTTPOnly cookies
- CORS enabled

## API Endpoints

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/google` - Google login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `GET /api/cars` - Get all cars (with search & filter)
- `GET /api/cars/:id` - Get single car
- `POST /api/cars` - Add car (private)
- `PUT /api/cars/:id` - Update car (owner only)
- `DELETE /api/cars/:id` - Delete car (owner only)
- `GET /api/my-cars` - Get user's cars
- `POST /api/bookings` - Book a car (private)
- `GET /api/my-bookings` - Get user's bookings
