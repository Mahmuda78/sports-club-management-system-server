const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();
const  admin = require("firebase-admin");

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

const app = express();

// Port
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());


const serviceAccount = require('./firebase-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("Firebase Admin Initialized Successfully");


// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.klnjmif.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // await client.connect();
    const db = client.db('sportsDB');

    const usersCollection = db.collection('users');
    const courtsCollection = db.collection('courts');
    const bookingsCollection = db.collection('bookings');
    const paymentsCollection = db.collection('payments');
    const couponsCollection = db.collection('coupons');
    const announcementsCollection = db.collection('announcements');
    const ratingsCollection = db.collection('ratings');    

    // ----------------- Custom Middleware --------------
    
    // FB Token Verify
    const verifyFBToken = async (req, res, next) => {
      const token = req?.headers?.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).send({message: 'unauthorized Access!'});
      }



      try{
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next()
      }
      catch(error) {
        return res.status(403).send({ message: 'forbidden access' })
      }
    }

    // // Verify Admin
    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decoded.email;
    //   const user = await usersCollection.findOne({email});
    //   if (user.role !== 'admin') {
    //     return res.status(403).send({ message: 'forbidden access' });
    //   }
    //   next();
    // }


    // --------------Users All API Here-------------
    app.post('/users', async (req, res) => {
        const userInfo = req.body;
        const {email} = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

          const existingUser = await usersCollection.findOne({ email });

            if (existingUser) {
                return res.status(200).json({ message: 'User already exists' });
            }

        const result = await usersCollection.insertOne(userInfo);
        res.send(result);
    });

    // Get users Count
    app.get("/api/users/count", async (req, res) => {
        const totalCount = await usersCollection.countDocuments();
        res.send({ totalUsers: totalCount });
    });    

    // ------------Get User--------
    app.get('/users', verifyFBToken, async(req, res) => {
        const { search, email } = req.query;
        let query = {};
         if (email) {
            query.email = email;
         }

        else if(search){
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' }},
                    { email: { $regex: search, $options: 'i' }},
                ]
            };
        };
        const users = await usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
        res.send(users)
    });

    // Get User Role
    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      const email = req.params.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const user = await usersCollection
      .findOne({email});

      if (!user) {
         return res.status(404).send({ message: "User not found" });
      }

      res.send({ role: user.role || "user" })
    })

// Update user by email (PATCH)
app.patch("/users/:email", async (req, res) => {
  const email = req.params.email;
  const updateData = { ...req.body };

  if (!email) return res.status(400).send({ message: "Email is required" });

  // Prevent updating _id
  if (updateData._id) delete updateData._id;

  try {
    const result = await usersCollection.updateOne(
      { email },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "User not found" });
    }

    const updatedUser = await usersCollection.findOne({ email });
    res.send(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});





   
   // Get all members
app.get('/members', verifyFBToken, async (req, res) => {
  const { search } = req.query;

  const query = {
    role: "member", 
    ...(search && { name: { $regex: search, $options: "i" } })
  };

  const members = await usersCollection
    .find(query)
    .sort({ memberSince: -1 })
    .toArray();

  res.send(members);
});



// Delete a member
app.delete('/members/:id', verifyFBToken, async (req, res) => {
  const id = req.params.id;
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});


    // ------------- All Bookings API --------------
    // Post Booking
    app.post('/bookings', verifyFBToken, async(req, res) => {
      const booking = req.body;

        // Validation
        const requiredFields = ['userEmail', 'courtId', 'courtTitle', 'courtType', 'date', 'slots', 'price'];
        const missingField = requiredFields.find(field => !booking[field]);

        if (missingField) {
          return res.status(400).json({ message: `Missing field: ${missingField}` });
        }

        booking.status = 'pending';
        booking.createdAt = new Date().toISOString();

      const result = await bookingsCollection.insertOne(booking);
      res.send(result)
    });


app.get("/api/bookings/count", async (req, res) => {
    const totalCount = await bookingsCollection.countDocuments();
    res.send({ totalBookings: totalCount });
});


    app.get("/api/bookings/count/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const userCount = await bookingsCollection.countDocuments({ userEmail: email });
        res.json({ userEmail: email, totalBookings: userCount });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch user bookings" });
      }
    });    

    // Get bookings
    app.get('/bookings', verifyFBToken, async(req, res)=>{
      const {email, status,search} = req.query;

      let query = {};
      if (email) {
        query.userEmail = email;
      };
      if (status) {
        query.status=status;
      };
      if (search) {
            query = {
            courtTitle: { $regex: search, $options: 'i' }
            };
      }

      const result = await bookingsCollection
      .find(query)
      .sort({ date: -1 })
      .toArray();
      res.send(result);
    });

