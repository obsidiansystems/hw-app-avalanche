//@flow

import type Transport from "@ledgerhq/hw-transport";
import BIPPath from "bip32-path";
import createHash from 'create-hash';

/**
 * Avalanche API
 *
 * @example
 * import Avalanche from "@obsidiansystems/hw-app-avalanche";
 * const avalanche = new Avalanche(transport);
 */
export default class Avalanche {
  transport: Transport<*>;
  logger: (msg: string) => undefined;

  CLA = 0x80;
  MAX_APDU_SIZE = 230;
  MAX_HRP_LENGTH = 24;

  INS_VERSION = 0x00;
  INS_GET_WALLET_ID = 0x01;
  INS_PROMPT_PUBLIC_KEY = 0x02;
  INS_PROMPT_EXT_PUBLIC_KEY = 0x03;
  INS_SIGN_HASH = 0x04;
  INS_SIGN_TRANSACTION = 0x05;

  constructor(
    transport: Transport<*>,
    scrambleKey: string = "Avalanche",
    logger: (msg: string) => undefined = console.error,
  ) {
    this.transport = transport;
    this.logger = logger;
    if (scrambleKey) {
      transport.decorateAppAPIMethods(
        this,
        [
          "getAppConfiguration",
          "getWalletAddress",
          "getWalletExtendedPublicKey",
          "getWalletId",
          "signHash",
          "signTransaction",
        ],
        scrambleKey
      );
    }
  }

  /**
   * get Avalanche address for a given BIP-32 path.
   *
   * @param derivation_path a path in BIP 32 format
   * @return a buffer with a public key, and TODO: should be address, not public key
   * @example
   * await avalanche.getWalletPublicKey("44'/9000'/0'/0/0");
   */
  async getWalletAddress(derivation_path: string, hrp = ""): Promise<Buffer> {
    if (hrp.length > this.MAX_HRP_LENGTH) {
      throw "Maximum Bech32 'human readable part' length exceeded";
    }

    const cla = this.CLA;
    const ins = this.INS_PROMPT_PUBLIC_KEY;
    const p1 = hrp.length;
    const p2 = 0x00;
    const data = Buffer.concat([
      Buffer.from(hrp, "latin1"),
      this.encodeBip32Path(BIPPath.fromString(derivation_path)),
    ]);

    const response = await this.transport.send(cla, ins, p1, p2, data);
    return response.slice(0, -2);
  }

  /**
   * get extended public key for a given BIP-32 path.
   *
   * @param derivation_path a path in BIP-32 format
   * @return an object with a buffer for the public key data and a buffer for the chain code
   * @example
   * await avalanche.getWalletExtendedPublicKey("44'/9000'/0'/0/0");
   */
  async getWalletExtendedPublicKey(derivation_path: string): Promise<{
    public_key: Buffer,
    chain_code: Buffer,
  }> {
    const cla = this.CLA;
    const ins = this.INS_PROMPT_EXT_PUBLIC_KEY;
    const p1 = 0x00;
    const p2 = 0x00;
    const data: Buffer = this.encodeBip32Path(BIPPath.fromString(derivation_path));

    const response = await this.transport.send(cla, ins, p1, p2, data);
    const publicKeyLength = response[0];
    const chainCodeOffset = 2+publicKeyLength;
    const chainCodeLength = response[1 + publicKeyLength];
    return {
      public_key: response.slice(1, 1 + publicKeyLength),
      chain_code: response.slice(chainCodeOffset, chainCodeOffset + chainCodeLength),
    };
  }

