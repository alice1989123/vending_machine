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

  //console.log(TxToPay);

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
        if (senderAddress !== serverAddress && amountPayedtoServer > 2000000) {
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

  let getDoubtsOuputs = transactionsToPay.map((tx) => classyfyTx(tx));
  getDoubtsOuputs.sort((x, y) => x.blockTime - y.blockTime);
  console.log(` we must pay this => ${JSON.stringify(getDoubtsOuputs)}`);
  const payDoubs = async function payDoubs(Doubts) {
    try {
      for (let j = 0; j < Doubts.length; j++) {
        const tokensqty = Doubts[j].quantityOfNFTsToSend;
        const address = Doubts[j].senderAddress;
        const change = Doubts[j].change;

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

          await sleep(60000); // waiting one minute for confirmation is probably not enought in mainnet but we  check if transaction has not been confirmed outside this fuction
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

function classyfyTx(Doubt) {
  //const hasRugPull = await hasRugPull;
  const senderAddress = Doubt[0];
  const adarecived = Doubt[1];
  const hash = Doubt[2];
  const blockTime = Doubt[3];

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

  return { quantityOfNFTsToSend, senderAddress, change, hash, blockTime };
}

async function getLastTxConfirmation() {
  const lastRegister = await getLastRegisteredTx("PayedTxs");
  //console.log(lastRegister);
  const lastHash = lastRegister[0].tx_hash;
  //console.log(lastHash);

  const serverTxs = await blockFrost.addressesTransactions(serverAddress, {
    order: "desc",
  });
  //console.log(serverTxs);
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

runPeriodically(60 * 1000, 1647867608); // 1647894151 checking every 1 minutes seems good , UNIX time for start minitng
//registerpassedTx();
