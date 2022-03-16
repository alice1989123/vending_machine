"use strict";
const { sleep, sendTokens, hasRugPull } = require("./Utils");
const { pricePeerNFt, maximumNFTs, policy } = require("./constants");
const blockFrost = require("./Cardano/BlockFrost/blockFrost");
const prvKey = require("./Cardano/Keys/keys").prvKey;
const serverAddress = require("./Cardano/Keys/keys").address;

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

const registerpassedTx = async function () {
  const TransactionsInBlockChain = await blockFrost.addressesTransactions(
    serverAddress,
    { order: "desc" }
  );

  console.log(
    TransactionsInBlockChain.forEach((x) => {
      x._id = x.tx_hash;
    })
  );
  console.log(TransactionsInBlockChain);
  const registerPassed = await registerTransaction(
    TransactionsInBlockChain,
    "PayedTxs"
  );
};

const registerTransactionstoPay = async function () {
  const TransactionsInBlockChain = await blockFrost.addressesTransactions(
    serverAddress,
    { order: "desc" }
  );
  //console.log(TransactionsInBlockChain);

  TransactionsInBlockChain.forEach((tx) => (tx._id = tx.tx_hash));

  const payedTx = await getRegisteredTx("PayedTxs"); // We fetch our database of payed transaction
  const payedTxHashes = payedTx.map((x) => x._id); // We take only the id that corresponds to the hash

  const TxToPay = TransactionsInBlockChain.filter(function (tx) {
    return !payedTxHashes.includes(tx.tx_hash);
  });

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

        const amountPayedtoServer = outpusToServer
          .map((x) => parseInt(x.amount[0].quantity))
          .reduce((x, y) => x + y, 0);
        if (senderAddress !== serverAddress && amountPayedtoServer > 2000000) {
          currentDoubts.push([senderAddress, amountPayedtoServer, hash]);
        }
      }
    } catch (e) {
      console.log(e);
    }
    return currentDoubts;
  }

  const transactionsToPay = await getDoubts();

  const getDoubtsOuputs = transactionsToPay.map((tx) => classyfyTx(tx));

  //console.log(getDoubtsOuputs);

  const payDoubs = async function payDoubs() {
    try {
      for (let j = 0; j < getDoubtsOuputs.length; j++) {
        const tokensqty = getDoubtsOuputs[j].quantityOfNFTsToSend;
        const address = getDoubtsOuputs[j].senderAddress;
        const change = getDoubtsOuputs[j].change;

        const hash_ = await sendTokens(
          serverAddress,
          prvKey,
          address,
          tokensqty,
          change,
          policy
        );

        if (hash_) {
          await registerTransaction(
            [
              {
                _id: getDoubtsOuputs[j].hash,
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

          await sleep(60000);
        } else {
          return;
        }
      }
    } catch (e) {
      console.log(e);
    }
  };

  const hashes = await payDoubs();
};

function classyfyTx(Doubt) {
  //const hasRugPull = await hasRugPull;
  const senderAddress = Doubt[0];
  const adarecived = Doubt[1];
  const hash = Doubt[2];

  let quantityOfNFTsToSend;
  let change;
  //console.log(index);
  if (senderAddress == serverAddress) {
    change = 0;
    quantityOfNFTsToSend = 0;
    return { quantityOfNFTsToSend, senderAddress, change, hash };
  }
  quantityOfNFTsToSend = Math.floor(adarecived / pricePeerNFt);
  if (parseInt(adarecived) > pricePeerNFt * maximumNFTs) {
    quantityOfNFTsToSend = maximumNFTs;
  }

  /* if (!hasRugPull) {
    quantityOfNFTsToSend = 0;
  } */

  //console.log(quantityOfNFTsToSend, senderAddress);
  change = Math.max(
    adarecived - quantityOfNFTsToSend * pricePeerNFt - 500000,
    0
  );
  /* console.log(
    adarecived - quantityOfNFTsToSend * pricePeerNFt - 500000,
    change
  ); */

  return { quantityOfNFTsToSend, senderAddress, change, hash };
}

async function getLastTxConfirmation() {
  const lastRegister = await getLastRegisteredTx("PayedTxs");
  //console.log(lastRegister);
  const lastHash = lastRegister[0].tx_hash;
  //console.log(lastHash);

  const serverTxs = await blockFrost.addressesTransactions(serverAddress, {
    order: "desc",
  });
  //console.log(addressToBePayed);
  //console.log(serverTxs.map((x) => x.tx_hash).slice(0, 20));
  const isTxConfirmed = serverTxs.map((x) => x.tx_hash).includes(lastHash);
  //console.log(isTxConfirmed);
  return isTxConfirmed;
}

//console.log(address);

async function getWalletData(addr) {
  try {
    const response = await blockFrost.addressesUtxos(addr);

    return response;
  } catch (e) {
    console.log(e);
  }
}

async function runPeriodically(time) {
  (async () => {
    while (true) {
      await sleep(time);
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
          await registerTransactionstoPay();
        }
      } catch (e) {
        console.log(e);
      }
    }
  })();
}

runPeriodically(10000);
//registerpassedTx();