  /**
   * Sign a hash with a given set of BIP-32 paths.
   *
   * @param derivationPathPrefix a BIP-32 path that will act as the prefix to all other signing paths.
   * @param derivationPathSuffixes an array of BIP-32 path suffixes that will be
   *                               appended to the prefix to form the final path for signing.
   * @param hash 32-byte buffer containing the hash to sign
   * @return a map of path suffixes (as strings) to signature buffers
   * @example
   * const signatures = await avalanche.signHash(
   *   BIPPath.fromString("44'/9000'/0'"),
   *   [BIPPath.fromString("0/0")],
   *   Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"));
   */
  async signHash(
    derivationPathPrefix: BIPPath,
    derivationPathSuffixes: Array<BIPPath>,
    hash: Buffer,
  ): Promise<Map<string, Buffer>> {
    if (hash.length != 32) {
      throw "Hash buffer must be 32 bytes";
    }

    const firstMessage: Buffer = Buffer.concat([
      this.uInt8Buffer(derivationPathSuffixes.length),
      hash,
      this.encodeBip32Path(derivationPathPrefix)
    ]);
    const responseHash = await this.transport.send(this.CLA, this.INS_SIGN_HASH, 0x00, 0x00, firstMessage);
    if (!responseHash.slice(0, 32).equals(hash)) {
      throw "Ledger reported a hash that does not match the input hash!";
    }

    return this._collectSignaturesFromSuffixes(derivationPathSuffixes, this.INS_SIGN_HASH, 0x01, 0x81);
  }

  /**
   * Sign a transaction with a given set of BIP-32 paths.
   *
   * @param derivationPathPrefix a BIP-32 path that will act as the prefix to all other signing paths.
   * @param derivationPathSuffixes an array of BIP-32 path suffixes that will be
   *                               appended to the prefix to form the final path for signing.
   * @param txn binary of the transaction
   * @return an object with a hash of the transaction and a map of path suffixes (as strings) to signature buffers
   * @example
   * const signatures = await avalanche.signTransaction(
   *   BIPPath.fromString("44'/9000'/0'"),
   *   [BIPPath.fromString("0/0")],
   *   Buffer.from("...", "hex"),
   *   BIPPath.fromString("44'/9000'/0'/0'/0'"));
   * );
   */
  async signTransaction(
    derivationPathPrefix: BIPPath,
    derivationPathSuffixes: Array<BIPPath>,
    txn: Buffer,
    changePath: ?BIPPath
  ): Promise<{hash: Buffer, signatures: Map<string, Buffer>}> {

    const SIGN_TRANSACTION_SECTION_PREAMBLE            = 0x00;
    const SIGN_TRANSACTION_SECTION_PAYLOAD_CHUNK       = 0x01;
    const SIGN_TRANSACTION_SECTION_PAYLOAD_CHUNK_LAST  = 0x81;
    const SIGN_TRANSACTION_SECTION_SIGN_WITH_PATH      = 0x02;
    const SIGN_TRANSACTION_SECTION_SIGN_WITH_PATH_LAST = 0x82;

    const preamble = Buffer.concat([
      this.uInt8Buffer(derivationPathSuffixes.length),
      this.encodeBip32Path(derivationPathPrefix)
    ]);
    if (changePath != null) {
      const preamble_ = Buffer.concat([
        preamble,
        this.encodeBip32Path(changePath)
      ]);
      await this.transport.send(this.CLA, this.INS_SIGN_TRANSACTION, SIGN_TRANSACTION_SECTION_PREAMBLE, 0x01, preamble_);
    } else {
      await this.transport.send(this.CLA, this.INS_SIGN_TRANSACTION, SIGN_TRANSACTION_SECTION_PREAMBLE, 0x00, preamble);
    }

    let remainingData = txn.slice(0); // copy
    let response;
    while (remainingData.length > 0) {
      const thisChunk = remainingData.slice(0, this.MAX_APDU_SIZE);
      remainingData = remainingData.slice(this.MAX_APDU_SIZE);
      response = await this.transport.send(
        this.CLA,
        this.INS_SIGN_TRANSACTION,
        remainingData.length > 0
          ? SIGN_TRANSACTION_SECTION_PAYLOAD_CHUNK
          : SIGN_TRANSACTION_SECTION_PAYLOAD_CHUNK_LAST,
        0x00,
        thisChunk,
      );
    }

    const responseHash = response.slice(0, 32);
    const expectedHash = Buffer.from(createHash('sha256').update(txn).digest());
    if (!responseHash.equals(expectedHash)) {
      throw "Ledger reported a hash that does not match the expected transaction hash!";
    }

    return {
      hash: responseHash,
      signatures: await this._collectSignaturesFromSuffixes(
        derivationPathSuffixes,
        this.INS_SIGN_TRANSACTION,
        SIGN_TRANSACTION_SECTION_SIGN_WITH_PATH,
        SIGN_TRANSACTION_SECTION_SIGN_WITH_PATH_LAST,
      )
    };
  }

