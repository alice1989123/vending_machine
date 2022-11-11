const wallet = require("./Cardano/Wallet/Wallet");
const keys = require("./Cardano/Keys/keys");
//console.log(keys.address);
//console.log(keys.address);
console.log(keys);
const BlockFrost = require("./Cardano/BlockFrost/blockFrost");
/* 
wallet.sendAda(
  keys.address,
  keys.prvKey,
  100*10^6,
  keys()
); */
/* 
wallet.sendAll(
  keys.address,
  keys.prvKey,
  "addr1q88604np2z4hkl9a78dhuxasnssrxzk5kz497yvw4wq7jjp7vt8s8tygau8fl40vg3t7gxdzkq7uxl8sqmaqqkdxca0sg9yp73"
); */

console.log(keys(180).address);
wallet.sendAda(
  keys(178).address,
  keys(178).prvkey,
  100000000,
  keys(180).address
);
