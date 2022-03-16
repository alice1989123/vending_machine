const dotenv = require("dotenv").config();
const Blockfrost = require("@blockfrost/blockfrost-js");

const testNet = JSON.parse(process.env.TESTNET);

const Blockfrost_KEY = testNet
  ? process.env.ID_TESTNET
  : process.env.ID_MAINNET;

const API = new Blockfrost.BlockFrostAPI({
  projectId: Blockfrost_KEY,
});

module.exports = API;
