"use-strict";
const { sleep, sendTokens, hasRugPull } = require("./Utils");
const {
  priceWhitelist,
  pricePeerNFt,
  maximumNFTs,
  policy,
  packSize,
  inversors,
} = require("./constants");
const blockFrost = require("./Cardano/BlockFrost/blockFrost");

const keys = require("./Cardano/Keys/keys");

const prvKey = keys(180).prvkey;
const serverAddress = keys(180).address;

const {
  registerTransaction,
  getRegisteredTx,
  getLastRegisteredTx,
} = require("./Database/AddressChecker");

//import { sendTokens } from "./NFTsender.mjs";

const getTransactionsUTXOs = async function (hash) {
  const transaction = await blockFrost.txsUtxos(hash);
  return transaction;
};

const registerTransactionstoPay = async function (blockTime) {
  let TransactionsInBlockChain = [];
  for (let i = 1; ; i++) {
    // for some reason blockfrost page 0 is the same as page 1 so we start in 1
    const TransactionsInBlockChaini = await blockFrost.addressesTransactions(
      serverAddress,
      { order: "desc", page: i }
    );
    TransactionsInBlockChain = [
      ...TransactionsInBlockChain,
      ...TransactionsInBlockChaini,
    ];
    if (TransactionsInBlockChaini.length == 0) {
      break;
    }
  }
  //console.log(TransactionsInBlockChain.slice(0, 5));

  TransactionsInBlockChain = TransactionsInBlockChain.filter(
    (x) => x.block_time > blockTime
  );
  //console.log(TransactionsInBlockChain.length);

  TransactionsInBlockChain.forEach((tx) => (tx._id = tx.tx_hash));

  const payedTx = await getRegisteredTx("PayedTxs"); // We fetch our database of payed transaction
  const payedTxHashes = payedTx.map((x) => x._id); // We take only the id that corresponds to the hash

  const TxToPay = TransactionsInBlockChain.filter(function (tx) {
    return !payedTxHashes.includes(tx.tx_hash);
  });

  /*   console.log(TxToPay);
   */
  async function getDoubts() {
    // This functions gets the data payed to the address from the buyer
    let currentDoubts = [];
    try {
      for (let j = 0; j < TxToPay.length; j++) {
        const details = await getTransactionsUTXOs(TxToPay[j].tx_hash);
        const hash = details.hash;
        const senderAddress = details.inputs[0].address;
        const outpusToServer = details.outputs.filter(function (x) {
          return x.address == serverAddress;
        });
        const blockTime = TxToPay[j].block_time;

        const amountPayedtoServer = outpusToServer
          .map((x) => parseInt(x.amount[0].quantity))
          .reduce((x, y) => x + y, 0);
        if (senderAddress !== serverAddress && amountPayedtoServer > 3000000) {
          currentDoubts.push([
            senderAddress,
            amountPayedtoServer,
            hash,
            blockTime,
          ]);
        }
      }
    } catch (e) {
      console.log(e);
    }
    return currentDoubts;
  }

  const transactionsToPay = await getDoubts();
  //console.log(transactionsToPay);
  //return;

  let getDoubtsOuputs = await Promise.all(
    transactionsToPay.map(async (tx) => await classyfyTx(tx))
  );
  getDoubtsOuputs.sort((x, y) => x.blockTime - y.blockTime);
  //console.log(` we must pay this => ${JSON.stringify(getDoubtsOuputs)}`);
  let tokensSold = 0;
  getDoubtsOuputs.forEach((x) => {
    let tokens = x.quantityOfNFTsToSend;
    tokensSold = tokensSold + tokens;
  });
  //console.log(tokensSold);
  const payDoubs = async function payDoubs(Doubts) {
    try {
      for (let j = 0; j < Doubts.length; j++) {
        const tokensqty = Doubts[j].quantityOfNFTsToSend;
        const address = Doubts[j].senderAddress;
        const change = Doubts[j].change;
        const paymentToinverstors = Doubts[j].paymentToinverstors;
        console.log(tokensqty, address, change, paymentToinverstors);

        const hash_ = await sendTokens(
          serverAddress,
          prvKey,
          address,
          tokensqty,
          change,
          policy,
          paymentToinverstors
        );

        if (hash_) {
          await registerTransaction(
            [
              {
                _id: Doubts[j].hash,
                address: address,
                change: change,
                tokensqty: tokensqty,
                change: change,
                tx_hash: hash_,
              },
            ],
            "PayedTxs"
          );
          //console.log(details);

          await sleep(6000); // waiting one minute for confirmation is probably not enought in mainnet but we  check if transaction has not been confirmed outside this fuction
        } else {
          return;
        }
      }
    } catch (e) {
      console.log(e);
    }
  };

  const hash = await payDoubs(getDoubtsOuputs.slice(0, 1)); // better we pay one by one so we can wait until the last transaction gets confirmed in the blockchain before submiting the next
};

