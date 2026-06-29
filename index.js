import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://client-ivory-rho-30.vercel.app',
    'https://client-awz2paull-ishfak-mahbub-samins-projects.vercel.app',
    'https://drivefleet-client.vercel.app',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
};

const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET || 'drivefleet_dev_secret_key_2024';

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access. No token provided.' });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access. Invalid token.' });
    }
    req.user = decoded;
    next();
  });
};

// In-memory data store (works on Vercel serverless)
const store = {
  users: [],
  cars: [],
  bookings: [],
};

// Seed data for demo
function seedData() {
  const sampleCars = [
    { carName: 'Tesla Model 3', dailyPrice: 89, carType: 'Electric', image: 'https://images.unsplash.com/photo-1532970131824-095f80b0f97c?w=600', seatCapacity: 5, location: 'New York', description: 'Smooth electric ride with autopilot features.', availability: true },
    { carName: 'Toyota Camry', dailyPrice: 45, carType: 'Sedan', image: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600', seatCapacity: 5, location: 'Los Angeles', description: 'Reliable and fuel-efficient sedan.', availability: true },
    { carName: 'Ford Explorer', dailyPrice: 75, carType: 'SUV', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600', seatCapacity: 7, location: 'Chicago', description: 'Spacious SUV perfect for family trips.', availability: true },
    { carName: 'Porsche 911', dailyPrice: 199, carType: 'Sports', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600', seatCapacity: 4, location: 'Miami', description: 'Luxury sports car with unmatched performance.', availability: true },
    { carName: 'Honda Civic', dailyPrice: 35, carType: 'Sedan', image: 'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=600', seatCapacity: 5, location: 'Houston', description: 'Compact and affordable daily driver.', availability: true },
    { carName: 'Jeep Wrangler', dailyPrice: 85, carType: 'SUV', image: 'https://images.unsplash.com/photo-1583267746897-2cf415887172?w=600', seatCapacity: 4, location: 'Denver', description: 'Off-road capable rugged SUV.', availability: true },
    { carName: 'Nissan Leaf', dailyPrice: 40, carType: 'Electric', image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600', seatCapacity: 5, location: 'San Francisco', description: 'Eco-friendly electric car for city driving.', availability: true },
    { carName: 'BMW X5', dailyPrice: 120, carType: 'SUV', image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600', seatCapacity: 5, location: 'Seattle', description: 'Premium SUV with luxurious interior.', availability: true },
  ];
  sampleCars.forEach((c) => {
    store.cars.push({
      _id: genId(),
      ...c,
      userEmail: 'demo@drivefleet.com',
      userName: 'DriveFleet Demo',
      createdAt: new Date(),
      bookingCount: Math.floor(Math.random() * 10),
    });
  });
}
seedData();

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

function findById(arr, id) {
  return arr.find((item) => item._id === id);
}

// ============ AUTH APIs ============
app.post('/api/auth/signup', (req, res) => {
  const { name, email, photoURL, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send({ message: 'Name, email, and password are required' });
  }
  const existing = store.users.find((u) => u.email === email);
  if (existing) {
    return res.status(400).send({ message: 'User already exists' });
  }
  const user = { _id: genId(), name, email, photoURL, password, createdAt: new Date() };
  store.users.push(user);
  res.send({ message: 'User created', insertedId: user._id });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = store.users.find((u) => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).send({ message: 'Invalid email or password' });
  }
  const token = jwt.sign(
    { email: user.email, name: user.name, photoURL: user.photoURL },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.cookie('token', token, cookieOptions).send({
    message: 'Login successful',
    user: { email: user.email, name: user.name, photoURL: user.photoURL },
  });
});

app.post('/api/auth/google', (req, res) => {
  const { name, email, photoURL } = req.body;
  let user = store.users.find((u) => u.email === email);
  if (!user) {
    user = { _id: genId(), name, email, photoURL, password: '', createdAt: new Date() };
    store.users.push(user);
  } else {
    user.name = name;
    user.photoURL = photoURL;
  }
  const token = jwt.sign({ email, name, photoURL }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, cookieOptions).send({
    message: 'Login successful', user: { email, name, photoURL },
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', cookieOptions).send({ message: 'Logged out' });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  const user = store.users.find((u) => u.email === req.user.email);
  if (!user) return res.status(404).send({ message: 'User not found' });
  const { password, ...safe } = user;
  res.send(safe);
});

// ============ CARS APIs ============
app.get('/api/cars', (req, res) => {
  const { search, carType, limit } = req.query;
  let filtered = [...store.cars];
  if (search) {
    filtered = filtered.filter((c) => c.carName.toLowerCase().includes(search.toLowerCase()));
  }
  if (carType && carType !== 'All') {
    filtered = filtered.filter((c) => c.carType === carType);
  }
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (limit) filtered = filtered.slice(0, parseInt(limit));
  res.send(filtered);
});

app.get('/api/cars/:id', (req, res) => {
  const car = findById(store.cars, req.params.id);
  if (!car) return res.status(404).send({ message: 'Car not found' });
  res.send(car);
});

app.post('/api/cars', verifyToken, (req, res) => {
  const { carName, dailyPrice, carType, image, seatCapacity, location, description, availability } = req.body;
  if (!carName || !dailyPrice || !carType || !image || !seatCapacity || !location || !description) {
    return res.status(400).send({ message: 'All fields are required' });
  }
  const car = {
    _id: genId(),
    carName, dailyPrice: Number(dailyPrice), carType, image,
    seatCapacity: Number(seatCapacity), location, description,
    availability: availability ?? true,
    userEmail: req.user.email, userName: req.user.name,
    createdAt: new Date(), bookingCount: 0,
  };
  store.cars.push(car);
  res.send({ acknowledged: true, insertedId: car._id });
});

app.put('/api/cars/:id', verifyToken, (req, res) => {
  const car = findById(store.cars, req.params.id);
  if (!car) return res.status(404).send({ message: 'Car not found' });
  if (car.userEmail !== req.user.email) return res.status(403).send({ message: 'Forbidden' });
  ['dailyPrice', 'description', 'availability', 'image', 'carType', 'location'].forEach((f) => {
    if (req.body[f] !== undefined) car[f] = req.body[f];
  });
  res.send({ acknowledged: true });
});

app.delete('/api/cars/:id', verifyToken, (req, res) => {
  const idx = store.cars.findIndex((c) => c._id === req.params.id);
  if (idx === -1) return res.status(404).send({ message: 'Car not found' });
  if (store.cars[idx].userEmail !== req.user.email) return res.status(403).send({ message: 'Forbidden' });
  store.cars.splice(idx, 1);
  res.send({ acknowledged: true });
});

app.get('/api/my-cars', verifyToken, (req, res) => {
  const cars = store.cars
    .filter((c) => c.userEmail === req.user.email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.send(cars);
});

// ============ BOOKINGS APIs ============
app.post('/api/bookings', verifyToken, (req, res) => {
  const { carId, driverNeeded, specialNote, bookingDate, totalPrice } = req.body;
  if (!carId || !totalPrice) return res.status(400).send({ message: 'Car ID and total price are required' });
  const car = findById(store.cars, carId);
  if (!car) return res.status(404).send({ message: 'Car not found' });
  if (!car.availability) return res.status(400).send({ message: 'Car is not available for booking' });
  const booking = {
    _id: genId(),
    carId, userEmail: req.user.email, userName: req.user.name,
    driverNeeded, specialNote, bookingDate: bookingDate || new Date(),
    totalPrice, createdAt: new Date(),
  };
  store.bookings.push(booking);
  car.bookingCount = (car.bookingCount || 0) + 1;
  res.send({ acknowledged: true, insertedId: booking._id });
});

app.get('/api/my-bookings', verifyToken, (req, res) => {
  const bookings = store.bookings
    .filter((b) => b.userEmail === req.user.email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const enriched = bookings.map((b) => ({
    ...b,
    car: findById(store.cars, b.carId) || null,
  }));
  res.send(enriched);
});

// ============ Health & SPA fallback ============
app.get('/', (req, res) => {
  res.send('DriveFleet API is running');
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) res.status(404).send('Not found');
    });
  }
});

// Export for Vercel
export default app;

// Start server for local dev
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`DriveFleet server running on port ${port}`);
  });
}
