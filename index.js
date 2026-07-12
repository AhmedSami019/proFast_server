const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const crypto = require("crypto");

const admin = require("firebase-admin");
const serviceAccount = require("./profast-delivery-web-app-firebase-adminsdk.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// to generate random tracking id
function generateTrackingId() {
  const datePart = Date.now().toString().slice(-8);
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `PAR-${datePart}-${random}`;
}

// middleware
app.use(express.json());
app.use(cors());

// custom middleware
const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers?.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "unauthorize access" });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorize access" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);

    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({
      message: "Invalid token",
      error: error.message,
    });
  }
};

// root route
app.get("/", (req, res) => {
  res.send("pro fast rider coming");
});

// all route
const run = async () => {
  const uri = process.env.DB_URI;
  const client = new MongoClient(uri);

  try {
    // mongodb connection
    await client.connect();
    const usersCollection = client.db("proFast_DB").collection("users");
    const ridersCollection = client.db("proFast_DB").collection("riders");
    const parcelsCollection = client.db("proFast_DB").collection("parcels");
    const paymentCollection = client.db("proFast_DB").collection("payments");

    // middleware to verify admin
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decoded_email;
        const user = await usersCollection.findOne({ email });

        if (!user || user.role?.toLowerCase() !== "admin") {
          return res.status(403).send({ message: "Forbidden access" });
        }
        next();
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    };

    // users related apis

    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        // query.displayName = {$regex : searchText, $options: 'i'}
        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/users/:id", async (req, res) => {});

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;

      const isUserExits = await usersCollection.findOne({ email });
      if (isUserExits) {
        return res.send({ message: "user already exist" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const role = req.body.role;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      },
    );

    // riders related apis
    app.get("/riders", async (req, res) => {
      const query = {};
      const { status, district, workStatus } = req.query;

      if (status) {
        query.status = status;
      }

      if (district) {
        query.riderDistrict = district;
      }

      if (workStatus) {
        query.workStatus = workStatus;
      }
      const result = await ridersCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/riders", async (req, res) => {
      const rider = req.body;
      rider.status = "pending";
      rider.createdAt = new Date();

      const result = await ridersCollection.insertOne(rider);
      res.send(result);
    });

    app.patch("/riders/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: status,
          workStatus: "available",
        },
      };
      const result = await ridersCollection.updateOne(query, updatedDoc);
      if (status.toLowerCase() === "approved") {
        const riderEmail = req.body.riderEmail;
        const userQuery = {
          riderEmail,
        };
        const updatedRole = {
          $set: {
            role: "rider",
          },
        };
        const userResult = await usersCollection.updateOne(
          userQuery,
          updatedRole,
        );
      }
      res.send(result);
    });

    // products related apis
    app.get("/parcels", async (req, res) => {
      const query = {};

      const { email, deliveryStatus } = req.query;
      if (email) {
        query.senderEmail = email;
      }
      if (deliveryStatus) {
        query.deliveryStatus = deliveryStatus;
      }

      const options = { sort: { createdAt: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);
      res.send(result);
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      // parcel sending time
      parcel.createdAt = new Date();
      const result = await parcelsCollection.insertOne(req.body);
      res.send(result);
    });

    app.patch('/parcels/:id', async(req, res)=>{
      const {riderId, riderName, riderEmail} = req.body
      const id = req.params.id
      const parcelQuery = {_id : new ObjectId(id)}
      const updatedParcel = {
        $set :{
          deliveryStatus: 'driver_assigned',
          riderId,
          riderName,
          riderName
        }
      }
      const parcelResult = await parcelsCollection.updateOne(parcelQuery, updatedParcel)


      // update rider data
      const riderQuery = {_id: new ObjectId(riderId)}
      const updatedRider = {
        $set : {
          workStatus: "in_delivery",
        }
      }
      const riderResult = await ridersCollection.updateOne(riderQuery, updatedRider)
      res.send({parcelResult, riderResult})
    })

    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });

    // payment related apis of
    // new one
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.senderEmail,
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
      });
      res.send({ url: (await session).url });
    });

    // old api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };

      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          massage: "payment already exist",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();

      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus: "pickup-pending",
            trackingId: trackingId,
          },
        };
        const result = await parcelsCollection.updateOne(query, update);
        const updatedParcel = await parcelsCollection.findOne(query);
        console.log(updatedParcel);

        const payment = {
          amount: session.amount_total / 100,
          parcelName: session.metadata.parcelName,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };
        if (session.payment_status === "paid") {
          const paymentResult = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            modifyParcel: result,
            paymentInfo: paymentResult,
          });
        }
      }

      res.send({ success: false });
    });

    // get payment data
    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      // console.log("from api", email, req.decoded_email);

      const query = {};
      if (email) {
        query.customerEmail = email;
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidDen access" });
        }
      }
      const result = await paymentCollection
        .find(query)
        .sort({ paidAt: -1 })
        .toArray();
      res.send(result);
    });

    const ping = await client.db("proFast_DB").command({ ping: 1 });
    if (ping.ok === 1) {
      console.log(
        "pinged you deployment. you successfully connect to the mongodb",
      );
    }
  } catch (error) {
    console.dir;
    console.log(error.code);
  }
};

run();

app.listen(port, () => {
  console.log(`the app is running from port ${port}`);
});
