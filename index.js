import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

// Initialize Express application
const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://drivefleet-client.vercel.app'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3oyhi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
};

async function run() {
  try {
    // await client.connect();
    const db = client.db('drivefleet');
    const carsCollection = db.collection('cars');
    const bookingsCollection = db.collection('bookings');
    const usersCollection = db.collection('users');

    // JWT Middleware - Verifies HTTPOnly cookie token
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: 'Unauthorized access. No token provided.' });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access. Invalid token.' });
        }
        req.user = decoded;
        next();
      });
    };

    // ============ AUTH APIs ============
    // POST /api/auth/signup - Register a new user account
    app.post('/api/auth/signup', async (req, res) => {
      const { name, email, photoURL, password } = req.body;
      const existing = await usersCollection.findOne({ email });
      if (existing) {
        return res.status(400).send({ message: 'User already exists' });
      }
      const result = await usersCollection.insertOne({
        name,
        email,
        photoURL,
        password,
        createdAt: new Date(),
      });
      res.send({ message: 'User created', insertedId: result.insertedId });
    });

    // POST /api/auth/login - Authenticate user and set JWT cookie
    app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body;
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(401).send({ message: 'Invalid email or password' });
      }
      if (user.password !== password) {
        return res.status(401).send({ message: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { email: user.email, name: user.name, photoURL: user.photoURL },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '7d' }
      );
      res.cookie('token', token, cookieOptions).send({
        message: 'Login successful',
        user: { email: user.email, name: user.name, photoURL: user.photoURL },
      });
    });

    // POST /api/auth/google - Google OAuth login/signup
    app.post('/api/auth/google', async (req, res) => {
      const { name, email, photoURL } = req.body;
      const existing = await usersCollection.findOne({ email });
      if (!existing) {
        await usersCollection.insertOne({
          name,
          email,
          photoURL,
          password: '',
          createdAt: new Date(),
        });
      } else {
        await usersCollection.updateOne(
          { email },
          { $set: { name, photoURL } }
        );
      }
      const token = jwt.sign(
        { email, name, photoURL },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '7d' }
      );
      res.cookie('token', token, cookieOptions).send({
        message: 'Login successful',
        user: { email, name, photoURL },
      });
    });

    // POST /api/auth/logout - Clear JWT cookie
    app.post('/api/auth/logout', async (req, res) => {
      res.clearCookie('token', cookieOptions).send({ message: 'Logged out' });
    });

    // GET /api/auth/me - Get current authenticated user
    app.get('/api/auth/me', verifyToken, async (req, res) => {
      const user = await usersCollection.findOne(
        { email: req.user.email },
        { projection: { password: 0 } }
      );
      res.send(user);
    });

    // ============ CARS APIs ============
    // GET /api/cars - Get all cars with optional search and filter
    app.get('/api/cars', async (req, res) => {
      const { search, carType, limit } = req.query;
      let query = {};
      if (search) {
        query.carName = { $regex: search, $options: 'i' };
      }
      if (carType && carType !== 'All') {
        query.carType = carType;
      }
      const cars = await carsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 0)
        .toArray();
      res.send(cars);
    });

    // GET /api/cars/:id - Get a single car by ID
    app.get('/api/cars/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid car ID format' });
      }
      const car = await carsCollection.findOne({ _id: new ObjectId(id) });
      if (!car) {
        return res.status(404).send({ message: 'Car not found' });
      }
      res.send(car);
    });

    // POST /api/cars - Add a new car listing (private)
    app.post('/api/cars', verifyToken, async (req, res) => {
      const { carName, dailyPrice, carType, image, seatCapacity, location, description, availability } = req.body;
      if (!carName || !dailyPrice || !carType || !image || !seatCapacity || !location || !description) {
        return res.status(400).send({ message: 'All fields are required' });
      }
      const car = {
        carName, dailyPrice: Number(dailyPrice), carType, image,
        seatCapacity: Number(seatCapacity), location, description,
        availability: availability ?? true,
        userEmail: req.user.email,
        userName: req.user.name,
        createdAt: new Date(),
        bookingCount: 0,
      };
      const result = await carsCollection.insertOne(car);
      res.send(result);
    });

    app.put('/api/cars/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const car = await carsCollection.findOne({ _id: new ObjectId(id) });
      if (!car) {
        return res.status(404).send({ message: 'Car not found' });
      }
      if (car.userEmail !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden' });
      }
      const updateData = {};
      const fields = ['dailyPrice', 'description', 'availability', 'image', 'carType', 'location'];
      fields.forEach((f) => {
        if (req.body[f] !== undefined) updateData[f] = req.body[f];
      });
      const result = await carsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      res.send(result);
    });

    app.delete('/api/cars/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const car = await carsCollection.findOne({ _id: new ObjectId(id) });
      if (!car) {
        return res.status(404).send({ message: 'Car not found' });
      }
      if (car.userEmail !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden' });
      }
      const result = await carsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/api/my-cars', verifyToken, async (req, res) => {
      const cars = await carsCollection
        .find({ userEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(cars);
    });

    // ============ BOOKINGS APIs ============
    // POST /api/bookings - Create a new booking (private)
    app.post('/api/bookings', verifyToken, async (req, res) => {
      const { carId, driverNeeded, specialNote, bookingDate, totalPrice } = req.body;
      if (!carId || !totalPrice) {
        return res.status(400).send({ message: 'Car ID and total price are required' });
      }
      if (!ObjectId.isValid(carId)) {
        return res.status(400).send({ message: 'Invalid car ID format' });
      }
      const car = await carsCollection.findOne({ _id: new ObjectId(carId) });
      if (!car) {
        return res.status(404).send({ message: 'Car not found' });
      }
      if (!car.availability) {
        return res.status(400).send({ message: 'Car is not available for booking' });
      }
      const booking = {
        carId,
        userEmail: req.user.email,
        userName: req.user.name,
        driverNeeded,
        specialNote,
        bookingDate: bookingDate || new Date(),
        totalPrice,
        createdAt: new Date(),
      };
      const result = await bookingsCollection.insertOne(booking);
      await carsCollection.updateOne(
        { _id: new ObjectId(carId) },
        { $inc: { bookingCount: 1 } }
      );
      res.send(result);
    });

    app.get('/api/my-bookings', verifyToken, async (req, res) => {
      const bookings = await bookingsCollection
        .find({ userEmail: req.user.email })
        .sort({ createdAt: -1 })
        .toArray();

      const carIds = [...new Set(bookings.map((b) => b.carId))];
      const cars = await carsCollection
        .find({ _id: { $in: carIds.map((id) => new ObjectId(id)) } })
        .toArray();
      const carMap = {};
      cars.forEach((c) => (carMap[c._id.toString()] = c));

      const enriched = bookings.map((b) => ({
        ...b,
        car: carMap[b.carId] || null,
      }));
      res.send(enriched);
    });

    // ============ Health Check ============
    app.get('/', (req, res) => {
      res.send('DriveFleet API is running');
    });

  } finally {
    // Keep connection alive
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`DriveFleet server running on port ${port}`);
});
