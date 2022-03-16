const wasm = require("@emurgo/cardano-serialization-lib-nodejs");
const path = require("path");
require("dotenv").config({ path: __dirname + "/../../.env" });
const keys = require("../Keys/keys");
const blockFrost = require("../BlockFrost/blockFrost");
//require("dotenv").config({ path: require("find-config")(".env") });
//console.log(__dirname + "/../");

async function getProtocolParams() {
  try {
    const latest_block = await blockFrost.blocksLatest();
    const p = await blockFrost.epochsParameters(latest_block.epoch);
    return {
      linearFee: {
        minFeeA: p.min_fee_a.toString(),
        minFeeB: p.min_fee_b.toString(),
      },
      minUtxo: "1000000", //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: p.pool_deposit,
      keyDeposit: p.key_deposit,
      coinsPerUtxoWord: "34482",
      maxValSize: 5000,
      priceMem: 5.77e-2,
      priceStep: 7.21e-5,
      maxTxSize: p.max_tx_size,
      slot: latest_block.slot,
    };
  } catch (e) {
    console.log(e);
  }
}

function InitTx(protocolParameters) {
  let tbcb = wasm.TransactionBuilderConfigBuilder.new();
  tbcb = tbcb.fee_algo(
    wasm.LinearFee.new(
      wasm.BigNum.from_str(protocolParameters.linearFee.minFeeA),
      wasm.BigNum.from_str(protocolParameters.linearFee.minFeeB)
    )
  );
  tbcb = tbcb.pool_deposit(
    wasm.BigNum.from_str(protocolParameters.poolDeposit)
  );
  tbcb = tbcb.key_deposit(wasm.BigNum.from_str(protocolParameters.keyDeposit));
  tbcb = tbcb.max_value_size(protocolParameters.maxValSize);
  tbcb = tbcb.max_tx_size(protocolParameters.maxTxSize);
  tbcb = tbcb.coins_per_utxo_word(
    wasm.BigNum.from_str(protocolParameters.coinsPerUtxoWord)
  );

  const tbc = tbcb.build();
  txBuilder = wasm.TransactionBuilder.new(tbc);
  return txBuilder;
}

async function SignAndSend(tx, prvKeysSender) {
  try {
    const txHash = wasm.hash_transaction(tx.body());
    const witnesses = tx.witness_set();

    const vkeysWitnesses = wasm.Vkeywitnesses.new();
    //console.log(prvKeysSender);

    const vkeyWitness = wasm.make_vkey_witness(txHash, prvKeysSender);
    vkeysWitnesses.add(vkeyWitness);
    witnesses.set_vkeys(vkeysWitnesses);
    const transaction = wasm.Transaction.new(
      tx.body(),
      witnesses,
      tx.auxiliary_data() // transaction metadata
    );

    try {
      const CBORTx = Buffer.from(transaction.to_bytes(), "hex").toString("hex");
      const submitionHash = await blockFrost.txSubmit(CBORTx);
      console.log(`tx Submited with hash ===> ${submitionHash}`);
      return submitionHash;
    } catch (e) {
      console.log(e);
    }
  } catch (error) {
    console.log(error);
    return { error: error.info || error.toString() };
  }
}

async function sendAda(senderAddress, senderprvKeys, lovelaces, address) {
  const reciverAddress = wasm.Address.from_bech32(address);
  const wasmSender = wasm.Address.from_bech32(senderAddress);

  const outPutValue = wasm.Value.new(wasm.BigNum.from_str(`${lovelaces}`));

  const protocolParameters = await getProtocolParams();

  const output = wasm.TransactionOutput.new(reciverAddress, outPutValue);

  const txBuilder = InitTx(protocolParameters);
  txBuilder.add_output(output);
  const utoxs_ = await getUtxos(senderAddress);
  const utxos = wasm.TransactionUnspentOutputs.new();
  utoxs_.forEach((utxo) => utxos.add(utxo));
  txBuilder.add_inputs_from(utxos, 1);
  txBuilder.add_change_if_needed(wasmSender);
  const txBody = txBuilder.build();
  const tx = wasm.Transaction.new(txBody, wasm.TransactionWitnessSet.new());
  const hash = await SignAndSend(tx, senderprvKeys);
  return hash;
}

