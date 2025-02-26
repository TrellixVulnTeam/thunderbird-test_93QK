"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WITHHELD_MESSAGES = exports.OlmDevice = void 0;

var _logger = require("../logger");

var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");

var algorithms = _interopRequireWildcard(require("./algorithms"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// The maximum size of an event is 65K, and we base64 the content, so this is a
// reasonable approximation to the biggest plaintext we can encrypt.
const MAX_PLAINTEXT_LENGTH = 65536 * 3 / 4;

function checkPayloadLength(payloadString) {
  if (payloadString === undefined) {
    throw new Error("payloadString undefined");
  }

  if (payloadString.length > MAX_PLAINTEXT_LENGTH) {
    // might as well fail early here rather than letting the olm library throw
    // a cryptic memory allocation error.
    //
    // Note that even if we manage to do the encryption, the message send may fail,
    // because by the time we've wrapped the ciphertext in the event object, it may
    // exceed 65K. But at least we won't just fail with "abort()" in that case.
    const err = new Error("Message too long (" + payloadString.length + " bytes). " + "The maximum for an encrypted message is " + MAX_PLAINTEXT_LENGTH + " bytes."); // TODO: [TypeScript] We should have our own error types

    err["data"] = {
      errcode: "M_TOO_LARGE",
      error: "Payload too large for encrypted message"
    };
    throw err;
  }
}
/**
 * The type of object we use for importing and exporting megolm session data.
 *
 * @typedef {Object} module:crypto/OlmDevice.MegolmSessionData
 * @property {String} sender_key  Sender's Curve25519 device key
 * @property {String[]} forwarding_curve25519_key_chain Devices which forwarded
 *     this session to us (normally empty).
 * @property {Object<string, string>} sender_claimed_keys Other keys the sender claims.
 * @property {String} room_id     Room this session is used in
 * @property {String} session_id  Unique id for the session
 * @property {String} session_key Base64'ed key data
 */


/* eslint-enable camelcase */

/**
 * Manages the olm cryptography functions. Each OlmDevice has a single
 * OlmAccount and a number of OlmSessions.
 *
 * Accounts and sessions are kept pickled in the cryptoStore.
 *
 * @constructor
 * @alias module:crypto/OlmDevice
 *
 * @param {Object} cryptoStore A store for crypto data
 *
 * @property {string} deviceCurve25519Key   Curve25519 key for the account
 * @property {string} deviceEd25519Key      Ed25519 key for the account
 */
class OlmDevice {
  // set by consumers
  // don't know these until we load the account from storage in init()
  // we don't bother stashing outboundgroupsessions in the cryptoStore -
  // instead we keep them here.
  // Store a set of decrypted message indexes for each group session.
  // This partially mitigates a replay attack where a MITM resends a group
  // message into the room.
  //
  // When we decrypt a message and the message index matches a previously
  // decrypted message, one possible cause of that is that we are decrypting
  // the same event, and may not indicate an actual replay attack.  For
  // example, this could happen if we receive events, forget about them, and
  // then re-fetch them when we backfill.  So we store the event ID and
  // timestamp corresponding to each message index when we first decrypt it,
  // and compare these against the event ID and timestamp every time we use
  // that same index.  If they match, then we're probably decrypting the same
  // event and we don't consider it a replay attack.
  //
  // Keys are strings of form "<senderKey>|<session_id>|<message_index>"
  // Values are objects of the form "{id: <event id>, timestamp: <ts>}"
  // Keep track of sessions that we're starting, so that we don't start
  // multiple sessions for the same device at the same time.
  // set by consumers
  // Used by olm to serialise prekey message decryptions
  // set by consumers
  constructor(cryptoStore) {
    this.cryptoStore = cryptoStore;

    _defineProperty(this, "pickleKey", "DEFAULT_KEY");

    _defineProperty(this, "deviceCurve25519Key", null);

    _defineProperty(this, "deviceEd25519Key", null);

    _defineProperty(this, "maxOneTimeKeys", null);

    _defineProperty(this, "outboundGroupSessionStore", {});

    _defineProperty(this, "inboundGroupSessionMessageIndexes", {});

    _defineProperty(this, "sessionsInProgress", {});

    _defineProperty(this, "olmPrekeyPromise", Promise.resolve());
  }
  /**
   * @return {array} The version of Olm.
   */


  static getOlmVersion() {
    return global.Olm.get_library_version();
  }
  /**
   * Initialise the OlmAccount. This must be called before any other operations
   * on the OlmDevice.
   *
   * Data from an exported Olm device can be provided
   * in order to re-create this device.
   *
   * Attempts to load the OlmAccount from the crypto store, or creates one if none is
   * found.
   *
   * Reads the device keys from the OlmAccount object.
   *
   * @param {object} opts
   * @param {object} opts.fromExportedDevice (Optional) data from exported device
   *     that must be re-created.
   *     If present, opts.pickleKey is ignored
   *     (exported data already provides a pickle key)
   * @param {object} opts.pickleKey (Optional) pickle key to set instead of default one
   */


  async init({
    pickleKey,
    fromExportedDevice
  } = {}) {
    let e2eKeys;
    const account = new global.Olm.Account();

    try {
      if (fromExportedDevice) {
        if (pickleKey) {
          _logger.logger.warn('ignoring opts.pickleKey' + ' because opts.fromExportedDevice is present.');
        }

        this.pickleKey = fromExportedDevice.pickleKey;
        await this.initialiseFromExportedDevice(fromExportedDevice, account);
      } else {
        if (pickleKey) {
          this.pickleKey = pickleKey;
        }

        await this.initialiseAccount(account);
      }

      e2eKeys = JSON.parse(account.identity_keys());
      this.maxOneTimeKeys = account.max_number_of_one_time_keys();
    } finally {
      account.free();
    }

    this.deviceCurve25519Key = e2eKeys.curve25519;
    this.deviceEd25519Key = e2eKeys.ed25519;
  }
  /**
   * Populates the crypto store using data that was exported from an existing device.
   * Note that for now only the “account” and “sessions” stores are populated;
   * Other stores will be as with a new device.
   *
   * @param {IExportedDevice} exportedData Data exported from another device
   *     through the “export” method.
   * @param {Olm.Account} account an olm account to initialize
   */


  async initialiseFromExportedDevice(exportedData, account) {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.cryptoStore.storeAccount(txn, exportedData.pickledAccount);
      exportedData.sessions.forEach(session => {
        const {
          deviceKey,
          sessionId
        } = session;
        const sessionInfo = {
          session: session.session,
          lastReceivedMessageTs: session.lastReceivedMessageTs
        };
        this.cryptoStore.storeEndToEndSession(deviceKey, sessionId, sessionInfo, txn);
      });
    });
    account.unpickle(this.pickleKey, exportedData.pickledAccount);
  }

  async initialiseAccount(account) {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.cryptoStore.getAccount(txn, pickledAccount => {
        if (pickledAccount !== null) {
          account.unpickle(this.pickleKey, pickledAccount);
        } else {
          account.create();
          pickledAccount = account.pickle(this.pickleKey);
          this.cryptoStore.storeAccount(txn, pickledAccount);
        }
      });
    });
  }
  /**
   * extract our OlmAccount from the crypto store and call the given function
   * with the account object
   * The `account` object is usable only within the callback passed to this
   * function and will be freed as soon the callback returns. It is *not*
   * usable for the rest of the lifetime of the transaction.
   * This function requires a live transaction object from cryptoStore.doTxn()
   * and therefore may only be called in a doTxn() callback.
   *
   * @param {*} txn Opaque transaction object from cryptoStore.doTxn()
   * @param {function} func
   * @private
   */


  getAccount(txn, func) {
    this.cryptoStore.getAccount(txn, pickledAccount => {
      const account = new global.Olm.Account();

      try {
        account.unpickle(this.pickleKey, pickledAccount);
        func(account);
      } finally {
        account.free();
      }
    });
  }
  /*
   * Saves an account to the crypto store.
   * This function requires a live transaction object from cryptoStore.doTxn()
   * and therefore may only be called in a doTxn() callback.
   *
   * @param {*} txn Opaque transaction object from cryptoStore.doTxn()
   * @param {object} Olm.Account object
   * @private
   */


  storeAccount(txn, account) {
    this.cryptoStore.storeAccount(txn, account.pickle(this.pickleKey));
  }
  /**
   * Export data for re-creating the Olm device later.
   * TODO export data other than just account and (P2P) sessions.
   *
   * @return {Promise<object>} The exported data
   */


  async export() {
    const result = {
      pickleKey: this.pickleKey
    };
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.cryptoStore.getAccount(txn, pickledAccount => {
        result.pickledAccount = pickledAccount;
      });
      result.sessions = []; // Note that the pickledSession object we get in the callback
      // is not exactly the same thing you get in method _getSession
      // see documentation of IndexedDBCryptoStore.getAllEndToEndSessions

      this.cryptoStore.getAllEndToEndSessions(txn, pickledSession => {
        result.sessions.push(pickledSession);
      });
    });
    return result;
  }
  /**
   * extract an OlmSession from the session store and call the given function
   * The session is usable only within the callback passed to this
   * function and will be freed as soon the callback returns. It is *not*
   * usable for the rest of the lifetime of the transaction.
   *
   * @param {string} deviceKey
   * @param {string} sessionId
   * @param {*} txn Opaque transaction object from cryptoStore.doTxn()
   * @param {function} func
   * @private
   */


  getSession(deviceKey, sessionId, txn, func) {
    this.cryptoStore.getEndToEndSession(deviceKey, sessionId, txn, sessionInfo => {
      this.unpickleSession(sessionInfo, func);
    });
  }
  /**
   * Creates a session object from a session pickle and executes the given
   * function with it. The session object is destroyed once the function
   * returns.
   *
   * @param {object} sessionInfo
   * @param {function} func
   * @private
   */


  unpickleSession(sessionInfo, func) {
    const session = new global.Olm.Session();

    try {
      session.unpickle(this.pickleKey, sessionInfo.session);
      const unpickledSessInfo = Object.assign({}, sessionInfo, {
        session
      });
      func(unpickledSessInfo);
    } finally {
      session.free();
    }
  }
  /**
   * store our OlmSession in the session store
   *
   * @param {string} deviceKey
   * @param {object} sessionInfo {session: OlmSession, lastReceivedMessageTs: int}
   * @param {*} txn Opaque transaction object from cryptoStore.doTxn()
   * @private
   */


  saveSession(deviceKey, sessionInfo, txn) {
    const sessionId = sessionInfo.session.session_id();
    const pickledSessionInfo = Object.assign(sessionInfo, {
      session: sessionInfo.session.pickle(this.pickleKey)
    });
    this.cryptoStore.storeEndToEndSession(deviceKey, sessionId, pickledSessionInfo, txn);
  }
  /**
   * get an OlmUtility and call the given function
   *
   * @param {function} func
   * @return {object} result of func
   * @private
   */


  getUtility(func) {
    const utility = new global.Olm.Utility();

    try {
      return func(utility);
    } finally {
      utility.free();
    }
  }
  /**
   * Signs a message with the ed25519 key for this account.
   *
   * @param {string} message  message to be signed
   * @return {Promise<string>} base64-encoded signature
   */


  async sign(message) {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        result = account.sign(message);
      });
    });
    return result;
  }
  /**
   * Get the current (unused, unpublished) one-time keys for this account.
   *
   * @return {object} one time keys; an object with the single property
   * <tt>curve25519</tt>, which is itself an object mapping key id to Curve25519
   * key.
   */


  async getOneTimeKeys() {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        result = JSON.parse(account.one_time_keys());
      });
    });
    return result;
  }
  /**
   * Get the maximum number of one-time keys we can store.
   *
   * @return {number} number of keys
   */


  maxNumberOfOneTimeKeys() {
    return this.maxOneTimeKeys;
  }
  /**
   * Marks all of the one-time keys as published.
   */


  async markKeysAsPublished() {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        account.mark_keys_as_published();
        this.storeAccount(txn, account);
      });
    });
  }
  /**
   * Generate some new one-time keys
   *
   * @param {number} numKeys number of keys to generate
   * @return {Promise} Resolved once the account is saved back having generated the keys
   */


  generateOneTimeKeys(numKeys) {
    return this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        account.generate_one_time_keys(numKeys);
        this.storeAccount(txn, account);
      });
    });
  }
  /**
   * Generate a new fallback keys
   *
   * @return {Promise} Resolved once the account is saved back having generated the key
   */


  async generateFallbackKey() {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        account.generate_fallback_key();
        this.storeAccount(txn, account);
      });
    });
  }

  async getFallbackKey() {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        result = JSON.parse(account.unpublished_fallback_key());
      });
    });
    return result;
  }

  async forgetOldFallbackKey() {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => {
      this.getAccount(txn, account => {
        account.forget_old_fallback_key();
        this.storeAccount(txn, account);
      });
    });
  }
  /**
   * Generate a new outbound session
   *
   * The new session will be stored in the cryptoStore.
   *
   * @param {string} theirIdentityKey remote user's Curve25519 identity key
   * @param {string} theirOneTimeKey  remote user's one-time Curve25519 key
   * @return {string} sessionId for the outbound session.
   */


  async createOutboundSession(theirIdentityKey, theirOneTimeKey) {
    let newSessionId;
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.getAccount(txn, account => {
        const session = new global.Olm.Session();

        try {
          session.create_outbound(account, theirIdentityKey, theirOneTimeKey);
          newSessionId = session.session_id();
          this.storeAccount(txn, account);
          const sessionInfo = {
            session,
            // Pretend we've received a message at this point, otherwise
            // if we try to send a message to the device, it won't use
            // this session
            lastReceivedMessageTs: Date.now()
          };
          this.saveSession(theirIdentityKey, sessionInfo, txn);
        } finally {
          session.free();
        }
      });
    }, _logger.logger.withPrefix("[createOutboundSession]"));
    return newSessionId;
  }
  /**
   * Generate a new inbound session, given an incoming message
   *
   * @param {string} theirDeviceIdentityKey remote user's Curve25519 identity key
   * @param {number} messageType  messageType field from the received message (must be 0)
   * @param {string} ciphertext base64-encoded body from the received message
   *
   * @return {{payload: string, session_id: string}} decrypted payload, and
   *     session id of new session
   *
   * @raises {Error} if the received message was not valid (for instance, it
   *     didn't use a valid one-time key).
   */


  async createInboundSession(theirDeviceIdentityKey, messageType, ciphertext) {
    if (messageType !== 0) {
      throw new Error("Need messageType == 0 to create inbound session");
    }

    let result; // eslint-disable-line camelcase

    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.getAccount(txn, account => {
        const session = new global.Olm.Session();

        try {
          session.create_inbound_from(account, theirDeviceIdentityKey, ciphertext);
          account.remove_one_time_keys(session);
          this.storeAccount(txn, account);
          const payloadString = session.decrypt(messageType, ciphertext);
          const sessionInfo = {
            session,
            // this counts as a received message: set last received message time
            // to now
            lastReceivedMessageTs: Date.now()
          };
          this.saveSession(theirDeviceIdentityKey, sessionInfo, txn);
          result = {
            payload: payloadString,
            session_id: session.session_id()
          };
        } finally {
          session.free();
        }
      });
    }, _logger.logger.withPrefix("[createInboundSession]"));
    return result;
  }
  /**
   * Get a list of known session IDs for the given device
   *
   * @param {string} theirDeviceIdentityKey Curve25519 identity key for the
   *     remote device
   * @return {Promise<string[]>}  a list of known session ids for the device
   */


  async getSessionIdsForDevice(theirDeviceIdentityKey) {
    const log = _logger.logger.withPrefix("[getSessionIdsForDevice]");

    if (this.sessionsInProgress[theirDeviceIdentityKey]) {
      log.debug(`Waiting for Olm session for ${theirDeviceIdentityKey} to be created`);

      try {
        await this.sessionsInProgress[theirDeviceIdentityKey];
      } catch (e) {// if the session failed to be created, just fall through and
        // return an empty result
      }
    }

    let sessionIds;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.cryptoStore.getEndToEndSessions(theirDeviceIdentityKey, txn, sessions => {
        sessionIds = Object.keys(sessions);
      });
    }, log);
    return sessionIds;
  }
  /**
   * Get the right olm session id for encrypting messages to the given identity key
   *
   * @param {string} theirDeviceIdentityKey Curve25519 identity key for the
   *     remote device
   * @param {boolean} nowait Don't wait for an in-progress session to complete.
   *     This should only be set to true of the calling function is the function
   *     that marked the session as being in-progress.
   * @param {Logger} [log] A possibly customised log
   * @return {Promise<?string>}  session id, or null if no established session
   */


  async getSessionIdForDevice(theirDeviceIdentityKey, nowait = false, log) {
    const sessionInfos = await this.getSessionInfoForDevice(theirDeviceIdentityKey, nowait, log);

    if (sessionInfos.length === 0) {
      return null;
    } // Use the session that has most recently received a message


    let idxOfBest = 0;

    for (let i = 1; i < sessionInfos.length; i++) {
      const thisSessInfo = sessionInfos[i];
      const thisLastReceived = thisSessInfo.lastReceivedMessageTs === undefined ? 0 : thisSessInfo.lastReceivedMessageTs;
      const bestSessInfo = sessionInfos[idxOfBest];
      const bestLastReceived = bestSessInfo.lastReceivedMessageTs === undefined ? 0 : bestSessInfo.lastReceivedMessageTs;

      if (thisLastReceived > bestLastReceived || thisLastReceived === bestLastReceived && thisSessInfo.sessionId < bestSessInfo.sessionId) {
        idxOfBest = i;
      }
    }

    return sessionInfos[idxOfBest].sessionId;
  }
  /**
   * Get information on the active Olm sessions for a device.
   * <p>
   * Returns an array, with an entry for each active session. The first entry in
   * the result will be the one used for outgoing messages. Each entry contains
   * the keys 'hasReceivedMessage' (true if the session has received an incoming
   * message and is therefore past the pre-key stage), and 'sessionId'.
   *
   * @param {string} deviceIdentityKey Curve25519 identity key for the device
   * @param {boolean} nowait Don't wait for an in-progress session to complete.
   *     This should only be set to true of the calling function is the function
   *     that marked the session as being in-progress.
   * @param {Logger} [log] A possibly customised log
   * @return {Array.<{sessionId: string, hasReceivedMessage: boolean}>}
   */


  async getSessionInfoForDevice(deviceIdentityKey, nowait = false, log = _logger.logger) {
    log = log.withPrefix("[getSessionInfoForDevice]");

    if (this.sessionsInProgress[deviceIdentityKey] && !nowait) {
      log.debug(`Waiting for Olm session for ${deviceIdentityKey} to be created`);

      try {
        await this.sessionsInProgress[deviceIdentityKey];
      } catch (e) {// if the session failed to be created, then just fall through and
        // return an empty result
      }
    }

    const info = [];
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.cryptoStore.getEndToEndSessions(deviceIdentityKey, txn, sessions => {
        const sessionIds = Object.keys(sessions).sort();

        for (const sessionId of sessionIds) {
          this.unpickleSession(sessions[sessionId], sessInfo => {
            info.push({
              lastReceivedMessageTs: sessInfo.lastReceivedMessageTs,
              hasReceivedMessage: sessInfo.session.has_received_message(),
              sessionId: sessionId
            });
          });
        }
      });
    }, log);
    return info;
  }
  /**
   * Encrypt an outgoing message using an existing session
   *
   * @param {string} theirDeviceIdentityKey Curve25519 identity key for the
   *     remote device
   * @param {string} sessionId  the id of the active session
   * @param {string} payloadString  payload to be encrypted and sent
   *
   * @return {Promise<string>} ciphertext
   */


  async encryptMessage(theirDeviceIdentityKey, sessionId, payloadString) {
    checkPayloadLength(payloadString);
    let res;
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.getSession(theirDeviceIdentityKey, sessionId, txn, sessionInfo => {
        const sessionDesc = sessionInfo.session.describe();

        _logger.logger.log("encryptMessage: Olm Session ID " + sessionId + " to " + theirDeviceIdentityKey + ": " + sessionDesc);

        res = sessionInfo.session.encrypt(payloadString);
        this.saveSession(theirDeviceIdentityKey, sessionInfo, txn);
      });
    }, _logger.logger.withPrefix("[encryptMessage]"));
    return res;
  }
  /**
   * Decrypt an incoming message using an existing session
   *
   * @param {string} theirDeviceIdentityKey Curve25519 identity key for the
   *     remote device
   * @param {string} sessionId  the id of the active session
   * @param {number} messageType  messageType field from the received message
   * @param {string} ciphertext base64-encoded body from the received message
   *
   * @return {Promise<string>} decrypted payload.
   */


  async decryptMessage(theirDeviceIdentityKey, sessionId, messageType, ciphertext) {
    let payloadString;
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.getSession(theirDeviceIdentityKey, sessionId, txn, sessionInfo => {
        const sessionDesc = sessionInfo.session.describe();

        _logger.logger.log("decryptMessage: Olm Session ID " + sessionId + " from " + theirDeviceIdentityKey + ": " + sessionDesc);

        payloadString = sessionInfo.session.decrypt(messageType, ciphertext);
        sessionInfo.lastReceivedMessageTs = Date.now();
        this.saveSession(theirDeviceIdentityKey, sessionInfo, txn);
      });
    }, _logger.logger.withPrefix("[decryptMessage]"));
    return payloadString;
  }
  /**
   * Determine if an incoming messages is a prekey message matching an existing session
   *
   * @param {string} theirDeviceIdentityKey Curve25519 identity key for the
   *     remote device
   * @param {string} sessionId  the id of the active session
   * @param {number} messageType  messageType field from the received message
   * @param {string} ciphertext base64-encoded body from the received message
   *
   * @return {Promise<boolean>} true if the received message is a prekey message which matches
   *    the given session.
   */


  async matchesSession(theirDeviceIdentityKey, sessionId, messageType, ciphertext) {
    if (messageType !== 0) {
      return false;
    }

    let matches;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => {
      this.getSession(theirDeviceIdentityKey, sessionId, txn, sessionInfo => {
        matches = sessionInfo.session.matches_inbound(ciphertext);
      });
    }, _logger.logger.withPrefix("[matchesSession]"));
    return matches;
  }

  async recordSessionProblem(deviceKey, type, fixed) {
    await this.cryptoStore.storeEndToEndSessionProblem(deviceKey, type, fixed);
  }

  sessionMayHaveProblems(deviceKey, timestamp) {
    return this.cryptoStore.getEndToEndSessionProblem(deviceKey, timestamp);
  }

  filterOutNotifiedErrorDevices(devices) {
    return this.cryptoStore.filterOutNotifiedErrorDevices(devices);
  } // Outbound group session
  // ======================

  /**
   * store an OutboundGroupSession in outboundGroupSessionStore
   *
   * @param {Olm.OutboundGroupSession} session
   * @private
   */


  saveOutboundGroupSession(session) {
    this.outboundGroupSessionStore[session.session_id()] = session.pickle(this.pickleKey);
  }
  /**
   * extract an OutboundGroupSession from outboundGroupSessionStore and call the
   * given function
   *
   * @param {string} sessionId
   * @param {function} func
   * @return {object} result of func
   * @private
   */


  getOutboundGroupSession(sessionId, func) {
    const pickled = this.outboundGroupSessionStore[sessionId];

    if (pickled === undefined) {
      throw new Error("Unknown outbound group session " + sessionId);
    }

    const session = new global.Olm.OutboundGroupSession();

    try {
      session.unpickle(this.pickleKey, pickled);
      return func(session);
    } finally {
      session.free();
    }
  }
  /**
   * Generate a new outbound group session
   *
   * @return {string} sessionId for the outbound session.
   */


  createOutboundGroupSession() {
    const session = new global.Olm.OutboundGroupSession();

    try {
      session.create();
      this.saveOutboundGroupSession(session);
      return session.session_id();
    } finally {
      session.free();
    }
  }
  /**
   * Encrypt an outgoing message with an outbound group session
   *
   * @param {string} sessionId  the id of the outboundgroupsession
   * @param {string} payloadString  payload to be encrypted and sent
   *
   * @return {string} ciphertext
   */


  encryptGroupMessage(sessionId, payloadString) {
    _logger.logger.log(`encrypting msg with megolm session ${sessionId}`);

    checkPayloadLength(payloadString);
    return this.getOutboundGroupSession(sessionId, session => {
      const res = session.encrypt(payloadString);
      this.saveOutboundGroupSession(session);
      return res;
    });
  }
  /**
   * Get the session keys for an outbound group session
   *
   * @param {string} sessionId  the id of the outbound group session
   *
   * @return {{chain_index: number, key: string}} current chain index, and
   *     base64-encoded secret key.
   */


  getOutboundGroupSessionKey(sessionId) {
    return this.getOutboundGroupSession(sessionId, function (session) {
      return {
        chain_index: session.message_index(),
        key: session.session_key()
      };
    });
  } // Inbound group session
  // =====================

  /**
   * Unpickle a session from a sessionData object and invoke the given function.
   * The session is valid only until func returns.
   *
   * @param {Object} sessionData Object describing the session.
   * @param {function(Olm.InboundGroupSession)} func Invoked with the unpickled session
   * @return {*} result of func
   */


  unpickleInboundGroupSession(sessionData, func) {
    const session = new global.Olm.InboundGroupSession();

    try {
      session.unpickle(this.pickleKey, sessionData.session);
      return func(session);
    } finally {
      session.free();
    }
  }
  /**
   * extract an InboundGroupSession from the crypto store and call the given function
   *
   * @param {string} roomId The room ID to extract the session for, or null to fetch
   *     sessions for any room.
   * @param {string} senderKey
   * @param {string} sessionId
   * @param {*} txn Opaque transaction object from cryptoStore.doTxn()
   * @param {function(Olm.InboundGroupSession, InboundGroupSessionData)} func
   *   function to call.
   *
   * @private
   */


  getInboundGroupSession(roomId, senderKey, sessionId, txn, func) {
    this.cryptoStore.getEndToEndInboundGroupSession(senderKey, sessionId, txn, (sessionData, withheld) => {
      if (sessionData === null) {
        func(null, null, withheld);
        return;
      } // if we were given a room ID, check that the it matches the original one for the session. This stops
      // the HS pretending a message was targeting a different room.


      if (roomId !== null && roomId !== sessionData.room_id) {
        throw new Error("Mismatched room_id for inbound group session (expected " + sessionData.room_id + ", was " + roomId + ")");
      }

      this.unpickleInboundGroupSession(sessionData, session => {
        func(session, sessionData, withheld);
      });
    });
  }
  /**
   * Add an inbound group session to the session store
   *
   * @param {string} roomId     room in which this session will be used
   * @param {string} senderKey  base64-encoded curve25519 key of the sender
   * @param {Array<string>} forwardingCurve25519KeyChain  Devices involved in forwarding
   *     this session to us.
   * @param {string} sessionId  session identifier
   * @param {string} sessionKey base64-encoded secret key
   * @param {Object<string, string>} keysClaimed Other keys the sender claims.
   * @param {boolean} exportFormat true if the megolm keys are in export format
   *    (ie, they lack an ed25519 signature)
   * @param {Object} [extraSessionData={}] any other data to be include with the session
   */


  async addInboundGroupSession(roomId, senderKey, forwardingCurve25519KeyChain, sessionId, sessionKey, keysClaimed, exportFormat, extraSessionData = {}) {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SHARED_HISTORY_INBOUND_GROUP_SESSIONS], txn => {
      /* if we already have this session, consider updating it */
      this.getInboundGroupSession(roomId, senderKey, sessionId, txn, (existingSession, existingSessionData) => {
        // new session.
        const session = new global.Olm.InboundGroupSession();

        try {
          if (exportFormat) {
            session.import_session(sessionKey);
          } else {
            session.create(sessionKey);
          }

          if (sessionId != session.session_id()) {
            throw new Error("Mismatched group session ID from senderKey: " + senderKey);
          }

          if (existingSession) {
            _logger.logger.log("Update for megolm session " + senderKey + "/" + sessionId);

            if (existingSession.first_known_index() <= session.first_known_index() && !(existingSession.first_known_index() == session.first_known_index() && !extraSessionData.untrusted && existingSessionData.untrusted)) {
              // existing session has lower index (i.e. can
              // decrypt more), or they have the same index and
              // the new sessions trust does not win over the old
              // sessions trust, so keep it
              _logger.logger.log(`Keeping existing megolm session ${sessionId}`);

              return;
            }
          }

          _logger.logger.info("Storing megolm session " + senderKey + "/" + sessionId + " with first index " + session.first_known_index());

          const sessionData = Object.assign({}, extraSessionData, {
            room_id: roomId,
            session: session.pickle(this.pickleKey),
            keysClaimed: keysClaimed,
            forwardingCurve25519KeyChain: forwardingCurve25519KeyChain
          });
          this.cryptoStore.storeEndToEndInboundGroupSession(senderKey, sessionId, sessionData, txn);

          if (!existingSession && extraSessionData.sharedHistory) {
            this.cryptoStore.addSharedHistoryInboundGroupSession(roomId, senderKey, sessionId, txn);
          }
        } finally {
          session.free();
        }
      });
    }, _logger.logger.withPrefix("[addInboundGroupSession]"));
  }
  /**
   * Record in the data store why an inbound group session was withheld.
   *
   * @param {string} roomId     room that the session belongs to
   * @param {string} senderKey  base64-encoded curve25519 key of the sender
   * @param {string} sessionId  session identifier
   * @param {string} code       reason code
   * @param {string} reason     human-readable version of `code`
   */


  async addInboundGroupSessionWithheld(roomId, senderKey, sessionId, code, reason) {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD], txn => {
      this.cryptoStore.storeEndToEndInboundGroupSessionWithheld(senderKey, sessionId, {
        room_id: roomId,
        code: code,
        reason: reason
      }, txn);
    });
  }
  /**
   * Decrypt a received message with an inbound group session
   *
   * @param {string} roomId    room in which the message was received
   * @param {string} senderKey base64-encoded curve25519 key of the sender
   * @param {string} sessionId session identifier
   * @param {string} body      base64-encoded body of the encrypted message
   * @param {string} eventId   ID of the event being decrypted
   * @param {Number} timestamp timestamp of the event being decrypted
   *
   * @return {null} the sessionId is unknown
   *
   * @return {Promise<{result: string, senderKey: string,
   *    forwardingCurve25519KeyChain: Array<string>,
   *    keysClaimed: Object<string, string>}>}
   */


  async decryptGroupMessage(roomId, senderKey, sessionId, body, eventId, timestamp) {
    let result; // when the localstorage crypto store is used as an indexeddb backend,
    // exceptions thrown from within the inner function are not passed through
    // to the top level, so we store exceptions in a variable and raise them at
    // the end

    let error;
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD], txn => {
      this.getInboundGroupSession(roomId, senderKey, sessionId, txn, (session, sessionData, withheld) => {
        if (session === null) {
          if (withheld) {
            error = new algorithms.DecryptionError("MEGOLM_UNKNOWN_INBOUND_SESSION_ID", calculateWithheldMessage(withheld), {
              session: senderKey + '|' + sessionId
            });
          }

          result = null;
          return;
        }

        let res;

        try {
          res = session.decrypt(body);
        } catch (e) {
          if (e && e.message === 'OLM.UNKNOWN_MESSAGE_INDEX' && withheld) {
            error = new algorithms.DecryptionError("MEGOLM_UNKNOWN_INBOUND_SESSION_ID", calculateWithheldMessage(withheld), {
              session: senderKey + '|' + sessionId
            });
          } else {
            error = e;
          }

          return;
        }

        let plaintext = res.plaintext;

        if (plaintext === undefined) {
          // Compatibility for older olm versions.
          plaintext = res;
        } else {
          // Check if we have seen this message index before to detect replay attacks.
          // If the event ID and timestamp are specified, and the match the event ID
          // and timestamp from the last time we used this message index, then we
          // don't consider it a replay attack.
          const messageIndexKey = senderKey + "|" + sessionId + "|" + res.message_index;

          if (messageIndexKey in this.inboundGroupSessionMessageIndexes) {
            const msgInfo = this.inboundGroupSessionMessageIndexes[messageIndexKey];

            if (msgInfo.id !== eventId || msgInfo.timestamp !== timestamp) {
              error = new Error("Duplicate message index, possible replay attack: " + messageIndexKey);
              return;
            }
          }

          this.inboundGroupSessionMessageIndexes[messageIndexKey] = {
            id: eventId,
            timestamp: timestamp
          };
        }

        sessionData.session = session.pickle(this.pickleKey);
        this.cryptoStore.storeEndToEndInboundGroupSession(senderKey, sessionId, sessionData, txn);
        result = {
          result: plaintext,
          keysClaimed: sessionData.keysClaimed || {},
          senderKey: senderKey,
          forwardingCurve25519KeyChain: sessionData.forwardingCurve25519KeyChain || [],
          untrusted: sessionData.untrusted
        };
      });
    }, _logger.logger.withPrefix("[decryptGroupMessage]"));

    if (error) {
      throw error;
    }

    return result;
  }
  /**
   * Determine if we have the keys for a given megolm session
   *
   * @param {string} roomId    room in which the message was received
   * @param {string} senderKey base64-encoded curve25519 key of the sender
   * @param {string} sessionId session identifier
   *
   * @returns {Promise<boolean>} true if we have the keys to this session
   */


  async hasInboundSessionKeys(roomId, senderKey, sessionId) {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD], txn => {
      this.cryptoStore.getEndToEndInboundGroupSession(senderKey, sessionId, txn, sessionData => {
        if (sessionData === null) {
          result = false;
          return;
        }

        if (roomId !== sessionData.room_id) {
          _logger.logger.warn(`requested keys for inbound group session ${senderKey}|` + `${sessionId}, with incorrect room_id ` + `(expected ${sessionData.room_id}, ` + `was ${roomId})`);

          result = false;
        } else {
          result = true;
        }
      });
    }, _logger.logger.withPrefix("[hasInboundSessionKeys]"));
    return result;
  }
  /**
   * Extract the keys to a given megolm session, for sharing
   *
   * @param {string} roomId    room in which the message was received
   * @param {string} senderKey base64-encoded curve25519 key of the sender
   * @param {string} sessionId session identifier
   * @param {number} chainIndex The chain index at which to export the session.
   *     If omitted, export at the first index we know about.
   *
   * @returns {Promise<{chain_index: number, key: string,
   *        forwarding_curve25519_key_chain: Array<string>,
   *        sender_claimed_ed25519_key: string
   *    }>}
   *    details of the session key. The key is a base64-encoded megolm key in
   *    export format.
   *
   * @throws Error If the given chain index could not be obtained from the known
   *     index (ie. the given chain index is before the first we have).
   */


  async getInboundGroupSessionKey(roomId, senderKey, sessionId, chainIndex) {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS, _indexeddbCryptoStore.IndexedDBCryptoStore.STORE_INBOUND_GROUP_SESSIONS_WITHHELD], txn => {
      this.getInboundGroupSession(roomId, senderKey, sessionId, txn, (session, sessionData) => {
        if (session === null) {
          result = null;
          return;
        }

        if (chainIndex === undefined) {
          chainIndex = session.first_known_index();
        }

        const exportedSession = session.export_session(chainIndex);
        const claimedKeys = sessionData.keysClaimed || {};
        const senderEd25519Key = claimedKeys.ed25519 || null;
        result = {
          "chain_index": chainIndex,
          "key": exportedSession,
          "forwarding_curve25519_key_chain": sessionData.forwardingCurve25519KeyChain || [],
          "sender_claimed_ed25519_key": senderEd25519Key,
          "shared_history": sessionData.sharedHistory || false
        };
      });
    }, _logger.logger.withPrefix("[getInboundGroupSessionKey]"));
    return result;
  }
  /**
   * Export an inbound group session
   *
   * @param {string} senderKey base64-encoded curve25519 key of the sender
   * @param {string} sessionId session identifier
   * @param {ISessionInfo} sessionData The session object from the store
   * @return {module:crypto/OlmDevice.MegolmSessionData} exported session data
   */


  exportInboundGroupSession(senderKey, sessionId, sessionData) {
    return this.unpickleInboundGroupSession(sessionData, session => {
      const messageIndex = session.first_known_index();
      return {
        "sender_key": senderKey,
        "sender_claimed_keys": sessionData.keysClaimed,
        "room_id": sessionData.room_id,
        "session_id": sessionId,
        "session_key": session.export_session(messageIndex),
        "forwarding_curve25519_key_chain": sessionData.forwardingCurve25519KeyChain || [],
        "first_known_index": session.first_known_index(),
        "org.matrix.msc3061.shared_history": sessionData.sharedHistory || false
      };
    });
  }

  async getSharedHistoryInboundGroupSessions(roomId) {
    let result;
    await this.cryptoStore.doTxn('readonly', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SHARED_HISTORY_INBOUND_GROUP_SESSIONS], txn => {
      result = this.cryptoStore.getSharedHistoryInboundGroupSessions(roomId, txn);
    }, _logger.logger.withPrefix("[getSharedHistoryInboundGroupSessionsForRoom]"));
    return result;
  } // Utilities
  // =========

  /**
   * Verify an ed25519 signature.
   *
   * @param {string} key ed25519 key
   * @param {string} message message which was signed
   * @param {string} signature base64-encoded signature to be checked
   *
   * @raises {Error} if there is a problem with the verification. If the key was
   * too small then the message will be "OLM.INVALID_BASE64". If the signature
   * was invalid then the message will be "OLM.BAD_MESSAGE_MAC".
   */


  verifySignature(key, message, signature) {
    this.getUtility(function (util) {
      util.ed25519_verify(key, message, signature);
    });
  }

}

exports.OlmDevice = OlmDevice;
const WITHHELD_MESSAGES = {
  "m.unverified": "The sender has disabled encrypting to unverified devices.",
  "m.blacklisted": "The sender has blocked you.",
  "m.unauthorised": "You are not authorised to read the message.",
  "m.no_olm": "Unable to establish a secure channel."
};
/**
 * Calculate the message to use for the exception when a session key is withheld.
 *
 * @param {object} withheld  An object that describes why the key was withheld.
 *
 * @return {string} the message
 *
 * @private
 */

exports.WITHHELD_MESSAGES = WITHHELD_MESSAGES;

function calculateWithheldMessage(withheld) {
  if (withheld.code && withheld.code in WITHHELD_MESSAGES) {
    return WITHHELD_MESSAGES[withheld.code];
  } else if (withheld.reason) {
    return withheld.reason;
  } else {
    return "decryption key withheld";
  }
}