// mongo.js
const { MongoClient } = require("mongodb");

const uri =
  "mongodb+srv://admin:Dudibh300497@cluster0.jmq2uyx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

async function connect(collectionName = "routes") {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client.db("routesDB").collection(collectionName);
}

module.exports = { connect };