async function sendNFTs(
  sender,
  prvKeysSender,
  address,
  NFTamount,
  selectedUTXOs,
  remainingUTXOs,
  change
) {
  //console.log(sender, prvKeysSender, address, NFTamount, change);
  const protocolParameters = await getProtocolParams();
  const wasmchange = wasm.Value.new(wasm.BigNum.from_str(`${change}`));
  const NFTvalue = amountToValue(NFTamount);

  let NFTminvalue;
  let totalValue;
  if (NFTamount.length != 0) {
    NFTminvalue = wasm.Value.new(
      wasm.min_ada_required(
        NFTvalue,
        false,
        wasm.BigNum.from_str(protocolParameters.coinsPerUtxoWord)
      )
    );
  } else {
    NFTminvalue = wasm.Value.new(wasm.BigNum.from_str("0"));
  }

  totalValue = NFTminvalue.checked_add(wasmchange).checked_add(NFTvalue);

  const reciverAddress = wasm.Address.from_bech32(address);

  txBuilder = InitTx(protocolParameters);

  //const utxos_ = await getUtxos(sender);
  //console.log(selectedUTXOs, remainingUTXOs);
  //console.log(remainingUTXOs);
  let remainUTXOsSOrted = remainingUTXOs.sort(
    // We sort for not  merging utxos that are already big in size because otf transaction size limitations
    (a, b) => a.amount.length - b.amount.length
  );
  //console.log(remainUTXOsSOrted.map((x) => x.amount.length));
  let mergedSelectedAmounts = [];
  selectedUTXOs.forEach(
    (x) => (mergedSelectedAmounts = [...mergedSelectedAmounts, ...x.amount])
  );

  const interesection = mergedSelectedAmounts
    .map((x) => JSON.stringify(x))
    .filter((y) => NFTamount.map((z) => JSON.stringify(z)).includes(y));
  console.log(`we are sending this tokens!! :D ==> ${interesection}`);
  /* console.log(
    NFTamount.map((x) => JSON.stringify(x)),
    mergedSelectedAmounts.map((x) => JSON.stringify(x)),
    interesection
  ); */

  /*  console.log(mergedSelectedAmounts, `interesection = ${interesection}`);

  console.log(
    selectedUTXOs.map((x) => x.amount),
    NFTamount
  ); */
  const utoxsNFTs = utxosBloqtoWasm(selectedUTXOs);
  const remainingUtxos = utxosBloqtoWasm(remainUTXOsSOrted);

  //console.log(utoxsNFTs.length, remainingUtxos.length);

  const maxFee = wasm.Value.new(wasm.BigNum.from_str("1000000")); // 2 ADA of fee is a lot but is just for the coinselection

  function satisfaction(utxos) {
    //this Function is positive if the merged aoutput has enoguth ada left to cover the ada amputn needed to split the nft
    const amounts = utxos.map((x) => x.output().amount());
    let splitedAmount = wasm.Value.new(wasm.BigNum.from_str("0"));
    amounts.forEach((x) => (splitedAmount = splitedAmount.checked_add(x)));
    /*     console.log(utxos, splitedAmount.coin().to_str());
     */

    if (
      parseInt(splitedAmount.coin().to_str()) >=
      parseInt(totalValue.checked_add(maxFee).coin().to_str())
    ) {
      /* console.log("hey"); */
      amountDiscountingNFTandFee = splitedAmount
        .checked_sub(totalValue)
        .checked_sub(maxFee);
      //console.log(amountDiscountingNFTandFee);
      coinsRequired = wasm.Value.new(
        wasm.min_ada_required(
          splitedAmount,
          false,
          wasm.BigNum.from_str(protocolParameters.coinsPerUtxoWord)
        )
      )
        .checked_add(maxFee)
        .checked_add(totalValue);
      const satisfaction =
        parseInt(splitedAmount.coin().to_str()) -
        parseInt(coinsRequired.coin().to_str());
      /*  console.log(coinsRequired.coin().to_str(), splitedAmount.coin().to_str());
    console.log(satisfaction); */
      return satisfaction;
    } else return -1;
  }
  /*   console.log(utoxsNFTs[0].output().amount().coin().to_str());
   */
  let utxosNeededToSatisface = utoxsNFTs;

  for (let i = 0; i < remainingUtxos.length; i++) {
    if (parseInt(satisfaction(utxosNeededToSatisface)) > 0) {
      break;
    }
    utxosNeededToSatisface.push(remainingUtxos[i]);
  }

  //console.log(utxosNeededToSatisface);

  const utxos = wasm.TransactionUnspentOutputs.new();
  utxosNeededToSatisface.forEach((utxo) => utxos.add(utxo));
  //console.log(ServerAddress);

  //console.log(value.coin().to_str());
  const outPutNFTvalue = wasm.TransactionOutput.new(reciverAddress, totalValue);

  const outputs = wasm.TransactionOutputs.new();
  //console.log(outputs);
  //console.log(outPutNFTvalue.amount().coin().to_str());
  outputs.add(outPutNFTvalue);

  txBuilder.add_output(outPutNFTvalue);

  utxosNeededToSatisface.forEach((utxo) =>
    txBuilder.add_input(
      utxo.output().address(),
      utxo.input(),
      utxo.output().amount()
    )
  );

  //txBuilder.add_inputs_from(utxos, 2);

  //txBuilder.set_fee(wasm.BigNum.from_str("0"));
  //console.log("hey");
  txBuilder.add_change_if_needed(wasm.Address.from_bech32(sender));

  const txBody = txBuilder.build();

  const tx = wasm.Transaction.new(txBody, wasm.TransactionWitnessSet.new());

  //console.log(inputs);

  const hash = await SignAndSend(tx, prvKeysSender);
  return hash;
}

