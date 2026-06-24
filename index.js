const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const port = process.env.PORT || 3000;
const app = express();
require("dotenv").config();

// middleware
app.use(express.json());
app.use(cors());

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
    await client.connect()
    const parcelsCollection = client.db('proFast_DB').collection('parcelsCollection')


    // products route
    app.get('/parcels', async(req, res)=>{
        res.send('parcel is coming')
    })

    app.post('/parcels', async(req, res)=>{
        const parcel = req.body
        const result = await parcelsCollection.insertOne(req.body)
        res.send(result)
    })


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

run()

app.listen(port, () => {
  console.log(`the app is running from port ${port}`);
});
