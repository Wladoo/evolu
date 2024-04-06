import * as S from "@effect/schema/Schema";
import { secretbox } from "@noble/ciphers/salsa";
import { concatBytes } from "@noble/ciphers/utils";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { randomBytes } from "@noble/hashes/utils";
import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { customAlphabet, nanoid } from "nanoid";

export class Bip39 extends Context.Tag("Bip39")<
  Bip39,
  {
    readonly make: Effect.Effect<Mnemonic>;

    readonly toSeed: (mnemonic: Mnemonic) => Effect.Effect<Uint8Array>;

    readonly parse: (
      mnemonic: string,
    ) => Effect.Effect<Mnemonic, InvalidMnemonicError>;
  }
>() {}

export interface InvalidMnemonicError {
  readonly _tag: "InvalidMnemonicError";
}

/**
 * Mnemonic is a password generated by Evolu in BIP39 format.
 *
 * A mnemonic, also known as a "seed phrase," is a set of 12 words in a specific
 * order chosen from a predefined list. The purpose of the BIP39 mnemonic is to
 * provide a human-readable way of storing a private key.
 */
export type Mnemonic = string & Brand.Brand<"Mnemonic">;

export class NanoIdGenerator extends Context.Tag("NanoIdGenerator")<
  NanoIdGenerator,
  {
    readonly nanoid: Effect.Effect<NanoId>;
    readonly nanoidAsNodeId: Effect.Effect<NodeId>;
  }
>() {
  static Live = Layer.succeed(
    NanoIdGenerator,
    NanoIdGenerator.of({
      nanoid: Effect.sync(() => nanoid() as NanoId),
      nanoidAsNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),
    }),
  );
}

export type NanoId = string & Brand.Brand<"NanoId">;

export const NodeId = S.string.pipe(
  S.pattern(/^[\w-]{16}$/),
  S.brand("NodeId"),
);
export type NodeId = S.Schema.Type<typeof NodeId>;

const nanoidForNodeId = customAlphabet("0123456789abcdef", 16);

// SLIP-21 implementation
// https://github.com/satoshilabs/slips/blob/master/slip-0021.md
export const slip21Derive = (
  seed: Uint8Array,
  path: ReadonlyArray<string>,
): Effect.Effect<Uint8Array> =>
  Effect.sync(() => {
    let m = hmac(sha512, "Symmetric key seed", seed);
    for (let i = 0; i < path.length; i++) {
      const p = new TextEncoder().encode(path[i]);
      const e = new Uint8Array(p.byteLength + 1);
      e[0] = 0;
      e.set(p, 1);
      m = hmac(sha512, m.slice(0, 32), e);
    }
    return m.slice(32, 64);
  });

/** Alias to xsalsa20poly1305, for compatibility with libsodium/nacl */
export interface SecretBox {
  readonly seal: (
    key: Uint8Array,
    plaintext: Uint8Array,
  ) => Effect.Effect<Uint8Array>;

  readonly open: (
    key: Uint8Array,
    ciphertext: Uint8Array,
  ) => Effect.Effect<Uint8Array>;
}

export const SecretBox = Context.GenericTag<SecretBox>("@services/SecretBox");

export const SecretBoxLive = Layer.succeed(
  SecretBox,
  SecretBox.of({
    seal: (key, plaintext) =>
      Effect.sync(() => {
        const nonce = randomBytes(24);
        const ciphertext = secretbox(key, nonce).seal(plaintext);
        return concatBytes(nonce, ciphertext);
      }),
    open: (key, ciphertext) =>
      Effect.sync(() => {
        const nonce = ciphertext.subarray(0, 24);
        const ciphertextWithoutNonce = ciphertext.subarray(24);
        return secretbox(key, nonce).open(ciphertextWithoutNonce);
      }),
  }),
);