// GET /api/bookings/pending/total
app.get("/api/bookings/pending/total", async (req, res) => {
  try {
    const { role, email } = req.query; 

    const filter = role === "admin" ? { status: "pending" } : { status: "pending", userEmail: email };

    const pendingBookings = await bookingsCollection.find(filter).toArray();

    const totalPending = pendingBookings.length;

    res.send({ totalPending });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch total pending bookings" });
  }
});

// GET /api/bookings/approved/total
app.get("/api/bookings/approved/total", async (req, res) => {
  try {
    const { role, email } = req.query;

    const filter = role === "admin" ? { status: "approved" } : { status: "approved", userEmail: email };

    const approvedBookings = await bookingsCollection.find(filter).toArray();

    const totalApproved = approvedBookings.length;

    res.send({ totalApproved });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch total Approved bookings" });
  }
});


// GET /api/bookings/approved/total
app.get("/api/bookings/confirmed/total", async (req, res) => {
  try {
    const { role, email } = req.query; 
    
    const filter = role === "admin" ? { status: "confirmed" } : { status: "confirmed", userEmail: email };

    const confirmedBookings = await bookingsCollection.find(filter).toArray();

    const totalConfirmed = confirmedBookings.length;

    res.send({ totalConfirmed });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch total Approved bookings" });
  }
});



    // Get single Booking
    app.get('/bookings/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const result = await bookingsCollection.findOne({_id: new ObjectId(id)});
      res.send(result)
    })

    // Update Booking Status
// Update Booking Status + Promote User to Member if approved
// Update Booking Status + Promote User to Member if approved
app.patch('/bookings/:id', verifyFBToken, async (req, res) => {
  const id = req.params.id;
  const { status, email, discountedPrice } = req.body; // 👈 discount price নিতে হবে

  const filter = { _id: new ObjectId(id) };
  const updateFields = {};

  if (status) updateFields.status = status;
  if (discountedPrice !== undefined) updateFields.discountedPrice = discountedPrice; // 👈 save করবো

  const result = await bookingsCollection.updateOne(filter, { $set: updateFields });

  // Booking approved হলে user কে member বানানো
  let userResult = null;
  if (status === 'approved') {
    userResult = await usersCollection.updateOne(
      { email },
      {
        $set: {
          role: 'member',
          memberSince: new Date().toISOString(),
        },
      }
    );
  }

  res.send({
    bookingUpdate: result,
    userUpdate: userResult,
  });
});




    // Delete Bookings
    app.delete('/bookings/:id', verifyFBToken, async(req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(filter);
      res.send(result);
    })

    // ---------- All Courts API here -----------------

    // Courts Count
    app.get('/courtsCount', async(req, res) => {
      const result = await courtsCollection.estimatedDocumentCount();
      res.send({totalCourtsCount: result})
    })

    // Post Courts
    app.post('/courts', verifyFBToken,  async(req, res) => {
      const courtData = req.body;
      const result = await courtsCollection.insertOne(courtData);
      res.send(result)
    })

    // Get Courts
    app.get("/courts", async (req, res) => {
      const courts = await courtsCollection.find().toArray();
      res.send(courts);
    });

    // Update Courts
    app.patch('/courts/:id', verifyFBToken,  async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updateData = req.body;
      const updatedDocs = {
        $set: updateData,
      }
      const result = await courtsCollection.updateOne(filter, updatedDocs);
      res.send(result)
    });

    // Delete Courts
    app.delete('/courts/:id', verifyFBToken,  async (req, res) => {
      const id = req.params.id;
      const result = await courtsCollection.deleteOne({_id: new ObjectId(id)});
      res.send(result);
    })

    // ---------- Coupons All API here -------------

    // Post
    app.post('/coupons', verifyFBToken,  async(req, res) => {
      const couponData = req.body;
      const result = await couponsCollection.insertOne(couponData);
      res.send(result)
    })

    // Get Coupons
    app.get('/coupons', async (req, res) => {
      const result = await couponsCollection
      .find()
      .toArray();
      res.send(result)
    })

   
    app.patch('/coupons/:id', verifyFBToken,  async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDocs = {
        $set: updateData
      };
      const result = await couponsCollection.updateOne(filter, updatedDocs);
      res.send(result)
    });

    // Delete
    app.delete('/coupons/:id', verifyFBToken,  async(req, res) => {
      const id = req.params.id;
      const result = await couponsCollection.deleteOne({_id: new ObjectId(id)});
      res.send(result);
    })

    // Validate Coupon
    app.post('/validate-coupon', verifyFBToken, async (req, res) => {
      const {code} = req.body;

      const coupon = await couponsCollection.findOne({code});

      if (!coupon) {
        return res.send({ valid: false });
      }

      return res.send({
      valid: true,
      discountAmount: coupon.discountAmount,
    });

    });


  // ---------------- Payments Api here ------------

