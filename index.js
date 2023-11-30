const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

const stripe = require("stripe")(
  "sk_test_51OHVkoKz9GeGBed50qdbA9YnzIPGiLHsqx2VgcYsUxj6URGg6Vek933ngkeKXgb45nQVuyTBk5hFAc6pSLvmXzLu00YUiADBIy"
);

const jwt = require("jsonwebtoken");
require("dotenv").config();
// middleware
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0jbjnlh.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const userCollection = client.db("learner").collection("users");
    const requestCollection = client.db("learner").collection("teacherRequest");
    const allCollection = client.db("learner").collection("allClasses");
    const paymentCollection = client.db("learner").collection("payment");

    // jwt token create
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.Token, { expiresIn: "2h" });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.Token, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // use verify admin after verifyToken
    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isTeacher = user?.role === "teacher";
      if (!isTeacher) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user data load in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedInd: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // admin users list
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // admin teachers request
    app.get("/requests", verifyToken, verifyAdmin, async (req, res) => {
      const result = await requestCollection.find().toArray();
      res.send(result);
    });

    // checking admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    // checking teacher
    app.get("/user/teacher/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let teacher = false;
      if (user) {
        teacher = user?.role === "teacher";
      }
      res.send({ teacher });
    });

    // make admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    // individual user data
    app.get("/profile", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // request for teacher
    app.post("/request-teacher", verifyToken, async (req, res) => {
      const request = req.body;
      const result = await requestCollection.insertOne(request);
      const filter = { email: request.email };
      const updatedDoc = {
        $set: {
          status: "pending",
        },
      };
      const options = { upsert: true };
      const updated = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // request for accept
    app.patch("/accept/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          status: "accepted",
          role: "teacher",
        },
      };
      const result = await requestCollection.updateOne(
        filter,
        updatedDoc,
        options
      );

      const existingData = await requestCollection.findOne({
        _id: new ObjectId(id),
      });

      const updated = await userCollection.updateOne(
        {
          email: existingData.email,
        },

        updatedDoc,
        options
      );
      res.send(result);
    });

    // request for rejected
    app.patch("/reject/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          status: "rejected",
        },
      };
      const result = await requestCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      const existingData = await requestCollection.findOne({
        _id: new ObjectId(id),
      });

      const updated = await userCollection.updateOne(
        {
          email: existingData.email,
        },

        updatedDoc,
        options
      );
      res.send(result);
    });

    app.get("/users-new/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // teachers api
    app.post("/add-class", verifyToken, verifyTeacher, async (req, res) => {
      const add = req.body;
      const result = await allCollection.insertOne(add);
      res.send(result);
    });

    // teachers my classes api
    app.get(
      "/updated-class/:email",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const result = await allCollection.find(query).toArray();
        res.send(result);
      }
    );

    // update data get
    app.get("/update/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allCollection.findOne(query);
      res.send(result);
    });
    // updated data
    app.put("/updated/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const data = req.body;
      const content = {
        $set: {
          image: data.image,
          title: data.title,
          price: data.price,
          description: data.description,
        },
      };
      const result = await allCollection.updateOne(filter, content, options);
      res.send(result);
    });

    // teacher can delete classes
    app.delete("/class-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allCollection.deleteOne(query);
      res.send(result);
    });

    // admin get all classes
    app.get("/classes", verifyToken, verifyAdmin, async (req, res) => {
      const result = await allCollection.find().toArray();
      res.send(result);
    });

    // admin class patch
    app.patch(
      "/class-accept/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            status: "accepted",
          },
        };
        const result = await allCollection.updateOne(
          filter,
          updatedDoc,
          options
        );

        res.send(result);
      }
    );

    app.patch(
      "/class-reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await allCollection.updateOne(
          filter,
          updatedDoc,
          options
        );
        res.send(result);
      }
    );
    // global all class
    app.get("/users-class", async (req, res) => {
      const result = await allCollection.find().toArray();
      res.send(result);
    });
    // highlighted class
    app.get("/highlighted-class", async (req, res) => {
      const query = {};
      const options = { sort: { enroll: -1 } };
      const result = await allCollection
        .find(query, options)
        .limit(3)
        .toArray();
      res.send(result);
    });

    app.get("/payment/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allCollection.findOne(query);
      res.send(result);
    });

    // payment intent

    app.post("/payment-intent", async (req, res) => {
      const data = req.body;
      const price = data?.price;
      console.log(price);
      const amount = Number(price) * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment history
    app.post("/payment-history", async (req, res) => {
      const pay = req.body;
      const filter = { _id: new ObjectId(pay.id) };
      const result = await paymentCollection.insertOne(pay);
      const exsitingData = await allCollection.findOne(filter);
      const options = { upsert: true };
      const enrollUpdated = Number(exsitingData.enroll) + 1;
      const updatedDoc = {
        $set: {
          enroll: enrollUpdated,
        },
      };
      const updatedData = await allCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    app.get("/payment-history/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/state", async (req, res) => {
      const user = await userCollection.estimatedDocumentCount();
      const totalClass = await allCollection.estimatedDocumentCount();
      const result = await allCollection
        .aggregate([
          {
            $group: {
              _id: null,
              Enroll: {
                $sum: "$enroll",
              },
            },
          },
        ])
        .toArray();

      const totalEnroll = result.length > 0 ? result[0].Enroll : 0;

      res.send({ user, totalClass, totalEnroll });
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("welcome this web app");
});
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
