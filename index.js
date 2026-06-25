const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
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
    const parcelsCollection = client.db('proFast_DB').collection('parcels')


    // products route
    app.get('/parcels', async(req, res)=>{
        const query = {}

        const {email} = req.query;
        if(email){
            query.senderEmail = email
        }

        const options = {sort : {createdAt: -1}}
        
        const cursor = parcelsCollection.find(query, options)
        const result = await cursor.toArray()
        console.log(result);
        res.send(result)
    })

    app.get('/parcels/:id', async(req, res)=>{
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await parcelsCollection.findOne(query)
      res.send(result)
    })

    app.post('/parcels', async(req, res)=>{
        const parcel = req.body
        // parcel sending time
        parcel.createdAt = new Date()
        const result = await parcelsCollection.insertOne(req.body)
        res.send(result)
    })

    app.delete('/parcels/:id', async(req, res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await parcelsCollection.deleteOne(query)
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
