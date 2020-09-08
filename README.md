[Github](https://github.com/LedgerHQ/ledgerjs/),
[Ledger Devs Slack](https://ledger-dev.slack.com/)

## @obsidiansystems/hw-app-avalanche

[Ledger Hardware Wallet](https://www.ledger.com/) JavaScript bindings for [Avalanche](https://www.avalabs.org/), based on [LedgerJS](https://github.com/LedgerHQ/ledgerjs).

## Using LedgerJS for Avalanche

Here is a sample app for Node:

```javascript
const Transport = require("@ledgerhq/hw-transport-node-hid").default;
const Avalanche = require("@obsidiansystems/hw-app-avalanche").default;

const getWalletId = async () => {
  const avalanche = new Avalanche(await Transport.create());
  return await avalanche.getWalletId();
};

const signHash = async () => {
  const transport = await Transport.create();
  const avalanche = new Avalanche(await Transport.create());
  return await avalanche.signHash(
    "44'/9000'/0'/0/0",
    "0000000000000000000000000000000000000000000000000000000000000000"
  );
};

const getVersion = async () => {
  const avalanche = new Avalanche(await Transport.create());
  return await avalanche.getAppConfiguration();
};

const getAddress = async () => {
  const avalanche = new Avalanche(await Transport.create());
  return await avalanche.getWalletPublicKey("44'/9000'/0'/1/0");
};

const doAll = async () => {
  console.log(await getWalletId());
  console.log(await getVersion());
  console.log(await getAddress());
  console.log(await signHash());
};

doAll().catch(err => console.log(err));
```

## API

#### Table of Contents

-   [Avalanche](#avalanche)
    -   [Parameters](#parameters)
    -   [Examples](#examples)
    -   [getWalletPublicKey](#getwalletpublickey)
        -   [Parameters](#parameters-1)
        -   [Examples](#examples-1)
    -   [signTransaction](#signtransaction)
        -   [Parameters](#parameters-2)
        -   [Examples](#examples-2)
    -   [getAppConfiguration](#getappconfiguration)
        -   [Examples](#examples-3)
    -   [getWalletId](#getwalletid)
        -   [Examples](#examples-4)

### Avalanche

Avalanche API for Ledger

#### Parameters

-   `transport` **`Transport<any>`**
-   `scrambleKey` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)**  (optional, default `"Avalanche"`)

#### Examples

```javascript
import Avalanche from "@obsidiansystems/hw-app-avalanche";
const avalanche = new Avalanche(transport);
```

#### getWalletPublicKey

Get Avalanche address for a given BIP-32 path.

##### Parameters

-   `path` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** a path in BIP-32 format

##### Examples

```javascript
const publicKey = await avalanche.getWalletPublicKey("44'/9000'/0'/0/0");
```

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)>** an object with a public key.

#### signHash

Sign a 32-byte hash of transaction with a given BIP-32 path

##### Parameters

-   `path` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** a path in BIP-32 format
-   `hash` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** hash of a to sign

##### Examples

```javascript
const signature = await avalanche.signHash("44'/9000'/0'/0/0", "0000000000000000000000000000000000000000000000000000000000000000");
```

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)>** a signature as hex string.

#### getAppConfiguration

Get the version of the application installed on the hardware device.

##### Examples

```javascript
console.log(await avalanche.getAppConfiguration());
```

produces something like

```
{
  "version": "1.0.3",
  "commit": "1234567",
  "name": "Avax"
}
```

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;{version: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String), commit: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String), name: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)}>** an object with a version.

#### getWalletId

Get the wallet identifier for the Ledger wallet. This value distinguishes different Ledger hardware devices which have different seeds.

##### Examples

```javascript
console.log(await avalanche.getWalletId());
```
produces something like

```
abcdefgh
```

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)&lt;[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)>** a byte string.
