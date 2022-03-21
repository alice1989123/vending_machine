"use strict";
const { sendNFTs, sendAda } = require("./Cardano/Wallet/Wallet");
const blockFrost = require("./Cardano/BlockFrost/blockFrost");
const { pricePeerNFt } = require("./constants");
const fs = require("fs");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

async function selectTokens(policy, address, numberofTokens) {
  //selects number of tokens with policy sitting at an address

  //console.log(hasRugPulls);

  const utxos = await blockFrost.addressesUtxos(address);

  const randomSequence = shuffle(Array.from(Array(utxos.length).keys()));

  const suffledUtxos = randomSequence.map((x) => utxos[x]);

  let amounts = suffledUtxos.map((x) => x.amount);
  let serverTokens = [];
  let filteredAmounts = [];
  amounts.forEach((x) => {
    const filtered = x.filter((x) => x.unit.slice(0, 56) == policy);
    filteredAmounts.push(filtered);
  });
  // console.log(filteredAmounts.length);

  let neededamounts = [];
  let acummulator = 0;
  for (let i = 0; i < filteredAmounts.length; i++) {
    if (acummulator >= numberofTokens) {
      break;
    }
    neededamounts.push(filteredAmounts[i]);

    acummulator = acummulator + filteredAmounts[i].length;
  }
  //console.log(filteredAmounts.length);
  //console.log(neededamounts.length);
  for (let i = 0; i < neededamounts.length; i++) {
    //console.log(amounts[i]);
    serverTokens = [...serverTokens, ...neededamounts[i]];
  }

  const selectedTokens = shuffle(serverTokens).slice(0, numberofTokens);
  const missingTokens = numberofTokens - selectedTokens.length;
  const selectedUTXOs = suffledUtxos.slice(0, neededamounts.length);
  const remainingUTXOs = suffledUtxos.slice(neededamounts.length);

  //console.log(selectedTokens.length);
  return { selectedTokens, selectedUTXOs, remainingUTXOs, missingTokens };
}

async function sendTokens(
  sender,
  prvKeysSender,
  address,
  numberofTokens,
  change,
  policy
) {
  const hasRugPulls = await hasRugPull(address);

  let selectedTokens;
  let missingTokens;
  let selectedUTXOs;
  let remainingUTXOs;

  if (hasRugPulls) {
    console.log("user has RugPull");

    const info = await selectTokens(policy, sender, numberofTokens);

    selectedTokens = info.selectedTokens;
    selectedUTXOs = info.selectedUTXOs;
    remainingUTXOs = info.remainingUTXOs;
    missingTokens = info.missingTokens;
    //console.log(policy, sender, numberofTokens);

    //console.log(sender, tokens);
    //console.log(tokens, change, missingTokens, pricePeerNFt);
    const changAndMissingValue = change + missingTokens * pricePeerNFt; // in case there are no tokens id adds the value of the missing tokens
    /* console.log(
      sender,
      prvKeysSender,
      address,
      selectedTokens,
      selectedUTXOs,
      remainingUTXOs,
      changAndMissingValue
    ); */
    return sendNFTs(
      sender,
      prvKeysSender,
      address,
      selectedTokens,
      selectedUTXOs,
      remainingUTXOs,
      changAndMissingValue
    );
  } else {
    const refund = change + numberofTokens * pricePeerNFt - 300000; // the quit a little amount to cover the fees
    console.log(
      `User does not have Rug Pull, we send this refund ${refund / 1000000} ADA`
    );
    return sendAda(sender, prvKeysSender, refund, address);
  }
}

async function hasRugPull(address) {
  const policyes = fs.readFileSync("./policies").toString().split("\n");

  let stakeAddress;
  //console.log(address.length);
  if (address.length > 70) {
    const address_ = await blockFrost.addresses(address);
    stakeAddress = address_.stake_address;
    //console.log(stakeAddress);
    let totalassets = [];
    for (let i = 0; ; i++) {
      const newassets = await blockFrost.accountsAddressesAssets(stakeAddress, {
        page: i,
      });
      if (newassets.length > 0) {
        totalassets = [...newassets, ...totalassets];
      } else break;
    }
    // console.log(totalassets);
    for (let i = 0; i < totalassets.length; i++) {
      const asset = totalassets[i].unit;
      if (policyes.includes(asset.slice(0, 56))) {
        return true;
      }
    }
    return false;
  }
}

module.exports = { sendTokens, shuffle, sleep, hasRugPull };
/* 
hasRugPull(
  "addr_test1qzexn4e06hhv5cy7wct2xlsshdss3shlvcaef5kedh6zf5mlh3trz5tef0zse9ahv26zs69jrf5h3q0kntwlcldcwv9qwyspfv"
)
  .then((r) => console.log(r))
  .catch((e) => console.log(e)); */