async function classyfyTx(Doubt) {
  const whiteListed = await hasRugPull(Doubt[0]);

  let price_;
  let quantityOfNFTsToSend;
  let change;
  let paymentToinverstors = [];

  if (!whiteListed) {
    price_ = pricePeerNFt;
  } else {
    price_ = priceWhitelist;
  }

  const senderAddress = Doubt[0];
  const adarecived = Doubt[1];
  const hash = Doubt[2];
  const blockTime = Doubt[3];

  if (senderAddress == serverAddress) {
    change = 0;
    quantityOfNFTsToSend = 0;

    return { quantityOfNFTsToSend, senderAddress, change, hash };
  }
  if (adarecived <= 3000000) {
    change = 0;
    quantityOfNFTsToSend = 0;
    inversors.forEach((x) =>
      paymentToinverstors.push({ x: x.address, payment: 0 })
    );
    return {
      quantityOfNFTsToSend,
      senderAddress,
      change,
      hash,
      blockTime,
      paymentToinverstors,
    };
  }
  quantityOfNFTsToSend = Math.floor(adarecived / price_);

  const wins = quantityOfNFTsToSend * price_;

  //console.log(quantityOfNFTsToSend, senderAddress);
  change = Math.max(adarecived - quantityOfNFTsToSend * price_ - 500000, 0);

  inversors.forEach((x) =>
    paymentToinverstors.push({ x: x.address, payment: x.percentage * wins })
  );
  /* 
  console.log({
    quantityOfNFTsToSend,
    senderAddress,
    change,
    hash,
    blockTime,
    paymentToinverstors,
  }); */

  return {
    quantityOfNFTsToSend,
    senderAddress,
    change,
    hash,
    blockTime,
    paymentToinverstors,
  };
}

async function getLastTxConfirmation() {
  const lastRegister = await getLastRegisteredTx("PayedTxs");
  console.log(lastRegister);

  if (lastRegister.length > 0) {
    const lastHash = lastRegister[0].tx_hash;
    /*     console.log(lastHash);
     */
    const serverTxs = await blockFrost.addressesTransactions(serverAddress, {
      order: "desc",
    });
    /*   console.log(serverTxs);
    console.log(serverTxs.map((x) => x.tx_hash).slice(0, 20)); */
    const isTxConfirmed = serverTxs.map((x) => x.tx_hash).includes(lastHash);
    return isTxConfirmed;

    //console.log(isTxConfirmed);
  } else {
    return true;
  }

  return isTxConfirmed;
}

//console.log(address);

async function runPeriodically(timetoLoop, blockTime) {
  // how often the loop querys the blockchain in milisecconds and the block_time time at wich it starts looking for payed transactions
  (async () => {
    while (true) {
      await sleep(timetoLoop);
      try {
        console.log("We are checking if last payment was succesfull");

        const lastTxConfirmed = await getLastTxConfirmation();

        if (lastTxConfirmed) {
          console.log(
            "The last submited transaction has been successfully confirmed in the Blockchain"
          );
          console.log(
            "Now We are fetching the Blockchain to see if any payment has arrived..."
          );
          await registerTransactionstoPay(blockTime);
        }
      } catch (e) {
        console.log(e);
      }
    }
  })();
}

runPeriodically(5 * 1000, 1668192683); // 1647894151 checking every 1 minutes seems good , UNIX time for start minitng
