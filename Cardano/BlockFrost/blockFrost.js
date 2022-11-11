const dotenv = require("dotenv").config();
const Blockfrost = require("@blockfrost/blockfrost-js");

const testNet = JSON.parse(process.env.TESTNET);

const ID_MAINNET = process.env.ID_MAINNET;
const ID_TESTNET = process.env.ID_TESTNET;

const Blockfrost_KEY = testNet ? ID_TESTNET : ID_MAINNET;
const API = new Blockfrost.BlockFrostAPI({
  isTestnet: testNet,
  projectId: Blockfrost_KEY,
  network: testNet ? "preprod" : "mainnet",
});

module.exports = API;