  /**
   * Get the version of the Avalanche app installed on the hardware device
   *
   * @return an object with a version
   * @example
   * console.log(await avalanche.getAppConfiguration());
   *
   * {
   *   "version": "1.0.3",
   *   "commit": "abcdcefg"
   *   "name": "Avalanche"
   * }
   */
  async getAppConfiguration(): Promise<{
    version: string,
    commit: string,
    name: string,
  }> {
    const data: Buffer = await this.transport.send(this.CLA, this.INS_VERSION, 0x00, 0x00);

    const eatNBytes = function(input, n) {
      const out = input.slice(0, n);
      return [out, input.slice(n)];
    };

    const eatWhile = function(input, f) {
      for (var i = 0; i < input.length; i++) {
        if (!f(input[i])) {
          return [input.slice(0, i), input.slice(i)];
        }
      }
      return [input, ""];
    };

    const [versionData, rest1] = eatNBytes(data, 3);
    const [commitData, rest2] = eatWhile(rest1, c => c != 0);
    const [nameData, rest3] = eatWhile(rest2.slice(1), c => c != 0);
    if (rest3.toString("hex") != "009000") {
      this.logger("WARNING: Response data does not exactly match expected format for VERSION instruction");
    }

    return {
      version: "" + versionData[0] + "." + versionData[1] + "." + versionData[2],
      commit: commitData.toString("latin1"),
      name: nameData.toString("latin1")
    };
  }

  /**
   * Get the wallet identifier for the Ledger wallet
   *
   * @return a byte string
   * @example
   * console.log((await avalanche.getWalletId()).toString("hex"));
   *
   * 79c46bc3
   */
  async getWalletId(): Promise<Buffer> {
    const result = await this.transport.send(this.CLA, this.INS_GET_WALLET_ID, 0x00, 0x00);
    return result.slice(0, -2);
  }

  async _collectSignaturesFromSuffixes(suffixes: Array<BIPPath>, ins: int, p1NotDone: int, p1Done: int) {
    let resultMap: Map<string, Buffer> = new Map();
    for (let ix = 0; ix < suffixes.length; ix++) {
      const suffix = suffixes[ix];
      this.logger("Signing with " + suffix.toString(true));
      const message: Buffer = this.encodeBip32Path(suffix);
      const isLastMessage: Boolean = ix >= suffixes.length - 1;
      const signatureData = await this.transport.send(this.CLA, ins, isLastMessage ? p1Done : p1NotDone, 0x00, message);
      resultMap.set(suffix.toString(true), signatureData.slice(0, -2));
    };
    return resultMap;
  }

  uInt8Buffer(uint8: int): Buffer {
    let buff = Buffer.alloc(1);
    buff.writeUInt8(uint8);
    return buff;
  }

  uInt32BEBuffer(uint32: int): Buffer {
    let buff = Buffer.alloc(4);
    buff.writeUInt32BE(uint32);
    return buff;
  }

  encodeBip32Path(path: BIPPath): Buffer {
    const pathArr = path.toPathArray();
    return Buffer.concat([this.uInt8Buffer(pathArr.length)].concat(pathArr.map(this.uInt32BEBuffer)));
  }
}
