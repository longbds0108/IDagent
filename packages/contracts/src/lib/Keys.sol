// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Keys
/// @notice Validation helpers for normalized short keys and bounded metadata references.
/// @dev A normalized key is a left-aligned ASCII string packed into bytes32, e.g. "solidity",
///      "next.js", "c++", "ui-design". Allowed characters: a-z 0-9 - . + #
///      It must be non-empty and all bytes after the first zero byte must be zero.
library Keys {
    uint256 internal constant MAX_URI_LENGTH = 256;

    error InvalidKey(bytes32 key);
    error InvalidURI();
    error InvalidHash();

    function isValidKey(bytes32 key) internal pure returns (bool) {
        if (key[0] == 0) return false;
        bool ended;
        for (uint256 i; i < 32; ++i) {
            bytes1 c = key[i];
            if (c == 0) {
                ended = true;
                continue;
            }
            if (ended) return false;
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x2d // -
                || c == 0x2e // .
                || c == 0x2b // +
                || c == 0x23; // #
            if (!ok) return false;
        }
        return true;
    }

    function requireKey(bytes32 key) internal pure {
        if (!isValidKey(key)) revert InvalidKey(key);
    }

    function requireURI(string calldata uri) internal pure {
        uint256 len = bytes(uri).length;
        if (len == 0 || len > MAX_URI_LENGTH) revert InvalidURI();
    }

    function requireHash(bytes32 h) internal pure {
        if (h == bytes32(0)) revert InvalidHash();
    }
}
