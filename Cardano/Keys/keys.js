const wasm = require("@emurgo/cardano-serialization-lib-nodejs/cardano_serialization_lib");
const dotenv = require("dotenv").config();

/* const dotenv = require("dotenv").config("../");
 */
const walletKey = process.env.WALLET_KEY;
const network = JSON.parse(process.env.TESTNET)
  ? wasm.NetworkInfo.testnet().network_id()
  : wasm.NetworkInfo.mainnet().network_id();
function harden(num) {
  return 0x80000000 + num;
}
/* const walletKey = wasm.Bip32PrivateKey.generate_ed25519_bip32().to_bech32();
console.log(walletKey); */

const rootKey = wasm.Bip32PrivateKey.from_bech32(walletKey);

const getAddressKey = (i) => {
  const accountKey = rootKey
    .derive(harden(1852)) // purpose
    .derive(harden(1815)) // coin type
    .derive(harden(i)); // account #0

  const utxoPubKey = accountKey
    .derive(0) // external
    .derive(0)
    .to_public();

  const stakeKey = accountKey
    .derive(2) // chimeric
    .derive(0)
    .to_public();

  const baseAddr = wasm.BaseAddress.new(
    network,
    wasm.StakeCredential.from_keyhash(utxoPubKey.to_raw_key().hash()),
    wasm.StakeCredential.from_keyhash(stakeKey.to_raw_key().hash())
  );

  const address = baseAddr.to_address().to_bech32();
  const prvkey = accountKey
    .derive(0) // external
    .derive(0)
    .to_raw_key();
  return { prvkey, address };
};

module.exports = getAddressKey;
//console.log(baseAddr.to_address().to_bech32());
