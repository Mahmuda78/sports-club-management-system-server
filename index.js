const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const verifyFirebaseJWT = require("./verifyFirebaseJWT");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin Setup
const serviceAccount = require("./firebase-admin.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.klnjmif.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  try {
    await client.connect();
    console.log(" MongoDB connected");

    const db = client.db("sportsDB");

    const courtsCollection = db.collection("courts");
    const bookingsCollection = db.collection("bookings");
    const usersCollection = db.collection("users");
    const couponsCollection = db.collection("coupons");
    const announcementsCollection = db.collection("announcements");
    const paymentsCollection = db.collection("payments");

    // ---------------- COURTS ----------------
    app.post("/courts", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const { image, type, slots, price } = req.body;
      const court = { image, type, slots, price: Number(price), createdAt: new Date() };
      const result = await courtsCollection.insertOne(court);
      res.send(result);
    });

    app.get("/courts", async (req, res) => {
      const courts = await courtsCollection.find().toArray();
      res.send(courts);
    });

    app.get("/courts/:id", async (req, res) => {
      const court = await courtsCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(court);
    });

    app.patch("/courts/:id", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const { image, type, slots, price } = req.body;
      const result = await courtsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { image, type, slots, price: Number(price) } }
      );
      res.send(result);
    });

    app.delete("/courts/:id", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const result = await courtsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // ---------------- BOOKINGS ----------------
    app.post("/bookings", verifyFirebaseJWT, async (req, res) => {
      const booking = req.body;
      booking.userEmail = req.user.email;
      booking.userId = req.user.uid;
      booking.status = "pending";
      booking.createdAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyFirebaseJWT, async (req, res) => {
      const { status } = req.query;
      let query = {};
      if (req.user.email === process.env.ADMIN_EMAIL) {
        if (status) query.status = status;
      } else {
        query.userEmail = req.user.email;
        if (status) query.status = status;
      }
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.delete("/bookings/:id", verifyFirebaseJWT, async (req, res) => {
      const booking = await bookingsCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!booking) return res.status(404).send({ message: "Booking not found" });
      if (booking.userEmail !== req.user.email && req.user.email !== process.env.ADMIN_EMAIL)
        return res.status(403).send({ message: "Forbidden" });

      const result = await bookingsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.patch("/bookings/:id/approve", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const id = req.params.id;
      const bookingResult = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );

      const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
      if (booking) {
        await usersCollection.updateOne(
          { email: booking.userEmail },
          { $set: { role: "member", isMember: true } },
          { upsert: true }
        );
      }
      res.send({ bookingResult, message: "Booking approved and user marked as member" });
    });

    app.patch("/bookings/:id/reject", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const id = req.params.id;
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } }
      );
      res.send(result);
    });

    // ---------------- USERS ----------------
    app.post("/users", verifyFirebaseJWT, async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.role = "user";
      user.isMember = false;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/users/:email", verifyFirebaseJWT, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user);
    });

    app.patch("/users/:id", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { role } }
      );
      res.send(result);
    });

    app.delete("/users/:id", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });


    // ---------------- PAYMENTS ----------------
    app.post("/payments", verifyFirebaseJWT, async (req, res) => {
      const payment = { ...req.body, createdAt: new Date(), userEmail: req.user.email };
      const result = await paymentsCollection.insertOne(payment);

      // update booking → confirmed
      if (payment.bookingId) {
        await bookingsCollection.updateOne(
          { _id: new ObjectId(payment.bookingId) },
          { $set: { status: "confirmed" } }
        );
      }
      res.send(result);
    });

    app.get("/payments", verifyFirebaseJWT, async (req, res) => {
      let query = {};
      if (req.user.email !== process.env.ADMIN_EMAIL) {
        query.userEmail = req.user.email;
      }
      const payments = await paymentsCollection.find(query).toArray();
      res.send(payments);
    });

    // ---------------- ADMIN STATS ----------------
    app.get("/admin/stats", verifyFirebaseJWT, async (req, res) => {
      if (req.user.email !== process.env.ADMIN_EMAIL) return res.status(403).send({ message: "Admins only" });

      const totalCourts = await courtsCollection.estimatedDocumentCount();
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const totalMembers = await usersCollection.countDocuments({ role: "member" });

      res.send({ totalCourts, totalUsers, totalMembers });
    });

  } catch (err) {
    console.error(" MongoDB connection error:", err);
  }
}

run().catch(console.dir);

// Test route
app.get("/", (req, res) => {
  res.send("🏆 Sports Club Management System API running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
