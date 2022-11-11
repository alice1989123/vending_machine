require("dotenv").config();
const MongoClient = require("mongodb").MongoClient;

const user = process.env.DB_USER;
const pw = process.env.DB_KEY;

const uri = `mongodb+srv://${user}:${pw}@cluster0.eshcn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const databaseName = JSON.parse(process.env.TESTNET)
  ? "Prima_Vending_Machine_testnet"
  : "Prima_Vending_Machine";

async function registerTransaction(transactions, collection) {
  //We connecto to DB
  client.connect(function (err, db) {
    if (err) throw err;
    const dbo = db.db(databaseName);

    //First we erase previuos register of that NFT since it may be sold at another price before.

    //console.log(myobj);

    dbo
      .collection(`${collection}`)
      .insertMany(transactions, { ordered: false }, function (err, res) {
        if (err) throw err;
        console.log(
          `The new transactions have been registered In the collection ${collection}`
        );
        db.close();
        client.close;
        return null;
      });
  });
}

async function getRegisteredTx(collection) {
  let result;
  try {
    await client.connect();
    const database = client.db(databaseName);
    const transactions = await database.collection(`${collection}`);

    const cursor = await transactions.find();
    result = await cursor.toArray();

    if (!result) {
      console.log("No documents found!");
    }
  } finally {
    await client.close();
    return result;
  }
}

async function getLastRegisteredTx(collection) {
  let result;
  try {
    await client.connect();
    const database = client.db(databaseName);
    const transactions = await database.collection(`${collection}`);

    const cursor = await transactions.find().sort({ $natural: -1 }).limit(1); //findOne().sort({ $natural: -1 });
    result = await cursor.toArray();
    //console.log(result);

    if (!result) {
      console.log("No documents found!");
    }
  } finally {
    await client.close();
    return result;
  }
}

module.exports.registerTransaction = registerTransaction;
module.exports.getRegisteredTx = getRegisteredTx;
module.exports.getLastRegisteredTx = getLastRegisteredTx;

/* getLastRegisteredTx("PayedTxs")
  .then((r) => console.log(r))
  .catch((e) => console.log(e));
 */
//console.log(await getRegisteredTx());
//console.log(await getIpfsHash(277));