// Create Payment Intent API
app.post('/create-payment-intent', verifyFBToken, async (req, res) => {
  try {
    const { bookingId, couponCode } = req.body;

    if (!bookingId) {
      return res.status(400).send({ error: 'Booking ID is required' });
    }

    // ১. Booking data fetch
    const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });
    if (!booking) return res.status(404).send({ error: 'Booking not found' });

    let finalPrice = booking.price;

    // ২. Coupon validate করা
    if (couponCode) {
      const coupon = await couponsCollection.findOne({ code: couponCode });
      if (coupon && coupon.discountAmount) {
        const discountPercentage = coupon.discountAmount;
        const discountAmount = (booking.price * discountPercentage) / 100;
        finalPrice = booking.price - discountAmount;
      }
    }

    // ৩. Price validate
    if (!finalPrice || finalPrice <= 0) {
      return res.status(400).send({ error: 'Invalid final price' });
    }

    const amount = parseInt(finalPrice * 100); // Stripe expects cents

    // ৪. Stripe PaymentIntent create
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd', 
      payment_method_types: ['card'],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
      finalPrice, // frontend এ দেখানোর জন্য
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).send({ error: 'Failed to create payment intent' });
  }
});


// Payment History

// Post
app.post('/payments', verifyFBToken, async(req, res) => {
  const paymentData = req.body;
  paymentData.status = "paid";

  const result = await paymentsCollection.insertOne(paymentData);

  // update Booking Status
  const bookingId = paymentData.bookingId;
  const filter = {_id: new ObjectId(bookingId)};
  const update = {$set: {status: 'confirmed'}};
  const bookingResult = await bookingsCollection.updateOne(filter, update);

  res.send(result, bookingResult) 
});


// GET /api/payments/total
app.get("/api/payments/total", async (req, res) => {
  try {
    const { role, email } = req.query;

    const filter = role === "admin" ? {} : { email };
    const payments = await paymentsCollection.find(filter).toArray();
    const totalPayments = payments.reduce((sum, p) => sum + p.price, 0);

    res.send({ totalPayments });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch total payments" });
  }
});


// GET /api/paymentsLength/total
app.get("/api/payments/length", async (req, res) => {
  try {
    const { role, email } = req.query;

    const filter = role === "admin" ? {} : { email };
    const payments = await paymentsCollection.find(filter).toArray();
    const totalPaymentsLength = payments.length;

    res.send({ totalPaymentsLength });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch total payments Length" });
  }
});



// Get Payments History
app.get('/payments', verifyFBToken, async (req, res) => {
  const { email } = req.query;
  const payments = await paymentsCollection
  .find({ email })
  .sort({ date: -1 })
  .toArray();
  res.send(payments);
    console.log('Payments found:', payments);
});


// ---------- Announcements API ------------

// POST API
app.post('/announcements', verifyFBToken,  async(req, res) => {
  const data = req.body;
  const result = await announcementsCollection.insertOne(data);
  res.send(result);
})

// GET API
app.get('/announcements', verifyFBToken, async(req, res) => {
  const result = await announcementsCollection
  .find()
  .sort({ postAt: -1 })
  .toArray();
  res.send(result);
});

// Patch API
app.patch('/announcements/:id', verifyFBToken,  async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  const filter = {_id: new ObjectId(id)};
  const updatedDocs = {
    $set: updateData,
  };

  const result = await announcementsCollection.updateOne(filter, updatedDocs);
  res.send(result)
});

// Delete API
app.delete('/announcements/:id', verifyFBToken,  async (req, res) => {
  const id = req.params.id;
  const result = await announcementsCollection.deleteOne({_id: new ObjectId(id)});
  res.send(result)
});

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

// Get counter Data
app.get('/admin-stats', verifyFBToken,  async(req, res) => {
  const email = req.query.email;
  const user = await usersCollection.findOne({email});

  if (user?.role !== 'admin') {
     return res.status(403).send({ message: 'forbidden' });
  }

  const totalCourts = await courtsCollection.estimatedDocumentCount();
  const totalUsers = await usersCollection.estimatedDocumentCount();
  const totalMembers = await usersCollection.countDocuments({role: 'member'});
  res.send({ totalCourts, totalUsers, totalMembers });
});




// Example test route
    app.get('/', (req, res) => {
      res.send('SCMS Server is Running');
    });








// -------------------------------------
  } finally {
    // keep connection alive
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});