// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Keys} from "../src/lib/Keys.sol";

contract KeysHarness {
    function isValid(bytes32 k) external pure returns (bool) {
        return Keys.isValidKey(k);
    }
}

contract KeysTest is Test {
    KeysHarness internal h = new KeysHarness();

    function test_validKeys() public view {
        assertTrue(h.isValid("solidity"));
        assertTrue(h.isValid("next.js"));
        assertTrue(h.isValid("c++"));
        assertTrue(h.isValid("c#"));
        assertTrue(h.isValid("ui-design"));
        assertTrue(h.isValid("abcdefghijklmnopqrstuvwxyz012345")); // 32 chars
    }

    function test_invalidKeys() public view {
        assertFalse(h.isValid(bytes32(0)));
        assertFalse(h.isValid("Solidity"));
        assertFalse(h.isValid("ui design"));
        assertFalse(h.isValid(bytes32(uint256(1)))); // leading zero, trailing data
        assertFalse(h.isValid(bytes32(abi.encodePacked(bytes2("ab"), bytes1(0), bytes1("c")))));
    }

    /// Any key built only from allowed characters, left-aligned, is valid.
    function testFuzz_allowedCharsValid(bytes32 seed, uint8 len) public view {
        bytes memory alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-.+#";
        uint256 n = bound(len, 1, 32);
        bytes32 k;
        for (uint256 i; i < n; ++i) {
            bytes1 c = alphabet[uint8(seed[i]) % alphabet.length];
            k |= bytes32(c) >> (i * 8);
        }
        assertTrue(h.isValid(k));
    }

    /// Any uppercase byte anywhere makes the key invalid.
    function testFuzz_uppercaseInvalid(uint8 pos, uint8 upper) public view {
        uint256 p = bound(pos, 0, 31);
        bytes1 c = bytes1(uint8(bound(upper, 0x41, 0x5a)));
        bytes32 k = bytes32("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        bytes32 mask = ~(bytes32(bytes1(0xff)) >> (p * 8));
        k = (k & mask) | (bytes32(c) >> (p * 8));
        assertFalse(h.isValid(k));
    }
}