const amountToValue = (assets) => {
  const multiAsset = wasm.MultiAsset.new();
  //console.log(assets);
  const lovelace = assets.find((asset) => asset.unit === "lovelace");
  const policies = [
    ...new Set(
      assets
        .filter((asset) => asset.unit !== "lovelace")
        .map((asset) => asset.unit.slice(0, 56))
    ),
  ];
  //console.log(policies);
  policies.forEach((policy) => {
    const policyAssets = assets.filter(
      (asset) => asset.unit.slice(0, 56) === policy
    );
    const assetsValue = wasm.Assets.new();
    policyAssets.forEach((asset) => {
      assetsValue.insert(
        wasm.AssetName.new(Buffer.from(asset.unit.slice(56), "hex")),
        wasm.BigNum.from_str(asset.quantity)
      );
    });
    multiAsset.insert(
      wasm.ScriptHash.from_bytes(Buffer.from(policy, "hex")),
      assetsValue
    );
  });
  const value = wasm.Value.new(
    wasm.BigNum.from_str(lovelace ? lovelace.quantity : "0")
  );
  if (assets.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
};

function utxosBloqtoWasm(utxos_) {
  let utxos = [];

  utxos_.forEach((element) => {
    const value = amountToValue(element.amount);

    const input = wasm.TransactionInput.new(
      wasm.TransactionHash.from_bytes(Buffer.from(element.tx_hash, "hex")),
      element.tx_index
    );

    const output = wasm.TransactionOutput.new(
      wasm.Address.from_bech32(keys.address),
      value
    );

    const utxo = wasm.TransactionUnspentOutput.new(input, output);
    utxos.push(utxo);
  });
  return utxos;
}

async function getUtxos(addr) {
  const response = await blockFrost.addressesUtxos(addr);
  let utxos = [];

  response.forEach((element) => {
    const value = amountToValue(element.amount);

    const input = wasm.TransactionInput.new(
      wasm.TransactionHash.from_bytes(Buffer.from(element.tx_hash, "hex")),
      element.tx_index
    );

    const output = wasm.TransactionOutput.new(
      wasm.Address.from_bech32(addr),
      value
    );

    const utxo = wasm.TransactionUnspentOutput.new(input, output);
    utxos.push(utxo);
  });
  return utxos;
}

module.exports = { sendNFTs: sendNFTs, sendAda: sendAda };

//getProtocolParams().then((r) => console.log(r));

/* sendNFTs(
  "addr_test1qzpw3qd6l3xyu6l46d6rgrp4emq5x68g589029z2ty3crgk7edsdfc2n5rhvl2hmn498cwd67803mm9u2ktxcgjhj9msavfpz0",
  keys.prvKey,
  "addr_test1qqg5yaufhdv5tud477lrsa9lhq8xz47hcwfaw0vy6h0f9y6th6n0dly9ajn06dm74cmvemv8zgkuk4erhxx9y0779casm8kpm5",
  [
    {
      unit: "1641380123d89ed507a4a9a4646cea9a6f4e1ce2f1318b4f1da17261",
      quantity: `1`,
    },
  ],
  0
);
 */
